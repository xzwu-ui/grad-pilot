"""Shared local-data helpers for GradPilot command-line tools."""

from __future__ import annotations

import copy
import json
import math
import os
import re
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import jsonschema
import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
EXAMPLE_DATA = DATA_DIR / "applications.example.json"
PRIVATE_DATA = DATA_DIR / "applications.private.json"
LEGACY_PRIVATE_DATA = DATA_DIR / "applications.json"
SCHEMA_PATH = DATA_DIR / "schema.json"
DEFAULT_PROFILE = DATA_DIR / "profile.yaml"
PRIVATE_PROFILE = DATA_DIR / "profile.private.yaml"


class GradPilotError(RuntimeError):
    """A user-facing error that does not require a traceback."""


def resolve_data_path(explicit: str | Path | None = None) -> Path:
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if not path.is_file():
            raise GradPilotError(f"Application database not found: {path}")
        return path
    env_path = os.environ.get("GRADPILOT_DATA")
    if env_path:
        return resolve_data_path(env_path)
    for path in (PRIVATE_DATA, LEGACY_PRIVATE_DATA, EXAMPLE_DATA):
        if path.is_file():
            return path
    raise GradPilotError(f"No application database found beside {EXAMPLE_DATA}")


def resolve_profile_path(explicit: str | Path | None = None) -> Path:
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if not path.is_file():
            raise GradPilotError(f"Profile not found: {path}")
        return path
    return PRIVATE_PROFILE if PRIVATE_PROFILE.is_file() else DEFAULT_PROFILE


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise GradPilotError(f"Invalid YAML in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise GradPilotError(f"Expected a mapping in {path}")
    return value


def load_profile(explicit: str | Path | None = None) -> tuple[dict[str, Any], Path]:
    path = resolve_profile_path(explicit)
    return load_yaml(path), path


def validate_database(data: dict[str, Any], schema_path: Path = SCHEMA_PATH) -> None:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(
        schema, format_checker=jsonschema.FormatChecker()
    )
    errors = sorted(validator.iter_errors(data), key=lambda error: list(error.absolute_path))
    messages = []
    for error in errors:
        location = ".".join(str(part) for part in error.absolute_path) or "<root>"
        messages.append(f"{location}: {error.message}")

    school_ids = [school.get("id") for school in data.get("schools", [])]
    duplicate_schools = duplicates(school_ids)
    if duplicate_schools:
        messages.append(f"schools: duplicate ids: {', '.join(duplicate_schools)}")

    recommender_ids = [person.get("id") for person in data.get("recommenders", [])]
    duplicate_recommenders = duplicates(recommender_ids)
    if duplicate_recommenders:
        messages.append(
            f"recommenders: duplicate ids: {', '.join(duplicate_recommenders)}"
        )

    known_recommenders = set(recommender_ids)
    for school in data.get("schools", []):
        school_id = school.get("id", "<unknown>")
        pi_ids = [pi.get("id") for pi in school.get("target_pis", [])]
        duplicate_pis = duplicates(pi_ids)
        if duplicate_pis:
            messages.append(
                f"schools.{school_id}.target_pis: duplicate ids: {', '.join(duplicate_pis)}"
            )
        for pi in school.get("target_pis", []):
            history = pi.get("contact", {}).get("history", [])
            if not isinstance(history, list):
                continue
            duplicate_events = duplicates(entry.get("id") for entry in history if isinstance(entry, dict))
            if duplicate_events:
                messages.append(
                    f"schools.{school_id}.target_pis.{pi.get('id', '<unknown>')}.contact.history: "
                    f"duplicate ids: {', '.join(duplicate_events)}"
                )
        assignments = school.get("recommendations", {}).get("assignments", [])
        assigned_ids = [entry.get("recommender_id") for entry in assignments]
        duplicate_assignments = duplicates(assigned_ids)
        if duplicate_assignments:
            messages.append(
                f"schools.{school_id}.recommendations: duplicate recommenders: "
                + ", ".join(duplicate_assignments)
            )
        unknown = sorted(set(assigned_ids) - known_recommenders)
        if unknown:
            messages.append(
                f"schools.{school_id}.recommendations: unknown recommenders: "
                + ", ".join(unknown)
            )

    known_schools = set(school_ids)
    application_ids = [
        normalized(school.get("application_id"))
        for school in data.get("schools", [])
        if school.get("application_id")
    ]
    duplicate_applications = duplicates(application_ids)
    if duplicate_applications:
        messages.append(
            "schools: duplicate application_id values: " + ", ".join(duplicate_applications)
        )
    for item in data.get("gmail_imports", []):
        if item.get("school_id") not in known_schools:
            messages.append(
                f"gmail_imports: unknown school: {item.get('school_id', '<unknown>')}"
            )

    document_ids = [document.get("id") for document in data.get("documents", [])]
    duplicate_documents = duplicates(document_ids)
    if duplicate_documents:
        messages.append(f"documents: duplicate ids: {', '.join(duplicate_documents)}")
    known_documents = set(document_ids)
    for document in data.get("documents", []):
        unknown = sorted(set(document.get("school_ids", [])) - known_schools)
        if unknown:
            messages.append(
                f"documents.{document.get('id', '<unknown>')}: unknown schools: "
                + ", ".join(unknown)
            )

    tasks = data.get("tasks", [])
    task_ids = [task.get("id") for task in tasks]
    duplicate_tasks = duplicates(task_ids)
    if duplicate_tasks:
        messages.append(f"tasks: duplicate ids: {', '.join(duplicate_tasks)}")
    known_tasks = set(task_ids)
    task_by_id = {task.get("id"): task for task in tasks}
    for task in tasks:
        task_id = task.get("id", "<unknown>")
        if task.get("school_id") and task["school_id"] not in known_schools:
            messages.append(f"tasks.{task_id}: unknown school: {task['school_id']}")
        dependencies = task.get("depends_on", [])
        unknown = sorted(set(dependencies) - known_tasks)
        if unknown:
            messages.append(f"tasks.{task_id}: unknown dependencies: {', '.join(unknown)}")
        if task_id in dependencies:
            messages.append(f"tasks.{task_id}: task cannot depend on itself")

    remaining = {
        task_id: {dependency for dependency in task.get("depends_on", []) if dependency in known_tasks}
        for task_id, task in task_by_id.items()
    }
    ready = [task_id for task_id, dependencies in remaining.items() if not dependencies]
    processed: set[str] = set()
    while ready:
        completed = ready.pop()
        processed.add(completed)
        for task_id, dependencies in remaining.items():
            if completed in dependencies:
                dependencies.remove(completed)
                if not dependencies and task_id not in processed and task_id not in ready:
                    ready.append(task_id)
    cyclic = sorted(set(remaining) - processed)
    if cyclic:
        messages.append(f"tasks: dependency cycle detected: {', '.join(cyclic)}")

    essay_ids = [essay.get("id") for essay in data.get("essays", [])]
    duplicate_essays = duplicates(essay_ids)
    if duplicate_essays:
        messages.append(f"essays: duplicate ids: {', '.join(duplicate_essays)}")
    for essay in data.get("essays", []):
        essay_id = essay.get("id", "<unknown>")
        if essay.get("school_id") and essay["school_id"] not in known_schools:
            messages.append(f"essays.{essay_id}: unknown school: {essay['school_id']}")
        for field in ("versions", "reviews"):
            duplicate_entries = duplicates(entry.get("id") for entry in essay.get(field, []))
            if duplicate_entries:
                messages.append(f"essays.{essay_id}.{field}: duplicate ids: {', '.join(duplicate_entries)}")

    known_essays = set(essay_ids)
    for pinned in data.get("settings", {}).get("pinned_items", []):
        if not isinstance(pinned, str):
            continue
        kind, separator, item_id = pinned.partition(":")
        if not separator or (kind == "document" and item_id not in known_documents) or (kind == "essay" and item_id not in known_essays):
            messages.append(f"settings.pinned_items: unknown pinned item: {pinned}")

    for school in data.get("schools", []):
        school_id = school.get("id", "<unknown>")
        checklist = school.get("application_checklist", [])
        duplicate_items = duplicates(item.get("id") for item in checklist)
        if duplicate_items:
            messages.append(
                f"schools.{school_id}.application_checklist: duplicate ids: "
                + ", ".join(duplicate_items)
            )
        for item in checklist:
            if item.get("document_id") and item["document_id"] not in known_documents:
                messages.append(
                    f"schools.{school_id}.application_checklist.{item.get('id')}: "
                    f"unknown document: {item['document_id']}"
                )

    if messages:
        raise GradPilotError("Database validation failed:\n - " + "\n - ".join(messages))


def duplicates(values: Iterable[Any]) -> list[str]:
    seen: set[Any] = set()
    repeated: set[str] = set()
    for value in values:
        if value in seen:
            repeated.add(str(value))
        seen.add(value)
    return sorted(repeated)


def load_database(
    explicit: str | Path | None = None, *, validate: bool = True
) -> tuple[dict[str, Any], Path]:
    path = resolve_data_path(explicit)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise GradPilotError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise GradPilotError(f"Expected a JSON object in {path}")
    if validate:
        validate_database(data)
    return data, path


def write_json_atomic(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False, newline="\n"
    ) as handle:
        temporary = Path(handle.name)
        handle.write(serialized)
    os.replace(temporary, path)


def dashboard_seed(
    data: dict[str, Any], profile: dict[str, Any], *, source_is_example: bool
) -> dict[str, Any]:
    """Enrich the public example with profile data without mutating private databases."""
    seed = copy.deepcopy(data)
    if source_is_example:
        applicant = profile.get("applicant", {})
        seed["applicant"].update(applicant)
        seed["cycle"]["target_term"] = applicant.get(
            "target_term", seed["cycle"]["target_term"]
        )
        if profile.get("recommenders"):
            seed["recommenders"] = copy.deepcopy(profile["recommenders"])
        links = profile.get("links", {})
        link_keys = {
            "homepage": "homepage",
            "github": "github",
            "paper-pdf": "paper_pdf",
            "demo-youtube": "demo_youtube",
            "demo-bilibili": "demo_bilibili",
        }
        for asset in seed.get("assets", []):
            key = link_keys.get(asset.get("id"))
            if key and links.get(key):
                asset["url"] = links[key]
        follow_up = profile.get("email", {}).get("follow_up_after_days")
        if follow_up:
            seed["settings"]["follow_up_after_days"] = int(follow_up)
    return seed


def parse_deadline(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise GradPilotError(f"Deadline must include a UTC offset: {value}")
    return parsed


def deadline_details(
    school: dict[str, Any], now: datetime | None = None
) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    deadline = parse_deadline(school["deadline"])
    seconds = (deadline - current).total_seconds()
    return {
        "deadline": deadline,
        "days": math.ceil(seconds / 86400),
        "overdue": seconds < 0,
        "verified": bool(school.get("deadline_verified")),
    }


def deadline_in_timezone(school: dict[str, Any], timezone_name: str) -> datetime:
    deadline = parse_deadline(school["deadline"])
    try:
        return deadline.astimezone(ZoneInfo(timezone_name))
    except ZoneInfoNotFoundError:
        return deadline


def school_deadline_key(school: dict[str, Any]) -> datetime:
    return parse_deadline(school["deadline"])


def normalized(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def find_school(data: dict[str, Any], query: str) -> dict[str, Any]:
    needle = normalized(query)
    schools = data.get("schools", [])
    exact = [
        school
        for school in schools
        if needle
        in {
            normalized(school.get("id")),
            normalized(school.get("name")),
            *(normalized(alias) for alias in school.get("aliases", [])),
        }
    ]
    if len(exact) == 1:
        return exact[0]
    candidates = [
        school
        for school in schools
        if needle in normalized(school.get("id"))
        or needle in normalized(school.get("name"))
        or any(needle in normalized(alias) for alias in school.get("aliases", []))
    ]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise GradPilotError(f"No school matches {query!r}")
    names = ", ".join(school["id"] for school in candidates)
    raise GradPilotError(f"School query {query!r} is ambiguous: {names}")


def find_pi(school: dict[str, Any], query: str) -> dict[str, Any]:
    needle = normalized(query)
    people = school.get("target_pis", [])
    exact = [
        pi
        for pi in people
        if needle in {normalized(pi.get("id")), normalized(pi.get("name"))}
    ]
    if len(exact) == 1:
        return exact[0]
    candidates = [
        pi
        for pi in people
        if needle in normalized(pi.get("id")) or needle in normalized(pi.get("name"))
    ]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise GradPilotError(f"No PI named {query!r} at {school['name']}")
    names = ", ".join(pi["name"] for pi in candidates)
    raise GradPilotError(f"PI query {query!r} is ambiguous: {names}")


def iter_pis(
    data: dict[str, Any], school_query: str | None = None
) -> Iterable[tuple[dict[str, Any], dict[str, Any]]]:
    schools = [find_school(data, school_query)] if school_query else data.get("schools", [])
    for school in schools:
        for pi in school.get("target_pis", []):
            yield school, pi


def recommender_by_id(
    data: dict[str, Any], recommender_id: str
) -> dict[str, Any] | None:
    return next(
        (
            person
            for person in data.get("recommenders", [])
            if person.get("id") == recommender_id
        ),
        None,
    )


def find_recommender(data: dict[str, Any], query: str) -> dict[str, Any]:
    needle = normalized(query)
    people = data.get("recommenders", [])
    exact = [
        person
        for person in people
        if needle
        in {
            normalized(person.get("id")),
            normalized(person.get("name")),
            normalized(person.get("display_name")),
        }
    ]
    if len(exact) == 1:
        return exact[0]
    candidates = [
        person
        for person in people
        if needle in normalized(person.get("id"))
        or needle in normalized(person.get("name"))
        or needle in normalized(person.get("display_name"))
    ]
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise GradPilotError(f"No recommender matches {query!r}")
    names = ", ".join(person["id"] for person in candidates)
    raise GradPilotError(f"Recommender query {query!r} is ambiguous: {names}")


def pending_recommendations(
    data: dict[str, Any], recommender_id: str
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    pending = []
    for school in data.get("schools", []):
        for assignment in school.get("recommendations", {}).get("assignments", []):
            if (
                assignment.get("recommender_id") == recommender_id
                and assignment.get("status") != "submitted"
            ):
                pending.append((school, assignment))
    return sorted(pending, key=lambda item: school_deadline_key(item[0]))


def today_iso() -> str:
    return date.today().isoformat()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return slug or "item"
