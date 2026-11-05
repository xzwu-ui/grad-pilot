#!/usr/bin/env python3
"""Conditionally compile school-specific SoPs and lint cross-school contamination."""

from __future__ import annotations

import argparse
import copy
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, TemplateError

ROOT = Path(__file__).resolve().parents[1]
ENGINE_DIR = ROOT / "sop-engine"
sys.path.insert(0, str(ROOT / "scripts"))

from common import (  # noqa: E402
    EXAMPLE_DATA,
    GradPilotError,
    find_school,
    load_database,
    load_profile,
    load_yaml,
)


@dataclass(frozen=True)
class Issue:
    severity: str
    code: str
    line: int
    message: str


def tex(value: Any) -> str:
    """Escape plain text for LaTeX while retaining Unicode for XeLaTeX."""
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(character, character) for character in str(value))


def jinja_environment(template_dir: Path) -> Environment:
    environment = Environment(
        loader=FileSystemLoader(template_dir),
        block_start_string="[%",
        block_end_string="%]",
        variable_start_string="[[",
        variable_end_string="]]",
        comment_start_string="[#",
        comment_end_string="#]",
        trim_blocks=True,
        lstrip_blocks=True,
        autoescape=False,
        undefined=StrictUndefined,
        keep_trailing_newline=True,
    )
    environment.filters["tex"] = tex
    return environment


def select_metadata(base: dict[str, Any], track: str | None) -> dict[str, Any]:
    selected = copy.deepcopy(base)
    variants = selected.pop("track_variants", {})
    if track:
        if track not in variants:
            available = ", ".join(sorted(variants)) or "none"
            raise GradPilotError(
                f"Track {track} is not configured for this school; alternatives: {available}. "
                "Add a fully reviewed track_variants entry instead of changing only its label."
            )
        variant = variants[track]
        selected.update(copy.deepcopy(variant))
        selected["track_type"] = track
    return selected


def resolve_pis(
    school: dict[str, Any], metadata: dict[str, Any]
) -> list[dict[str, Any]]:
    by_id = {pi["id"]: pi for pi in school.get("target_pis", [])}
    resolved = []
    for pi_id in metadata.get("target_pis", []):
        if pi_id not in by_id:
            raise GradPilotError(
                f"schools_meta.yaml references unknown PI {pi_id!r} for {school['id']}"
            )
        resolved.append(copy.deepcopy(by_id[pi_id]))
    if not resolved:
        raise GradPilotError(f"No target PIs configured for {school['id']}")
    return resolved


def render_sop(
    school: dict[str, Any],
    metadata: dict[str, Any],
    profile: dict[str, Any],
    template_name: str = "main_sop.tex",
) -> str:
    expected_track = school.get("track_type")
    if metadata["track_type"] == expected_track and metadata.get("program_name") != school.get(
        "program_name"
    ):
        raise GradPilotError(
            f"Metadata drift for {school['id']}: program_name differs from applications.json"
        )
    target_pis = resolve_pis(school, metadata)
    applicant = copy.deepcopy(profile.get("applicant", {}))
    applicant.setdefault("target_term", "2028 Fall")
    school_context = copy.deepcopy(metadata)
    school_context.update(
        {
            "id": school["id"],
            "name": school["name"],
            "aliases": school.get("aliases", []),
        }
    )
    try:
        template = jinja_environment(ENGINE_DIR).get_template(template_name)
        return template.render(
            school=school_context,
            applicant=applicant,
            profile=profile,
            target_pis=target_pis,
        )
    except TemplateError as exc:
        raise GradPilotError(f"Template rendering failed for {school['id']}: {exc}") from exc


def line_number(text: str, position: int) -> int:
    return text.count("\n", 0, position) + 1


def lint_sop(
    rendered: str,
    school: dict[str, Any],
    metadata: dict[str, Any],
    all_schools: list[dict[str, Any]],
    global_banned_terms: list[str],
) -> list[Issue]:
    issues: list[Issue] = []
    own_names = {
        str(value).casefold()
        for value in [school["id"], school["name"], *school.get("aliases", [])]
    }
    banned: list[tuple[str, str]] = []
    for other in all_schools:
        if other["id"] == school["id"]:
            continue
        for term in [other["name"], *other.get("aliases", [])]:
            if str(term).casefold() not in own_names:
                banned.append((str(term), f"cross-school reference: {other['name']}"))
    banned.extend((term, "global banned term") for term in global_banned_terms)
    banned.extend((term, "school-specific banned term") for term in metadata.get("banned_terms", []))

    seen_rules = set()
    for term, reason in banned:
        rule_key = (term.casefold(), reason)
        if not term or rule_key in seen_rules:
            continue
        seen_rules.add(rule_key)
        pattern = re.compile(
            r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?![A-Za-z0-9])", re.IGNORECASE
        )
        for match in pattern.finditer(rendered):
            issues.append(
                Issue(
                    "error",
                    "BANNED_TERM",
                    line_number(rendered, match.start()),
                    f"{reason}: found {match.group(0)!r}",
                )
            )

    for marker in ("[[", "]]", "[%", "%]"):
        position = rendered.find(marker)
        if position >= 0:
            issues.append(
                Issue(
                    "error",
                    "UNRENDERED_TEMPLATE",
                    line_number(rendered, position),
                    f"unrendered Jinja marker {marker!r}",
                )
            )

    warning_patterns = {
        "IDENTITY_PLACEHOLDER": r"\bYour Name\b|你的姓名",
        "URL_PLACEHOLDER": r"yourname|replace-with-demo-id|example\.com",
        "GENERIC_PROGRAM": r"Robotics and Embodied AI",
    }
    for code, pattern in warning_patterns.items():
        for match in re.finditer(pattern, rendered, re.IGNORECASE):
            issues.append(
                Issue(
                    "warning",
                    code,
                    line_number(rendered, match.start()),
                    f"review before submission: found {match.group(0)!r}",
                )
            )

    target_term = metadata.get("target_term")
    if target_term and target_term not in rendered:
        issues.append(Issue("error", "MISSING_TERM", 1, f"target term {target_term!r} is absent"))
    if not metadata.get("target_pis"):
        issues.append(Issue("error", "NO_PI", 1, "no school-specific target PI was rendered"))
    return issues


def word_count(rendered: str) -> int:
    text = re.sub(r"(?<!\\)%.*", "", rendered)
    text = re.sub(r"\\(?:hypersetup|fancyhead|fancyfoot|definecolor|usepackage|documentclass)(?:\[[^]]*\])?\{[^{}]*\}(?:\{[^{}]*\})?", "", text)
    text = re.sub(r"\\[A-Za-z@]+\*?(?:\[[^]]*\])?", " ", text)
    text = re.sub(r"[{}&]", " ", text)
    return len(re.findall(r"\b[A-Za-z0-9][A-Za-z0-9'’.-]*\b", text))


def compile_pdf(tex_path: Path, engine: str, required: bool) -> tuple[Path | None, str | None]:
    executable = shutil.which(engine)
    if not executable:
        message = f"{engine} not found; rendered .tex is available at {tex_path}"
        if required:
            raise GradPilotError(message)
        return None, message
    command = [
        executable,
        "-interaction=nonstopmode",
        "-halt-on-error",
        f"-output-directory={tex_path.parent}",
        tex_path.name,
    ]
    result = subprocess.run(
        command,
        cwd=tex_path.parent,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=180,
        check=False,
    )
    if result.returncode != 0:
        tail = "\n".join(result.stdout.splitlines()[-35:])
        raise GradPilotError(f"{engine} failed for {tex_path.name}:\n{tail}")
    return tex_path.with_suffix(".pdf"), None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--school", help="School id, name or alias")
    selection.add_argument("--all", action="store_true", help="Build every configured school")
    parser.add_argument("--track", choices=("CS", "Robotics", "ME"), help="Explicit track variant")
    parser.add_argument("--data", help="Application JSON path")
    parser.add_argument("--profile", help="Profile YAML path")
    parser.add_argument("--meta", type=Path, default=ENGINE_DIR / "schools_meta.yaml")
    parser.add_argument("--out-dir", type=Path, default=ROOT / "dist" / "sop")
    parser.add_argument("--engine", choices=("xelatex", "pdflatex"), default="xelatex")
    parser.add_argument("--no-pdf", action="store_true", help="Render .tex without invoking LaTeX")
    parser.add_argument("--lint-only", action="store_true", help="Render and lint in memory only")
    parser.add_argument("--require-pdf", action="store_true", help="Fail if LaTeX is unavailable")
    parser.add_argument("--strict", action="store_true", help="Treat lint warnings as build failures")
    parser.add_argument("--clean", action="store_true", help="Remove only dist/sop and exit")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.clean:
            target = (ROOT / "dist" / "sop").resolve()
            expected_parent = (ROOT / "dist").resolve()
            if target.parent != expected_parent:
                raise GradPilotError("Refusing to clean an unexpected path")
            if target.exists():
                shutil.rmtree(target)
            print(f"Removed generated SoP directory if present: {target}")
            return 0
        if not args.school and not args.all:
            raise GradPilotError("Choose --school ID or --all.")
        if args.track and not args.school:
            raise GradPilotError("--track requires a single --school selection.")
        if args.require_pdf and args.no_pdf:
            raise GradPilotError("--require-pdf and --no-pdf cannot be combined.")

        data, data_path = load_database(args.data)
        profile, profile_path = load_profile(args.profile)
        meta_document = load_yaml(args.meta)
        meta_schools = meta_document.get("schools", {})
        selected = (
            [find_school(data, args.school)] if args.school else list(data.get("schools", []))
        )
        args.out_dir.mkdir(parents=True, exist_ok=True)
        failed = False
        for school in selected:
            if school["id"] not in meta_schools:
                raise GradPilotError(f"Missing schools_meta.yaml entry for {school['id']}")
            metadata = select_metadata(meta_schools[school["id"]], args.track)
            metadata["target_term"] = profile.get("applicant", {}).get(
                "target_term", data["cycle"]["target_term"]
            )
            rendered = render_sop(school, metadata, profile)
            issues = lint_sop(
                rendered,
                school,
                metadata,
                data["schools"],
                meta_document.get("global_banned_terms", []),
            )
            suffix = f"-{metadata['track_type'].lower()}" if args.track else ""
            tex_path = args.out_dir / f"{school['id']}{suffix}.tex"
            if not args.lint_only:
                tex_path.write_text(rendered, encoding="utf-8", newline="\n")
            errors = [issue for issue in issues if issue.severity == "error"]
            warnings = [issue for issue in issues if issue.severity == "warning"]
            print(
                f"\n{school['name']} · {metadata['track_type']} · {word_count(rendered)} words · "
                f"{len(errors)} error(s), {len(warnings)} warning(s)"
            )
            for issue in issues:
                print(f"  {issue.severity.upper()} line {issue.line} [{issue.code}] {issue.message}")
            if errors or (args.strict and warnings):
                failed = True
                continue
            if not args.lint_only and not args.no_pdf:
                pdf_path, warning = compile_pdf(tex_path, args.engine, args.require_pdf)
                if warning:
                    print(f"  WARNING {warning}")
                elif pdf_path:
                    print(f"  PDF: {pdf_path}")
            elif not args.lint_only:
                print(f"  TeX: {tex_path}")

        print(f"\nData: {data_path}\nProfile: {profile_path}")
        if data_path == EXAMPLE_DATA:
            print("Public example data used; verify all deadlines, PI affiliations and claims.")
        return 1 if failed else 0
    except (GradPilotError, OSError, subprocess.TimeoutExpired) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
