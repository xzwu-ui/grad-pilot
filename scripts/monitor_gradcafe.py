#!/usr/bin/env python3
"""Monitor public GradCafe search pages with local snapshots and new-row diffs."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urljoin

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests
from bs4 import BeautifulSoup
from common import ROOT, GradPilotError, slugify, write_json_atomic
from rich.console import Console
from rich.table import Table

DEFAULT_ENDPOINT = "https://www.thegradcafe.com/survey/index.php"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", default="robotics", help="Public GradCafe search query")
    parser.add_argument("--url", help="Override the full search URL")
    parser.add_argument("--max-results", type=int, default=50, help="Maximum rows to retain")
    parser.add_argument("--show-all", action="store_true", help="Show retained rows, not only new rows")
    parser.add_argument("--snapshot", type=Path, help="Snapshot JSON path")
    parser.add_argument("--offline-html", type=Path, help="Parse a saved page without network access")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds")
    return parser.parse_args()


def clean_text(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def parse_rows(page_html: str, source_url: str, limit: int) -> list[dict]:
    soup = BeautifulSoup(page_html, "html.parser")
    rows = []
    seen = set()
    for row in soup.select("tr"):
        cells = row.find_all(["td", "th"], recursive=False)
        if not cells or row.find("th") and not row.find("td"):
            continue
        text = clean_text(row)
        if not text:
            continue
        row_id = hashlib.sha256(text.casefold().encode("utf-8")).hexdigest()[:20]
        if row_id in seen:
            continue
        seen.add(row_id)
        links = []
        for anchor in row.select("a[href]"):
            href = anchor.get("href", "")
            if href:
                links.append(urljoin(source_url, href))
        rows.append(
            {
                "id": row_id,
                "text": text,
                "columns": [clean_text(cell) for cell in cells],
                "links": list(dict.fromkeys(links)),
            }
        )
        if len(rows) >= limit:
            break
    return rows


def main() -> int:
    args = parse_args()
    console = Console()
    try:
        if args.max_results < 1:
            raise GradPilotError("--max-results must be at least 1")
        if args.timeout <= 0:
            raise GradPilotError("--timeout must be positive")
        source_url = args.url or f"{DEFAULT_ENDPOINT}?{urlencode({'q': args.query})}"
        if args.offline_html:
            page_html = args.offline_html.read_text(encoding="utf-8")
        else:
            response = requests.get(
                source_url,
                timeout=args.timeout,
                headers={
                    "User-Agent": "GradPilot/0.1 (single-request personal admissions research)",
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            response.raise_for_status()
            page_html = response.text
            source_url = response.url

        rows = parse_rows(page_html, source_url, args.max_results)
        snapshot_path = args.snapshot or ROOT / ".state" / f"gradcafe-{slugify(args.query)}.json"
        previous = None
        if snapshot_path.is_file():
            previous = json.loads(snapshot_path.read_text(encoding="utf-8"))
        old_ids = {row["id"] for row in (previous or {}).get("results", [])}
        if not rows and previous and previous.get("results"):
            console.print(
                "[yellow]No table rows were parsed, so the existing non-empty snapshot was "
                "left unchanged. The site may have changed its markup or presented an access "
                f"challenge. Inspect {source_url} before retrying.[/]"
            )
            return 3
        new_rows = [row for row in rows if row["id"] not in old_ids]
        snapshot = {
            "version": 1,
            "query": args.query,
            "source_url": source_url,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "parser": "generic-table-v1",
            "results": rows,
        }
        write_json_atomic(snapshot_path, snapshot)

        visible = rows if args.show_all or previous is None else new_rows
        table = Table(
            title="GradCafe baseline" if previous is None else f"GradCafe · {len(new_rows)} new row(s)",
            header_style="bold cyan",
            expand=True,
        )
        table.add_column("State", width=12)
        table.add_column("Result", overflow="fold")
        for row in visible:
            state = "BASELINE" if previous is None else ("NEW" if row["id"] in {item["id"] for item in new_rows} else "seen")
            table.add_row(state, row["text"])
        console.print(table)
        if not rows:
            console.print(
                "[yellow]No table rows were parsed. The site may have changed its markup, "
                "returned an empty search, or presented an access challenge. The snapshot was "
                "still saved; inspect source_url before relying on this result.[/]"
            )
        if previous is not None and not new_rows:
            console.print("[green]No new rows since the previous snapshot.[/]")
        console.print(f"Source: {source_url}\nSnapshot: {snapshot_path}")
        console.print(
            "[dim]One explicit request per run; no scheduler, login bypass or automatic notification. "
            "GradCafe entries are unverified crowd reports.[/]"
        )
        return 0
    except (OSError, ValueError, requests.RequestException, json.JSONDecodeError, GradPilotError) as exc:
        console.print(f"[bold red]error:[/] {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
