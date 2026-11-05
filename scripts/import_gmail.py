#!/usr/bin/env python3
"""Import reviewed Ph.D. application updates from read-only Gmail messages."""

from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import html
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    EXAMPLE_DATA,
    ROOT,
    GradPilotError,
    load_database,
    normalized,
    validate_database,
    write_json_atomic,
)
from gmail_review import render_review_html  # noqa: E402

GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
DEFAULT_QUERY = (
    "{subject:PhD subject:Ph.D. subject:application subject:admission "
    "subject:admissions subject:interview} newer_than:2y"
)
STATUSES = [
    "Researching",
    "Preparing",
    "Submitted",
    "Interview",
    "Waitlisted",
    "Admitted",
    "Closed",
]
CLOSE_REASONS = {"not_applying", "rejected", "withdrawn", "declined_offer"}
FIELD_ORDER = (
    "application_id",
    "submission_date",
    "interview_date",
    "status",
    "decision_date",
    "close_reason",
)
FIELD_NAMES = set(FIELD_ORDER)
DATE_FIELDS = {"submission_date", "interview_date", "decision_date"}
STATUS_RANK = {
    "Researching": 0,
    "Preparing": 1,
    "Submitted": 2,
    "Interview": 3,
    "Waitlisted": 4,
    "Admitted": 5,
    "Closed": 6,
}
MONTH = (
    "January|February|March|April|May|June|July|August|September|October|"
    "November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
)
DATE_TOKEN = (
    rf"(?:\d{{4}}-\d{{2}}-\d{{2}}|(?:{MONTH})\s+\d{{1,2}},?\s+\d{{4}}|"
    rf"\d{{1,2}}\s+(?:{MONTH})\s+\d{{4}})"
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def database_fingerprint(data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def decode_body(data: str) -> str:
    try:
        padded = data + "=" * (-len(data) % 4)
        return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8", "replace")
    except (ValueError, UnicodeError):
        return ""


def iter_mime_parts(payload: dict[str, Any]):
    yield payload
    for part in payload.get("parts", []):
        if isinstance(part, dict):
            yield from iter_mime_parts(part)


def message_text(message: dict[str, Any]) -> str:
    """Decode nested plain-text parts first; use HTML only when no plain part exists."""
    plain_parts = []
    html_parts = []
    for part in iter_mime_parts(message.get("payload", {})):
        data = part.get("body", {}).get("data", "")
        if not data or part.get("filename"):
            continue
        mime_type = part.get("mimeType", "")
        if mime_type == "text/plain":
            plain_parts.append(decode_body(data))
        elif mime_type == "text/html":
            html_parts.append(decode_body(data))
    if plain_parts:
        return "\n".join(part for part in plain_parts if part)
    if html_parts:
        soup = BeautifulSoup("\n".join(html_parts), "html.parser")
        for element in soup(["script", "style"]):
            element.decompose()
        return soup.get_text("\n", strip=True)
    return str(message.get("snippet", ""))


def header(message: dict[str, Any], name: str) -> str:
    for item in message.get("payload", {}).get("headers", []):
        if item.get("name", "").casefold() == name.casefold():
            return str(item.get("value", ""))
    return ""


def message_datetime(message: dict[str, Any]) -> datetime | None:
    value = header(message, "Date")
    if value:
        try:
            parsed = parsedate_to_datetime(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except (TypeError, ValueError, OverflowError):
            pass
    internal_date = message.get("internalDate")
    if internal_date:
        try:
            return datetime.fromtimestamp(int(internal_date) / 1000, tz=timezone.utc)
        except (TypeError, ValueError, OSError, OverflowError):
            pass
    return None


def message_calendar_date(message: dict[str, Any]) -> str:
    """Keep the sender's calendar date instead of shifting it through UTC."""
    value = header(message, "Date")
    if value:
        try:
            return parsedate_to_datetime(value).date().isoformat()
        except (TypeError, ValueError, OverflowError):
            pass
    received = message_datetime(message)
    return received.date().isoformat() if received else ""


def parse_date_token(value: str) -> str | None:
    cleaned = re.sub(r"\s+", " ", value.strip().replace("Sept", "Sep"))
    formats = ("%Y-%m-%d", "%B %d, %Y", "%B %d %Y", "%b %d, %Y", "%b %d %Y", "%d %B %Y", "%d %b %Y")
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def first_group(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else None


def extract_application_id(text: str) -> str | None:
    pattern = (
        r"\b(?:application|reference|confirmation)"
        r"(?:\s+(?:id|number|no\.?))?\s*(?:is\s*)?[:#]\s*"
        r"([A-Za-z0-9][A-Za-z0-9_-]{2,63})"
    )
    return first_group(pattern, text)


def extract_dates(text: str) -> dict[str, str]:
    submission_pattern = (
        rf"\b(?:submission\s+date|date\s+submitted|submitted\s+on)"
        rf"\s*[:#]?\s*({DATE_TOKEN})"
    )
    interview_pattern = (
        rf"\binterview(?:\s+date|\s+(?:is\s+)?scheduled\s+(?:for|on)|\s+on)?"
        rf"\s*[:#]?\s*({DATE_TOKEN})"
    )
    result = {}
    submission = first_group(submission_pattern, text)
    interview = first_group(interview_pattern, text)
    if submission and parse_date_token(submission):
        result["submission_date"] = parse_date_token(submission)
    if interview and parse_date_token(interview):
        result["interview_date"] = parse_date_token(interview)
    return result


def classify_status(text: str) -> tuple[str | None, str]:
    """Conservative phrase rules; return the dashboard-independent raw category."""
    rules = [
        (
            "Rejected",
            [
                r"\bwe regret to inform you\b",
                r"\bunable to offer (?:you )?admission\b",
                r"\bnot (?:be )?offered admission\b",
                r"\bapplication (?:was|has been|is) (?:unsuccessful|rejected|denied)\b",
                r"\byou (?:were|have been) not accepted\b",
                r"\byou have not been accepted\b",
                r"\bnot selected for admission\b",
            ],
        ),
        (
            "Admitted",
            [
                r"\byou have been admitted\b",
                r"\byou have been accepted\b",
                r"\byou are admitted\b",
                r"\bwe are pleased to admit you\b",
                r"\boffer (?:you )?admission\b",
                r"\boffer of admission\b",
                r"\boffered admission\b",
                r"\badmission offer\b",
            ],
        ),
        ("Waitlisted", [r"\bwait[ -]?list(?:ed)?\b"]),
        (
            "Interview",
            [
                r"\binterview (?:invitation|request|scheduled)\b",
                r"\binvite(?:d)? (?:you )?(?:to|for) (?:an )?interview\b",
                r"\bschedule (?:an )?interview\b",
            ],
        ),
        ("Under Review", [r"\bunder (?:faculty |committee )?review\b", r"\bbeing reviewed\b"]),
        (
            "Submitted",
            [
                r"\bapplication (?:has been |was |is )?(?:successfully )?(?:submitted|received)\b",
                r"\bwe (?:have )?received your application\b",
                r"\bconfirmation of (?:your )?application\b",
                r"\bthank you for submitting\b",
            ],
        ),
    ]
    for category, patterns in rules:
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return category, match.group(0)
    return None, ""


def contains_term(text: str, term: str) -> bool:
    normalized_text = normalized(text)
    normalized_term = normalized(term)
    if len(normalized_term) < 2:
        return False
    pattern = r"(?<![a-z0-9])" + re.escape(normalized_term) + r"(?![a-z0-9])"
    return bool(re.search(pattern, normalized_text))


def current_fields(school: dict[str, Any]) -> dict[str, Any]:
    decision = school.get("decision", {})
    return {
        "application_id": school.get("application_id") or "",
        "submission_date": school.get("submission_date") or "",
        "interview_date": school.get("interview_date") or "",
        "status": school.get("status", ""),
        "decision_date": decision.get("decision_date") or "",
        "close_reason": decision.get("close_reason") or "",
    }


def match_school(
    data: dict[str, Any], text: str, application_id: str | None
) -> tuple[str | None, list[str], str, list[str], list[str]]:
    schools = data.get("schools", [])
    warnings = []
    id_matches = []
    if application_id:
        id_matches = [
            school
            for school in schools
            if school.get("application_id")
            and normalized(school["application_id"]) == normalized(application_id)
        ]
    name_matches = []
    matched_terms = []
    for school in schools:
        terms = [school.get("name", ""), *school.get("aliases", [])]
        matches = sorted(
            (term for term in terms if contains_term(text, term)), key=len, reverse=True
        )
        if matches:
            name_matches.append(school)
            matched_terms.append(f"{school['id']}: {matches[0]}")
    if len(id_matches) == 1:
        school_id = id_matches[0]["id"]
        if any(school["id"] != school_id for school in name_matches):
            warnings.append("申请编号匹配与邮件中的学校名称不一致，请重点核对。")
        return (
            school_id,
            [school["id"] for school in name_matches] or [school_id],
            "application_id",
            matched_terms,
            warnings,
        )
    if len(id_matches) > 1:
        warnings.append("同一个申请编号出现在多个项目中，请先修正看板数据。")
        return (
            None,
            [school["id"] for school in id_matches],
            "ambiguous_application_id",
            matched_terms,
            warnings,
        )
    if len(name_matches) == 1:
        return (
            name_matches[0]["id"],
            [name_matches[0]["id"]],
            "school_name",
            matched_terms,
            warnings,
        )
    if len(name_matches) > 1:
        warnings.append("邮件同时匹配多个项目，未自动选择学校。")
        return (
            None,
            [school["id"] for school in name_matches],
            "ambiguous_school",
            matched_terms,
            warnings,
        )
    warnings.append("未匹配到学校；可在审核页手动选择。")
    return None, [], "unmatched", matched_terms, warnings


def candidate_from_message(
    message: dict[str, Any], data: dict[str, Any], applied_ids: set[str]
) -> dict[str, Any]:
    text = re.sub(r"\r\n?", "\n", message_text(message))
    searchable = f"{header(message, 'Subject')}\n{text}"
    application_id = extract_application_id(searchable)
    school_id, matched_ids, match_method, matched_terms, warnings = match_school(
        data, searchable, application_id
    )
    school = next((item for item in data.get("schools", []) if item["id"] == school_id), None)
    raw_status, status_evidence = classify_status(searchable)
    received = message_datetime(message)
    message_date = message_calendar_date(message)
    proposed = extract_dates(searchable)
    if application_id:
        proposed["application_id"] = application_id
    if raw_status:
        proposed["status"] = {
            "Rejected": "Closed",
            "Admitted": "Admitted",
            "Waitlisted": "Waitlisted",
            "Interview": "Interview",
            "Under Review": "Submitted",
            "Submitted": "Submitted",
        }[raw_status]
    if raw_status in {"Rejected", "Admitted", "Waitlisted"} and message_date:
        proposed["decision_date"] = message_date
    if raw_status == "Rejected":
        proposed["close_reason"] = "rejected"
    if raw_status == "Under Review":
        warnings.append("“Under Review”将映射为 Submitted；原始状态仅保留在审核信息中。")
    if not proposed:
        warnings.append("未提取到可导入字段；可忽略，或在审核页手动补充。")
    message_id = str(message.get("id", ""))
    already_applied = message_id in applied_ids
    if already_applied:
        warnings.append("这封邮件此前已确认导入；重复应用前请确认确有必要。")
    before = current_fields(school) if school else current_fields({})
    current_status = before.get("status")
    proposed_status = proposed.get("status")
    if (
        current_status
        and proposed_status
        and STATUS_RANK[proposed_status] < STATUS_RANK[current_status]
    ):
        warnings.append(f"拟议状态 {proposed_status} 早于当前状态 {current_status}，可能是旧邮件。")
    if before.get("close_reason") and proposed_status and proposed_status != "Closed":
        warnings.append("确认非 Closed 状态时，也会清除当前关闭原因。")
    if school_id and proposed:
        high_confidence = match_method == "application_id" or raw_status in {
            "Rejected",
            "Admitted",
            "Waitlisted",
        }
        confidence = "high" if high_confidence else "medium"
    else:
        confidence = "low"
    return {
        "gmail_message_id": message_id,
        "gmail_thread_id": str(message.get("threadId", "")),
        "subject": header(message, "Subject") or "(无主题)",
        "sender": header(message, "From"),
        "message_date": message_date,
        "received_at": received.isoformat(timespec="seconds") if received else "",
        "source_url": f"https://mail.google.com/mail/u/0/#all/{message_id}",
        "snippet": html.unescape(str(message.get("snippet", "")))[:500],
        "school_id": school_id,
        "matched_school_ids": matched_ids,
        "match_method": match_method,
        "matched_terms": matched_terms,
        "raw_status": raw_status,
        "status_evidence": status_evidence,
        "proposed": proposed,
        "current": before,
        "confidence": confidence,
        "already_applied": already_applied,
        "warnings": list(dict.fromkeys(warnings)),
    }


def build_report(
    messages: list[dict[str, Any]],
    data: dict[str, Any],
    data_path: Path,
    query: str,
    source: str,
) -> dict[str, Any]:
    applied_ids = {
        str(item.get("gmail_message_id", "")) for item in data.get("gmail_imports", [])
    }
    schools = []
    for school in data.get("schools", []):
        schools.append(
            {
                "id": school["id"],
                "name": school["name"],
                "program_name": school["program_name"],
                "current": current_fields(school),
            }
        )
    return {
        "kind": "gradpilot-gmail-candidates",
        "version": 1,
        "batch_id": uuid.uuid4().hex[:12],
        "created_at": utc_now(),
        "source": source,
        "query": query,
        "parser": "conservative-rules-v1",
        "database_file": data_path.name,
        "database_sha256": database_fingerprint(data),
        "schools": schools,
        "candidates": [candidate_from_message(message, data, applied_ids) for message in messages],
    }


def load_offline_messages(path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise GradPilotError(f"Invalid offline message JSON: {exc}") from exc
    messages = payload.get("messages") if isinstance(payload, dict) else payload
    if not isinstance(messages, list) or not all(isinstance(item, dict) for item in messages):
        raise GradPilotError(
            "Offline messages must be a JSON array or an object with a messages array."
        )
    prepared = copy.deepcopy(messages)
    for message in prepared:
        # Human-readable fixtures may provide text instead of a base64 MIME payload.
        if "text" in message:
            encoded = base64.urlsafe_b64encode(
                str(message.pop("text")).encode("utf-8")
            ).decode("ascii").rstrip("=")
            payload = message.setdefault("payload", {})
            payload.setdefault("mimeType", "text/plain")
            payload.setdefault("body", {})["data"] = encoded
    return prepared


def gmail_credentials(client_secrets: Path, token_path: Path):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as exc:
        raise GradPilotError(
            "Gmail dependencies are missing. Run 'uv sync' or "
            "'python -m pip install -r requirements.txt'."
        ) from exc
    credentials = None
    if token_path.is_file():
        try:
            credentials = Credentials.from_authorized_user_file(str(token_path), [GMAIL_SCOPE])
        except (ValueError, OSError) as exc:
            raise GradPilotError(f"Cannot read Gmail token {token_path}: {exc}") from exc
    if not credentials or not credentials.valid:
        try:
            if credentials and credentials.expired and credentials.refresh_token:
                credentials.refresh(Request())
            else:
                if not client_secrets.is_file():
                    raise GradPilotError(
                        f"OAuth client file not found: {client_secrets}. "
                        "Download a Desktop app client JSON from Google Cloud first."
                    )
                flow = InstalledAppFlow.from_client_secrets_file(str(client_secrets), [GMAIL_SCOPE])
                credentials = flow.run_local_server(port=0)
        except GradPilotError:
            raise
        except Exception as exc:
            raise GradPilotError(f"Gmail OAuth failed: {exc}") from exc
        token_data = json.loads(credentials.to_json())
        write_json_atomic(token_path, token_data)
        try:
            os.chmod(token_path, 0o600)
        except OSError:
            pass
    return credentials


def fetch_gmail_messages(
    client_secrets: Path, token_path: Path, query: str, limit: int
) -> list[dict[str, Any]]:
    try:
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise GradPilotError(
            "Gmail dependencies are missing. Run 'uv sync' or install requirements.txt."
        ) from exc
    credentials = gmail_credentials(client_secrets, token_path)
    try:
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        messages = service.users().messages()
        references = []
        page_token = None
        while len(references) < limit:
            request = {
                "userId": "me",
                "q": query,
                "maxResults": min(100, limit - len(references)),
            }
            if page_token:
                request["pageToken"] = page_token
            response = messages.list(**request).execute()
            references.extend(response.get("messages", []))
            page_token = response.get("nextPageToken")
            if not page_token or not response.get("messages"):
                break
        return [
            messages.get(userId="me", id=item["id"], format="full").execute()
            for item in references[:limit]
        ]
    except Exception as exc:
        raise GradPilotError(f"Gmail API request failed: {exc}") from exc


def validate_review(review: dict[str, Any], data: dict[str, Any]) -> None:
    if review.get("kind") != "gradpilot-gmail-review" or review.get("version") != 1:
        raise GradPilotError("Not a GradPilot Gmail review export (kind/version mismatch).")
    if not re.fullmatch(r"[0-9a-f]{64}", str(review.get("database_sha256", ""))):
        raise GradPilotError("Review export has no valid database fingerprint.")
    if not isinstance(review.get("batch_id"), str) or not review["batch_id"]:
        raise GradPilotError("Review export is missing batch_id.")
    approved = review.get("approved")
    if not isinstance(approved, list) or not approved:
        raise GradPilotError("Review export contains no approved messages.")
    known_schools = {school["id"] for school in data.get("schools", [])}
    seen_messages = set()
    for index, item in enumerate(approved, start=1):
        if not isinstance(item, dict):
            raise GradPilotError(f"Approved item {index} must be an object.")
        message_id = item.get("gmail_message_id")
        if not isinstance(message_id, str) or not message_id or len(message_id) > 256:
            raise GradPilotError(f"Approved item {index} has an invalid Gmail message ID.")
        if message_id in seen_messages:
            raise GradPilotError(f"Message {message_id} appears more than once in the review.")
        seen_messages.add(message_id)
        if item.get("school_id") not in known_schools:
            raise GradPilotError(f"Message {message_id} references an unknown school.")
        fields = item.get("fields")
        if not isinstance(fields, dict) or not fields:
            raise GradPilotError(f"Message {message_id} has no selected fields.")
        unknown = set(fields) - FIELD_NAMES
        if unknown:
            raise GradPilotError(f"Message {message_id} has unsupported fields: {sorted(unknown)}")
        for field, value in fields.items():
            if not isinstance(value, str) or not value.strip():
                raise GradPilotError(f"Message {message_id}: {field} must be a non-empty string.")
            if field in DATE_FIELDS:
                try:
                    datetime.strptime(value, "%Y-%m-%d")
                except ValueError as exc:
                    raise GradPilotError(f"Message {message_id}: invalid {field}: {value}") from exc
        if "status" in fields and fields["status"] not in STATUSES:
            raise GradPilotError(f"Message {message_id}: unsupported application status.")
        if "close_reason" in fields and fields["close_reason"] not in CLOSE_REASONS:
            raise GradPilotError(f"Message {message_id}: unsupported close reason.")
        if "application_id" in fields and len(fields["application_id"]) > 128:
            raise GradPilotError(f"Message {message_id}: application_id is too long.")
        school = next(school for school in data["schools"] if school["id"] == item["school_id"])
        target_status = fields.get("status", school.get("status"))
        if "close_reason" in fields and target_status != "Closed":
            raise GradPilotError(f"Message {message_id}: close_reason requires Closed status.")


def set_field(school: dict[str, Any], field: str, value: Any) -> tuple[Any, Any]:
    if field in {"decision_date", "close_reason"}:
        school.setdefault("decision", {})
        before = school["decision"].get(field)
        school["decision"][field] = value
    else:
        before = school.get(field)
        school[field] = value
    return before, value


def apply_review(
    data: dict[str, Any], review: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if review.get("database_sha256") != database_fingerprint(data):
        raise GradPilotError(
            "The application database changed after this review was generated. "
            "Fetch a new Gmail review instead of overwriting newer work."
        )
    validate_review(review, data)
    updated = copy.deepcopy(data)
    changes = []
    approved = sorted(
        enumerate(review["approved"]),
        key=lambda pair: (str(pair[1].get("message_date", "")), pair[0]),
    )
    for _, item in approved:
        school = next(school for school in updated["schools"] if school["id"] == item["school_id"])
        message_id = item["gmail_message_id"]
        for field in FIELD_ORDER:
            if field not in item["fields"]:
                continue
            if field == "close_reason" and school.get("status") != "Closed":
                raise GradPilotError(
                    f"Message {message_id}: close_reason requires Closed status after earlier updates."
                )
            value = item["fields"][field].strip()
            before, after = set_field(school, field, value)
            if before != after:
                changes.append(
                    {
                        "gmail_message_id": message_id,
                        "school_id": school["id"],
                        "field": field,
                        "before": before,
                        "after": after,
                    }
                )
            if (
                field == "status"
                and value != "Closed"
                and school.get("decision", {}).get("close_reason")
            ):
                reason_before, _ = set_field(school, "close_reason", None)
                changes.append(
                    {
                        "gmail_message_id": message_id,
                        "school_id": school["id"],
                        "field": "close_reason",
                        "before": reason_before,
                        "after": None,
                    }
                )
        updated.setdefault("gmail_imports", []).append(
            {
                "gmail_message_id": message_id,
                "batch_id": review["batch_id"],
                "applied_at": utc_now(),
                "school_id": school["id"],
                "message_date": item.get("message_date") or None,
                "fields": sorted(item["fields"]),
            }
        )
    validate_database(updated)
    return updated, changes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    fetch = subparsers.add_parser(
        "fetch", help="Fetch and generate a local review; never update applications"
    )
    fetch.add_argument("--data", help="Application JSON used for school matching")
    fetch.add_argument("--query", default=DEFAULT_QUERY, help="Gmail search query")
    fetch.add_argument("--max-results", type=int, default=50, help="Maximum messages (1–200)")
    fetch.add_argument(
        "--client-secrets",
        type=Path,
        default=ROOT / "credentials" / "gmail-oauth.json",
        help="Google OAuth Desktop client JSON",
    )
    fetch.add_argument(
        "--token",
        type=Path,
        default=ROOT / ".state" / "gmail-token.json",
        help="Private cached read-only OAuth token",
    )
    fetch.add_argument("--output-dir", type=Path, default=ROOT / "out" / "gmail-import")
    fetch.add_argument(
        "--offline-messages",
        type=Path,
        help="Parse Gmail-shaped local JSON without OAuth or network access",
    )
    apply_parser = subparsers.add_parser("apply", help="Validate an approved review export")
    apply_parser.add_argument(
        "review", type=Path, help="Reviewed JSON downloaded from the local HTML page"
    )
    apply_parser.add_argument("--data", help="Private application JSON to update")
    apply_parser.add_argument(
        "--write-private",
        action="store_true",
        help="Atomically update the selected private JSON; without this flag only preview",
    )
    return parser.parse_args()


def run_fetch(args: argparse.Namespace) -> int:
    if not 1 <= args.max_results <= 200:
        raise GradPilotError("--max-results must be between 1 and 200.")
    data, data_path = load_database(args.data)
    if args.offline_messages:
        if not args.offline_messages.is_file():
            raise GradPilotError(f"Offline message file not found: {args.offline_messages}")
        messages = load_offline_messages(args.offline_messages)[: args.max_results]
        source = "offline"
    else:
        messages = fetch_gmail_messages(
            args.client_secrets.expanduser().resolve(),
            args.token.expanduser().resolve(),
            args.query,
            args.max_results,
        )
        source = "gmail-readonly"
    report = build_report(messages, data, data_path, args.query, source)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stem = f"{timestamp}-{report['batch_id']}"
    json_path = args.output_dir / f"{stem}.candidates.json"
    html_path = args.output_dir / f"{stem}.review.html"
    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_json_atomic(json_path, report)
    html_path.write_text(render_review_html(report), encoding="utf-8", newline="\n")
    matched = sum(bool(item["school_id"]) for item in report["candidates"])
    print(
        f"Fetched {len(messages)} message(s); matched {matched}; "
        "no application data was changed."
    )
    print(f"Candidates: {json_path}")
    print(f"Open this local review page: {html_path}")
    print("After review, run: python scripts/import_gmail.py apply REVIEWED.json --write-private")
    return 0


def run_apply(args: argparse.Namespace) -> int:
    if not args.review.is_file():
        raise GradPilotError(f"Review export not found: {args.review}")
    try:
        review = json.loads(args.review.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise GradPilotError(f"Invalid review JSON: {exc}") from exc
    if not isinstance(review, dict):
        raise GradPilotError("Review export must be a JSON object.")
    data, data_path = load_database(args.data)
    updated, changes = apply_review(data, review)
    for change in changes:
        print(
            f"{change['school_id']}: {change['field']}: "
            f"{change['before']!r} -> {change['after']!r}"
        )
    print(
        f"Validated {len(review['approved'])} approved message(s); "
        f"{len(changes)} field change(s)."
    )
    if not args.write_private:
        print("Preview only; no files were changed. Add --write-private to apply.")
        return 0
    if data_path == EXAMPLE_DATA:
        raise GradPilotError(
            "Refusing to write real email data into the public example. "
            "Run 'python scripts/dashboard_sync.py --init-private' first."
        )
    write_json_atomic(data_path, updated)
    print(f"Private database updated atomically: {data_path}")
    print("Next: run 'python scripts/dashboard_sync.py' to regenerate dashboard/data.js.")
    return 0


def main() -> int:
    args = parse_args()
    try:
        return run_fetch(args) if args.command == "fetch" else run_apply(args)
    except (GradPilotError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
