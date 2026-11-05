#!/usr/bin/env python3
"""Render deadline, recommendation-letter and outreach risk in a Rich table."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, time, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (
    EXAMPLE_DATA,
    GradPilotError,
    deadline_details,
    deadline_in_timezone,
    load_database,
)
from rich.console import Console
from rich.panel import Panel
from rich.table import Table


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", help="Application JSON path")
    parser.add_argument("--days", type=int, help="Only show deadlines within this many days")
    parser.add_argument(
        "--include-closed", action="store_true", help="Include schools marked Closed"
    )
    parser.add_argument(
        "--today", help="ISO date for reproducible checks (defaults to the current time)"
    )
    parser.add_argument("--json", action="store_true", dest="as_json", help="Emit JSON")
    return parser.parse_args()


def submitted_status(school: dict) -> bool:
    return school.get("status") in {"Submitted", "Interview", "Waitlisted", "Admitted"}


def recommendation_stats(school: dict) -> dict[str, int]:
    recommendation = school.get("recommendations", {})
    assignments = recommendation.get("assignments", [])
    required = int(recommendation.get("required", 3))
    submitted = sum(item.get("status") == "submitted" for item in assignments)
    return {
        "required": required,
        "assigned": len(assignments),
        "submitted": submitted,
        "missing_assignments": max(0, required - len(assignments)),
        "pending": max(0, required - submitted),
    }


def outreach_stats(school: dict) -> tuple[int, int]:
    people = school.get("target_pis", [])
    contacted = sum(
        pi.get("contact", {}).get("status")
        in {"sent", "follow_up_sent", "replied", "meeting"}
        for pi in people
    )
    return contacted, len(people)


def assess(school: dict, now: datetime, warning_days: int) -> dict:
    details = deadline_details(school, now)
    lor = recommendation_stats(school)
    contacted, pi_count = outreach_stats(school)
    is_submitted = submitted_status(school)
    days = details["days"]

    if not is_submitted and details["overdue"]:
        level, label = "critical", "DEADLINE PASSED"
    elif not is_submitted and days <= 7:
        level, label = "critical", "DUE ≤7D"
    elif lor["missing_assignments"] and days <= 30:
        level, label = "critical", "LOR UNASSIGNED"
    elif not is_submitted and days <= 30:
        level, label = "serious", "DUE ≤30D"
    elif lor["missing_assignments"]:
        level, label = "serious", "LOR GAP"
    elif is_submitted and lor["pending"]:
        level, label = "serious", "LOR PENDING"
    elif not is_submitted and days <= warning_days:
        level, label = "warning", "PLAN NOW"
    elif contacted == 0 and not is_submitted:
        level, label = "warning", "NO OUTREACH"
    else:
        level, label = "good", "ON TRACK"

    return {
        "id": school["id"],
        "school": school["name"],
        "program": school["program_name"],
        "department_track": school["department_track"],
        "track_type": school["track_type"],
        "deadline": details["deadline"].isoformat(),
        "days": days,
        "deadline_verified": details["verified"],
        "status": school["status"],
        "recommendations": lor,
        "pis_contacted": contacted,
        "pis_total": pi_count,
        "risk": level,
        "risk_label": label,
    }


def main() -> int:
    args = parse_args()
    console = Console(stderr=bool(args.as_json), legacy_windows=False)
    try:
        data, path = load_database(args.data)
        now = datetime.now(timezone.utc)
        if args.today:
            now = datetime.combine(
                datetime.fromisoformat(args.today).date(), time(hour=12), timezone.utc
            )
        timezone_name = data.get("cycle", {}).get("timezone", "Asia/Shanghai")
        warning_days = int(data.get("settings", {}).get("deadline_warning_days", 30))
        rows = [assess(school, now, warning_days) for school in data["schools"]]
        if not args.include_closed:
            rows = [row for row in rows if row["status"] != "Closed"]
        if args.days is not None:
            if args.days < 0:
                raise GradPilotError("--days must be zero or greater")
            rows = [row for row in rows if 0 <= row["days"] <= args.days]
        school_by_id = {school["id"]: school for school in data["schools"]}
        rows.sort(key=lambda row: (row["deadline"], row["school"]))

        if args.as_json:
            print(
                json.dumps(
                    {"source": str(path), "generated_at": now.isoformat(), "rows": rows},
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0

        table = Table(
            title="GradPilot · 申请截止与材料风险",
            title_style="bold cyan",
            header_style="bold cyan",
            show_lines=False,
            expand=True,
        )
        for column in ("风险", "院校 / Track", "截止日", "倒计时", "申请", "推荐信", "套磁"):
            table.add_column(column)
        styles = {"critical": "bold red", "serious": "dark_orange", "warning": "yellow", "good": "green"}
        symbols = {"critical": "X", "serious": "!", "warning": "*", "good": "OK"}
        for row in rows:
            school = school_by_id[row["id"]]
            local_deadline = deadline_in_timezone(school, timezone_name)
            estimate = "" if row["deadline_verified"] else "~"
            deadline_text = (
                f"{estimate}{local_deadline:%Y-%m-%d %H:%M}\n"
                f"[dim]{local_deadline:%Z} · {school['department_track']}[/]"
            )
            days = row["days"]
            countdown = "已过期" if days < 0 else ("今天" if days == 0 else f"{days} 天")
            lor = row["recommendations"]
            lor_text = f"{lor['submitted']}/{lor['required']} 已交"
            if lor["missing_assignments"]:
                lor_text += f"\n[bold red]缺分配 {lor['missing_assignments']}[/]"
            elif lor["pending"]:
                lor_text += f"\n[yellow]待交 {lor['pending']}[/]"
            style = styles[row["risk"]]
            table.add_row(
                f"[{style}]{symbols[row['risk']]} {row['risk_label']}[/]",
                f"[bold]{row['school']}[/]\n[dim]{row['department_track']} · {row['track_type']}[/]",
                deadline_text,
                countdown,
                row["status"],
                lor_text,
                f"{row['pis_contacted']}/{row['pis_total']} 已联系",
                style=style if days <= 7 and not submitted_status(school) else None,
            )
        console.print(table)
        counts = {level: sum(row["risk"] == level for row in rows) for level in styles}
        console.print(
            Panel(
                f"[red]高危 {counts['critical']}[/]  [dark_orange]紧迫 {counts['serious']}[/]  "
                f"[yellow]关注 {counts['warning']}[/]  [green]正常 {counts['good']}[/]\n"
                f"数据源: {path}\n"
                f"显示时区: {timezone_name} · '~' 表示尚未官网核验的规划日期",
                title="摘要",
                border_style="cyan",
            )
        )
        if path == EXAMPLE_DATA:
            console.print("[yellow]当前为示例数据；真实进度请写入 applications.private.json。[/]")
        if not rows:
            console.print("[green]当前筛选条件下没有项目。[/]")
        return 0
    except (GradPilotError, OSError, ValueError) as exc:
        if args.as_json:
            print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        else:
            console.print(f"[bold red]error:[/] {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
