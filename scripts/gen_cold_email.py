#!/usr/bin/env python3
"""Generate evidence-aware cold-email and follow-up drafts in Markdown and HTML."""

from __future__ import annotations

import argparse
import html
import re
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (
    EXAMPLE_DATA,
    ROOT,
    GradPilotError,
    find_pi,
    find_school,
    iter_pis,
    load_database,
    load_profile,
    slugify,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--school", help="School id, name or alias")
    parser.add_argument("--pi", help="PI id or full name; required unless --all is used")
    parser.add_argument("--all", action="store_true", help="Draft for every PI in scope")
    parser.add_argument("--follow-up", action="store_true", help="Generate a concise follow-up")
    parser.add_argument("--term", help="Override target term, e.g. '2028 Fall'")
    parser.add_argument("--data", help="Application JSON path")
    parser.add_argument("--profile", help="Profile YAML path")
    parser.add_argument(
        "--format", choices=("markdown", "html", "both"), default="both", dest="fmt"
    )
    parser.add_argument(
        "--output-dir", type=Path, default=ROOT / "out" / "cold-emails", help="Draft directory"
    )
    return parser.parse_args()


def public_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise GradPilotError(f"Profile link must be an absolute HTTP(S) URL: {value!r}")
    return value


def professor_surname(name: str) -> str:
    cleaned = re.sub(r"\([^)]*\)", "", name).strip()
    return cleaned.split()[-1] if cleaned else name


def verified_paper_connection(pi: dict) -> dict[str, str] | None:
    """Use a paper only after the user records official verification and reading notes."""
    if pi.get("verification_status") != "verified_official":
        return None
    title = pi.get("paper_title", "").strip()
    notes = pi.get("paper_notes", "").strip()
    if not title or not notes:
        return None
    url = pi.get("paper_url", "").strip()
    return {"title": title, "notes": notes, "url": public_url(url) if url else ""}


def email_content(
    school: dict,
    pi: dict,
    profile: dict,
    term: str,
    follow_up: bool,
) -> dict[str, str]:
    applicant = profile.get("applicant", {})
    links = profile.get("links", {})
    name = applicant.get("name", "Your Name")
    homepage = public_url(links.get("homepage", ""))
    paper = public_url(links.get("paper_pdf", ""))
    demo = public_url(links.get("demo_youtube", ""))
    subject = (
        f"Prospective Ph.D. Student {term} - Humanoid Loco-Manipulation & "
        f"Sim-to-Real ({name})"
    )
    greeting = f"Dear Professor {professor_surname(pi['name'])},"
    signature = profile.get("email", {}).get(
        "signature",
        f"Best regards,\n{name}\nDalian University of Technology\n{homepage}",
    ).replace("Your Name", name).replace("2028 Fall", term)

    pi_paper = verified_paper_connection(pi)
    research_focus = (
        f'your paper "{pi_paper["title"]}"'
        if pi_paper
        else f"your research on {', '.join(pi['recent_work_keywords'][:2])}"
    )

    if follow_up:
        body = (
            f"{greeting}\n\n"
            f"I hope you are doing well. I am following up on my note about applying to the "
            f"{school['program_name']} for {term}. My work on whole-body dexterous "
            f"loco-manipulation and closed-loop Unitree G1/H2 deployment appears closely "
            f"aligned with {research_focus}.\n\n"
            "I would be grateful to know whether you expect to consider new Ph.D. students "
            "for this cycle. My one-page research summary and a short real-robot demonstration "
            f"are available here: {paper} and {demo}.\n\n"
            "Thank you again for your time and consideration.\n\n"
            f"{signature}"
        )
        subject = f"Re: {subject}"
    else:
        keywords = pi["recent_work_keywords"]
        if pi_paper:
            paper_link = f" ({pi_paper['url']})" if pi_paper["url"] else ""
            connection_paragraph = (
                f'While reading your paper "{pi_paper["title"]}"{paper_link}, I noted a '
                f"concrete connection to my proposed research: {pi_paper['notes']} "
                "This connection motivates my interest in the "
                f"{school['program_name']} and your group"
                f"{', ' + pi['lab'] if pi.get('lab') else ''}."
            )
        else:
            connection_paragraph = (
                f"Your work on {keywords[0]} and {keywords[1]} is especially relevant to my next "
                "research step: learning generalizable visuomotor and behavioral representations "
                "from large-scale simulation while retaining reliable contact-rich behavior on "
                f"physical robots. This connection motivates my interest in the {school['program_name']} "
                f"and your group{', ' + pi['lab'] if pi.get('lab') else ''}."
            )
        body = (
            f"{greeting}\n\n"
            f"I am writing to ask whether you expect to consider new Ph.D. students for {term}. "
            "My current research focuses on humanoid whole-body dexterous loco-manipulation, "
            "with reinforcement-learning policies deployed in a full sim-to-real loop on "
            "Unitree G1/H2 humanoids and Inspire dexterous hands, including Jetson Orin NX "
            f"onboard perception and control. Academic homepage: {homepage}; research PDF: "
            f"{paper}; real-robot demo: {demo}.\n\n"
            f"{connection_paragraph}\n\n"
            "My background in Big Data Management and Applications gives me a complementary "
            "foundation in mathematical modeling, statistical decision-making, optimization, "
            "MDPs, and large-scale data pipelines. I would be glad to share further technical "
            "details or a short research proposal aligned with your group's current directions.\n\n"
            "Thank you for your time. I would very much appreciate any guidance on potential "
            "Ph.D. openings and the most appropriate application track.\n\n"
            f"{signature}"
        )
    return {"subject": subject, "body": body, "recipient": pi.get("email", "")}


def internal_notes(school: dict, pi: dict, profile: dict) -> list[str]:
    notes = [
        "Verify the PI's current affiliation, admissions status and recent publications on official pages.",
        "Confirm that every hardware and research claim accurately describes your own contribution.",
    ]
    if not verified_paper_connection(pi):
        notes.append("Replace broad research keywords with one specific paper you have actually read, then record reading notes and verify the PI on official pages.")
    if pi.get("admissions_status") == "not_accepting":
        notes.append("This PI is marked as not accepting students for this cycle; do not send until you have verified a change on an official page or received a direct update.")
    if not pi.get("fit_note"):
        notes.append("Record a specific fit argument so the message does not read like a school-name substitution.")
    if pi.get("verification_status") != "verified_official":
        notes.append("This PI record is still marked needs_2026_review.")
    for key, value in profile.get("links", {}).items():
        if value and ("yourname" in value or "replace-with" in value):
            notes.append(f"Replace the placeholder profile link: {key}.")
    if profile.get("applicant", {}).get("name") in {"", "Your Name"}:
        notes.append("Set the applicant's real name in profile.private.yaml before sending.")
    if not pi.get("email"):
        notes.append("No PI email is stored; copy the verified address manually into your mail client.")
    return list(dict.fromkeys(notes))


def render_markdown(draft: dict[str, str], notes: list[str], school: dict, pi: dict) -> str:
    recipient = draft["recipient"] or "[verify email on the official faculty page]"
    note_lines = "\n".join(f"- {note}" for note in notes)
    return (
        f"# {'Follow-up' if draft['subject'].startswith('Re:') else 'Cold email'} · "
        f"{school['name']} · {pi['name']}\n\n"
        f"**To:** {recipient}  \n**Subject:** {draft['subject']}\n\n---\n\n"
        f"{draft['body']}\n\n---\n\n## Internal pre-send checks — not part of the email\n\n{note_lines}\n"
    )


def linkify_urls(text: str) -> str:
    """Escape text once and turn URLs into links without trailing sentence punctuation."""
    pieces = []
    cursor = 0
    for match in re.finditer(r"https?://[^\s;]+", text):
        raw_url = match.group(0)
        url = raw_url.rstrip(".,!?")
        trailing = raw_url[len(url):]
        pieces.append(html.escape(text[cursor:match.start()]))
        escaped_url = html.escape(url, quote=True)
        pieces.append(f'<a href="{escaped_url}">{html.escape(url)}</a>{html.escape(trailing)}')
        cursor = match.end()
    pieces.append(html.escape(text[cursor:]))
    return "".join(pieces)


def render_html(draft: dict[str, str], notes: list[str], school: dict, pi: dict) -> str:
    body = linkify_urls(draft["body"])
    paragraphs = "".join(
        f"<p>{paragraph.replace(chr(10), '<br>')}</p>"
        for paragraph in body.split("\n\n")
    )
    note_html = "".join(f"<li>{html.escape(note)}</li>" for note in notes)
    title = f"{school['name']} · {pi['name']}"
    return (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        f"<meta name=\"viewport\" content=\"width=device-width\"><title>{html.escape(title)}</title>"
        "<style>body{max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.65 sans-serif;"
        "color:#172026}header,aside{background:#f3f5f4;padding:18px;border-left:4px solid #d85c35}"
        "a{color:#175f85;overflow-wrap:anywhere}p{white-space:normal}</style></head><body>"
        f"<header><strong>{html.escape(title)}</strong><br>To: "
        f"{html.escape(draft['recipient'] or '[verify email]')}<br>Subject: "
        f"{html.escape(draft['subject'])}</header><main>{paragraphs}</main>"
        f"<aside><strong>Internal pre-send checks — remove before sending</strong><ul>{note_html}</ul></aside>"
        "</body></html>"
    )


def main() -> int:
    args = parse_args()
    try:
        if not args.all and not args.pi:
            raise GradPilotError("Choose --pi NAME or --all (use --school to narrow scope).")
        data, data_path = load_database(args.data)
        profile, profile_path = load_profile(args.profile)
        term = args.term or profile.get("applicant", {}).get(
            "target_term", data.get("cycle", {}).get("target_term", "2028 Fall")
        )
        if args.school and args.pi:
            pairs = [(find_school(data, args.school), None)]
            pairs = [(pairs[0][0], find_pi(pairs[0][0], args.pi))]
        else:
            pairs = list(iter_pis(data, args.school))
            if args.pi:
                matches = [(school, pi) for school, pi in pairs if pi["id"] == args.pi or pi["name"].casefold() == args.pi.casefold()]
                if len(matches) != 1:
                    raise GradPilotError(
                        "PI name must be unique when no --school is supplied; use --school to disambiguate."
                    )
                pairs = matches
        if not pairs:
            raise GradPilotError("No PI records matched the requested scope.")

        args.output_dir.mkdir(parents=True, exist_ok=True)
        generated = []
        for school, pi in pairs:
            draft = email_content(school, pi, profile, term, args.follow_up)
            notes = internal_notes(school, pi, profile)
            stem = f"{slugify(school['id'])}__{slugify(pi['id'])}__{'follow-up' if args.follow_up else 'initial'}"
            if args.fmt in {"markdown", "both"}:
                path = args.output_dir / f"{stem}.md"
                path.write_text(render_markdown(draft, notes, school, pi), encoding="utf-8")
                generated.append(path)
            if args.fmt in {"html", "both"}:
                path = args.output_dir / f"{stem}.html"
                path.write_text(render_html(draft, notes, school, pi), encoding="utf-8")
                generated.append(path)

        print(f"Generated {len(generated)} local draft files for {len(pairs)} PI(s):")
        for path in generated:
            print(f"  {path}")
        print(f"Target term: {term}; data: {data_path}; profile: {profile_path}")
        if data_path == EXAMPLE_DATA:
            print("Example database in use; no messages were sent and no contact status was changed.")
        if args.follow_up:
            default_days = int(profile.get("email", {}).get("follow_up_after_days", 12))
            print(f"Suggested earliest follow-up date after sending: {date.today() + timedelta(days=default_days)}")
        return 0
    except (GradPilotError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
