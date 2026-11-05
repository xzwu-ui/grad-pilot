#!/usr/bin/env python3
"""Generate polite recommendation-letter reminders grouped by recommender."""

from __future__ import annotations

import argparse
import html
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (
    ROOT,
    GradPilotError,
    deadline_details,
    deadline_in_timezone,
    find_recommender,
    load_database,
    load_profile,
    pending_recommendations,
    slugify,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--recommender", help="Recommender id, name or display name")
    group.add_argument("--all", action="store_true", help="Generate for every recommender")
    parser.add_argument("--data", help="Application JSON path")
    parser.add_argument("--profile", help="Profile YAML path")
    parser.add_argument("--due-within", type=int, help="Only include deadlines within N days")
    parser.add_argument(
        "--format", choices=("markdown", "html", "both"), default="both", dest="fmt"
    )
    parser.add_argument(
        "--output-dir", type=Path, default=ROOT / "out" / "lor-reminders"
    )
    return parser.parse_args()


def reminder_content(
    data: dict,
    profile: dict,
    person: dict,
    pending: list,
) -> dict[str, str]:
    applicant = profile.get("applicant", {})
    name = applicant.get("name", "Your Name")
    term = applicant.get("target_term", data["cycle"]["target_term"])
    timezone_name = data.get("cycle", {}).get("timezone", "Asia/Shanghai")
    institution = applicant.get("undergraduate_institution", "Dalian University of Technology")
    lines = []
    for school, assignment in pending:
        local = deadline_in_timezone(school, timezone_name)
        estimate = " (planning date; verify)" if not school.get("deadline_verified") else ""
        lines.append(
            f"- {school['name']} — {school['program_name']}\n"
            f"  Deadline: {local:%B %d, %Y at %H:%M %Z}{estimate}\n"
            f"  Portal: {school.get('portal_url') or '[add verified recommendation portal link]'}"
        )
    school_list = "\n".join(lines)
    subject = f"Recommendation letters for {term} Ph.D. applications — {name}"
    body = (
        f"Dear {person['display_name']},\n\n"
        "I hope you are doing well. Thank you again for generously agreeing to support my "
        f"Ph.D. applications for {term}. I am writing with a consolidated list of the programs "
        "for which my records show that your recommendation has not yet been submitted.\n\n"
        f"{school_list}\n\n"
        "I have attached or can resend my current CV, transcript, statement of purpose, and a "
        "short summary of my humanoid loco-manipulation and real-robot deployment work. Please "
        "let me know if any additional material would make the letter easier to prepare.\n\n"
        "If a program has already received your letter, please simply disregard that entry; my "
        "local tracker may not yet reflect the portal status. Thank you very much for your time "
        "and continued support.\n\n"
        f"With sincere appreciation,\n{name}\n{institution}\n"
        f"{applicant.get('email', '')}\n{profile.get('links', {}).get('homepage', '')}"
    )
    return {"subject": subject, "body": body, "email": person.get("email", "")}


def render_markdown(draft: dict, person: dict) -> str:
    return (
        f"# Recommendation reminder · {person['display_name']}\n\n"
        f"**To:** {draft['email'] or '[verify email]'}  \n"
        f"**Subject:** {draft['subject']}\n\n---\n\n{draft['body']}\n\n---\n\n"
        "**Internal check:** Confirm every deadline and use the actual recommendation portal "
        "link from each application. Remove '(planning date; verify)' only after checking the "
        "official program page. This script does not send email.\n"
    )


def render_html(draft: dict, person: dict) -> str:
    paragraphs = "".join(
        f"<p>{html.escape(paragraph).replace(chr(10), '<br>')}</p>"
        for paragraph in draft["body"].split("\n\n")
    )
    return (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        f"<title>Recommendation reminder · {html.escape(person['display_name'])}</title>"
        "<style>body{max-width:780px;margin:40px auto;padding:0 20px;font:16px/1.65 sans-serif;"
        "color:#172026}header{background:#f3f5f4;padding:18px;border-left:4px solid #d85c35}"
        "</style></head><body>"
        f"<header>To: {html.escape(draft['email'] or '[verify email]')}<br>Subject: "
        f"{html.escape(draft['subject'])}</header>{paragraphs}<hr><p><strong>Internal check:</strong> "
        "Verify all deadlines and portal links before sending. No email was sent.</p></body></html>"
    )


def main() -> int:
    args = parse_args()
    try:
        if args.due_within is not None and args.due_within < 0:
            raise GradPilotError("--due-within must be zero or greater")
        data, _ = load_database(args.data)
        profile, _ = load_profile(args.profile)
        people = (
            [find_recommender(data, args.recommender)]
            if args.recommender
            else sorted(data.get("recommenders", []), key=lambda person: person.get("priority", 99))
        )
        args.output_dir.mkdir(parents=True, exist_ok=True)
        generated = []
        for person in people:
            pending = pending_recommendations(data, person["id"])
            if args.due_within is not None:
                pending = [
                    (school, assignment)
                    for school, assignment in pending
                    if 0 <= deadline_details(school)["days"] <= args.due_within
                ]
            if not pending:
                print(f"{person['display_name']}: no pending letters in scope; no draft generated.")
                continue
            draft = reminder_content(data, profile, person, pending)
            stem = f"{slugify(person['id'])}__{len(pending)}-schools"
            if args.fmt in {"markdown", "both"}:
                path = args.output_dir / f"{stem}.md"
                path.write_text(render_markdown(draft, person), encoding="utf-8")
                generated.append(path)
            if args.fmt in {"html", "both"}:
                path = args.output_dir / f"{stem}.html"
                path.write_text(render_html(draft, person), encoding="utf-8")
                generated.append(path)
        print(f"Generated {len(generated)} local files. No messages were sent.")
        for path in generated:
            print(f"  {path}")
        return 0
    except (GradPilotError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
