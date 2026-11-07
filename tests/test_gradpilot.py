from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "sop-engine"))

import build_sop  # noqa: E402
import check_deadlines  # noqa: E402
import gen_cold_email  # noqa: E402
import monitor_gradcafe  # noqa: E402
from common import (  # noqa: E402
    GradPilotError,
    dashboard_seed,
    deadline_details,
    load_database,
    load_profile,
    pending_recommendations,
    validate_database,
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class GradPilotTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data, cls.data_path = load_database()
        cls.profile, _ = load_profile()
        cls.meta_document = build_sop.load_yaml(ROOT / "sop-engine" / "schools_meta.yaml")

    def school(self, school_id):
        return next(school for school in self.data["schools"] if school["id"] == school_id)

    def render(self, school_id, track=None):
        school = self.school(school_id)
        metadata = build_sop.select_metadata(self.meta_document["schools"][school_id], track)
        metadata["target_term"] = "2028 Fall"
        rendered = build_sop.render_sop(school, metadata, self.profile)
        issues = build_sop.lint_sop(
            rendered,
            school,
            metadata,
            self.data["schools"],
            self.meta_document["global_banned_terms"],
        )
        return rendered, issues


class DataTests(GradPilotTestCase):
    def test_seed_has_north_american_and_asian_portfolio(self):
        self.assertEqual(len(self.data["schools"]), 19)
        asia = {school["id"] for school in self.data["schools"] if school["region"] == "Asia"}
        self.assertEqual(asia, {"hku", "cuhk", "nus", "ntu"})
        for school in self.data["schools"]:
            self.assertFalse(school["deadline_verified"])
            self.assertTrue(school["deadline"].startswith("2027-"))
            for pi in school["target_pis"]:
                self.assertGreaterEqual(len(pi["recent_work_keywords"]), 2)

    def test_schema_accepts_researching_school_without_pis(self):
        candidate = copy.deepcopy(self.data)
        candidate["schools"][0]["target_pis"] = []
        validate_database(candidate)

    def test_schema_rejects_unknown_recommender(self):
        candidate = copy.deepcopy(self.data)
        candidate["schools"][0]["recommendations"]["assignments"][0]["recommender_id"] = "unknown-person"
        with self.assertRaisesRegex(GradPilotError, "unknown recommenders"):
            validate_database(candidate)

    def test_dashboard_enriches_only_example_source(self):
        profile = copy.deepcopy(self.profile)
        profile["applicant"]["name"] = "Test Applicant"
        enriched = dashboard_seed(self.data, profile, source_is_example=True)
        self.assertEqual(enriched["applicant"]["name"], "Test Applicant")
        untouched = dashboard_seed(self.data, profile, source_is_example=False)
        self.assertEqual(untouched["applicant"]["name"], "Your Name")
        self.assertEqual(self.data["applicant"]["name"], "Your Name")

    def test_pending_letters_are_sorted(self):
        pending = pending_recommendations(self.data, "dut-advisor")
        self.assertEqual(len(pending), 19)
        deadlines = [school["deadline"] for school, _ in pending]
        self.assertEqual(deadlines, sorted(deadlines))

    def test_deadline_countdown_and_offset(self):
        school = self.school("berkeley")
        now = datetime(2027, 12, 1, 12, tzinfo=timezone.utc)
        details = deadline_details(school, now)
        self.assertEqual(details["days"], 8)
        self.assertIn("-08:00", school["deadline"])

    def test_visa_and_campus_collections_validate(self):
        countries = {school["country"] for school in self.data["schools"]}
        self.assertEqual({record["country"] for record in self.data["visa_records"]}, countries)
        for school in self.data["schools"]:
            self.assertEqual(school["visa"]["status"], "not_started")
            self.assertFalse(school["campus"]["verified"])
            self.assertGreaterEqual(school["campus"]["living_cost_monthly_usd"], 0)

    def test_visa_records_reject_duplicate_ids_and_invalid_status(self):
        candidate = copy.deepcopy(self.data)
        candidate["visa_records"].append(copy.deepcopy(candidate["visa_records"][0]))
        with self.assertRaisesRegex(GradPilotError, "visa_records: duplicate ids"):
            validate_database(candidate)

        candidate = copy.deepcopy(self.data)
        candidate["visa_records"][0]["status"] = "already_enrolled"
        with self.assertRaisesRegex(GradPilotError, "visa_records.0.status"):
            validate_database(candidate)

    def test_school_visa_and_campus_field_limits(self):
        candidate = copy.deepcopy(self.data)
        candidate["schools"][0]["visa"]["status"] = "bogus"
        with self.assertRaisesRegex(GradPilotError, "schools.0.visa"):
            validate_database(candidate)

        candidate = copy.deepcopy(self.data)
        candidate["schools"][0]["campus"]["environment_rating"] = 9
        with self.assertRaisesRegex(GradPilotError, "environment_rating"):
            validate_database(candidate)

        candidate = copy.deepcopy(self.data)
        candidate["schools"][0]["campus"]["living_cost_monthly_usd"] = -1
        with self.assertRaisesRegex(GradPilotError, "living_cost_monthly_usd"):
            validate_database(candidate)
    def test_workspace_collections_validate_and_reject_unknown_references(self):
        candidate = copy.deepcopy(self.data)
        candidate["documents"] = [{
            "id": "cv-master", "label": "CV", "category": "cv", "status": "final",
            "file_path": "private/cv.pdf", "version": "v1", "updated_on": "2026-11-04",
            "school_ids": ["berkeley"], "notes": "",
        }]
        candidate["tasks"] = [
            {"id": "verify-first", "title": "Verify", "school_id": "berkeley", "due_date": "2027-10-01", "category": "research", "status": "todo", "depends_on": [], "notes": ""},
            {"id": "write-second", "title": "Write", "school_id": "berkeley", "due_date": "2027-10-02", "category": "writing", "status": "todo", "depends_on": ["verify-first"], "notes": ""},
        ]
        candidate["essays"] = [{
            "id": "berkeley-sop", "school_id": "berkeley", "type": "SoP", "title": "SoP",
            "content": "Draft", "word_limit": 1000, "status": "draft", "versions": [],
            "reviews": [], "updated_at": "2026-11-04T00:00:00Z",
        }]
        candidate["schools"][0]["application_checklist"] = [{
            "id": "berkeley-cv", "label": "CV", "category": "documents", "required": True,
            "status": "ready", "document_id": "cv-master", "source_url": "https://example.edu",
            "verified": True, "notes": "", "completed_on": "2026-11-04",
        }]
        validate_database(candidate)
        candidate["schools"][0]["application_checklist"][0]["document_id"] = "missing-document"
        with self.assertRaisesRegex(GradPilotError, "unknown document"):
            validate_database(candidate)

    def test_workspace_extensions_validate_and_waitlist_is_submitted(self):
        candidate = copy.deepcopy(self.data)
        school = candidate["schools"][0]
        school["status"] = "Waitlisted"
        school["funding"] = {
            "types": ["Departmental", "External"], "consideration": "separate",
            "deadline": "2027-11-15", "source_url": "https://example.edu/funding",
            "verified": True, "last_verified": "2026-11-04", "notes": "Separate fellowship form",
        }
        school["application_policy"] = {
            "supervisor_contact": "allowed", "interview": "required",
            "source_url": "https://example.edu/policy", "verified": True,
            "last_verified": "2026-11-04",
        }
        school["decision"] = {
            "close_reason": None, "decision_date": "2028-02-01",
            "response_deadline": "2028-02-15", "notes": "Waitlist response",
        }
        history = [{
            "id": "call-1", "date": "2026-11-05", "kind": "call", "subject": "Enquiry",
            "notes": "Discussed funding", "questions": "Is funding separate?",
            "outcomes": "A separate form is required", "funding_notes": "Departmental fellowship",
            "next_action": "Review the official form", "follow_up_date": "2026-11-12",
        }, {
            "id": "meeting-1", "date": "2026-11-08", "kind": "meeting", "subject": "Research",
            "notes": "Discussed research fit", "questions": "Which project?",
            "outcomes": "Whole-body control", "funding_notes": "",
            "next_action": "Read the suggested paper", "follow_up_date": None,
        }]
        school["target_pis"][0].setdefault("contact", {})["history"] = history
        candidate["documents"] = [{
            "id": "cv-master", "label": "CV", "category": "cv", "status": "final",
            "file_path": "private/cv.pdf", "version": "v1", "updated_on": "2026-11-04",
            "school_ids": [], "notes": "",
        }]
        candidate["essays"] = [{
            "id": "master-sop", "school_id": None, "type": "SoP", "title": "Master SoP",
            "content": "Draft", "word_limit": 1000, "status": "draft", "versions": [],
            "reviews": [], "updated_at": "2026-11-04T00:00:00Z",
        }]
        candidate["settings"]["pinned_items"] = ["document:cv-master", "essay:master-sop"]
        validate_database(candidate)
        self.assertTrue(check_deadlines.submitted_status(school))

        school["target_pis"][0]["contact"]["history"].append(copy.deepcopy(history[0]))
        with self.assertRaisesRegex(GradPilotError, "contact.history: duplicate ids"):
            validate_database(candidate)

    def test_shortlist_and_global_season_fields_validate(self):
        candidate = copy.deepcopy(self.data)
        pi = candidate["schools"][0]["target_pis"][0]
        pi["shortlisted"] = True
        pi["shortlisted_on"] = "2026-11-04"
        candidate["tasks"] = [{
            "id": "season-foundation", "title": "科研与证据积累：完成阶段复盘",
            "school_id": None, "due_date": "2027-06-30", "category": "research",
            "status": "todo", "depends_on": [], "notes": "Planning milestone",
            "season_phase": "foundation", "season_term": "2028 Fall",
        }]
        validate_database(candidate)
        pi["shortlisted"] = "yes"
        with self.assertRaisesRegex(GradPilotError, "shortlisted"):
            validate_database(candidate)
        pi["shortlisted"] = True
        candidate["tasks"][0]["season_phase"] = "unknown-phase"
        with self.assertRaisesRegex(GradPilotError, "season_phase"):
            validate_database(candidate)

    def test_unknown_pinned_item_is_rejected(self):
        candidate = copy.deepcopy(self.data)
        candidate["settings"]["pinned_items"] = ["document:missing-document"]
        with self.assertRaisesRegex(GradPilotError, "unknown pinned item"):
            validate_database(candidate)

    def test_task_dependency_cycle_is_rejected(self):
        candidate = copy.deepcopy(self.data)
        candidate["tasks"] = [
            {"id": "task-a", "title": "A", "school_id": None, "due_date": "2027-10-01", "category": "other", "status": "todo", "depends_on": ["task-b"], "notes": ""},
            {"id": "task-b", "title": "B", "school_id": None, "due_date": "2027-10-02", "category": "other", "status": "todo", "depends_on": ["task-a"], "notes": ""},
        ]
        with self.assertRaisesRegex(GradPilotError, "dependency cycle"):
            validate_database(candidate)


class SopTests(GradPilotTestCase):
    def test_every_default_school_passes_cross_school_lint(self):
        for school in self.data["schools"]:
            with self.subTest(school=school["id"]):
                _, issues = self.render(school["id"])
                self.assertFalse([issue for issue in issues if issue.severity == "error"])

    def test_track_conditionals_are_distinct(self):
        cs, _ = self.render("berkeley")
        robotics, _ = self.render("cmu")
        me, issues = self.render("stanford", "ME")
        self.assertIn("Within a Computer Science track", cs)
        self.assertNotIn("Within a Mechanical Engineering track", cs)
        self.assertIn("Within a robotics-centered track", robotics)
        self.assertIn("Within a Mechanical Engineering track", me)
        self.assertIn("Ph.D. in Mechanical Engineering", me)
        self.assertFalse([issue for issue in issues if issue.severity == "error"])

    def test_linter_detects_injected_school_name(self):
        rendered, _ = self.render("berkeley")
        school = self.school("berkeley")
        metadata = build_sop.select_metadata(self.meta_document["schools"]["berkeley"], None)
        issues = build_sop.lint_sop(
            rendered + "\nStanford\n",
            school,
            metadata,
            self.data["schools"],
            self.meta_document["global_banned_terms"],
        )
        self.assertTrue(any(issue.code == "BANNED_TERM" for issue in issues))

    def test_linter_detects_unrendered_marker(self):
        rendered, _ = self.render("berkeley")
        school = self.school("berkeley")
        metadata = build_sop.select_metadata(self.meta_document["schools"]["berkeley"], None)
        issues = build_sop.lint_sop(
            rendered + "\n[[ applicant.name ]]\n",
            school,
            metadata,
            self.data["schools"],
            self.meta_document["global_banned_terms"],
        )
        self.assertTrue(any(issue.code == "UNRENDERED_TEMPLATE" for issue in issues))


class EmailTests(GradPilotTestCase):
    def test_initial_email_subject_links_and_hardware(self):
        school = self.school("berkeley")
        pi = next(pi for pi in school["target_pis"] if pi["id"] == "sergey-levine")
        draft = gen_cold_email.email_content(school, pi, self.profile, "2028 Fall", False)
        self.assertEqual(
            draft["subject"],
            "Prospective Ph.D. Student 2028 Fall - Humanoid Loco-Manipulation & Sim-to-Real (Your Name)",
        )
        first_paragraph = draft["body"].split("\n\n")[1]
        self.assertIn("Unitree G1/H2", first_paragraph)
        self.assertIn(self.profile["links"]["homepage"], first_paragraph)
        self.assertIn(self.profile["links"]["paper_pdf"], first_paragraph)
        self.assertIn(self.profile["links"]["demo_youtube"], first_paragraph)
        self.assertIn("offline-to-online reinforcement learning", draft["body"])

    def test_follow_up_is_short_and_threaded(self):
        school = self.school("berkeley")
        pi = school["target_pis"][0]
        draft = gen_cold_email.email_content(school, pi, self.profile, "2028 Fall", True)
        self.assertTrue(draft["subject"].startswith("Re: Prospective Ph.D. Student 2028 Fall"))
        self.assertLess(len(draft["body"]), 1700)

    def test_placeholder_links_create_pre_send_warnings(self):
        school = self.school("berkeley")
        notes = gen_cold_email.internal_notes(school, school["target_pis"][0], self.profile)
        self.assertTrue(any("placeholder profile link" in note for note in notes))
        self.assertTrue(any("real name" in note for note in notes))

    def test_html_linkifier_escapes_once_and_removes_sentence_punctuation(self):
        rendered = gen_cold_email.linkify_urls(
            "Demo https://example.test/v?id=1&x=2. Next <script>"
        )
        self.assertIn('href="https://example.test/v?id=1&amp;x=2"', rendered)
        self.assertIn("</a>. Next &lt;script&gt;", rendered)
        self.assertNotIn("x=2.</a>", rendered)

    def test_cli_writes_markdown_and_html(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [
                    sys.executable,
                    "-I",
                    str(ROOT / "scripts" / "gen_cold_email.py"),
                    "--school",
                    "berkeley",
                    "--pi",
                    "sergey-levine",
                    "--format",
                    "both",
                    "--output-dir",
                    directory,
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            files = list(Path(directory).glob("berkeley__sergey-levine__initial.*"))
            self.assertEqual({path.suffix for path in files}, {".md", ".html"})
            markdown = next(path for path in files if path.suffix == ".md").read_text(encoding="utf-8")
            self.assertIn("2028 Fall", markdown)
            self.assertIn("Internal pre-send checks", markdown)
    def test_verified_reading_notes_personalize_email(self):
        school = self.school("berkeley")
        pi = copy.deepcopy(next(pi for pi in school["target_pis"] if pi["id"] == "sergey-levine"))
        pi.update({
            "paper_title": "A Verified Robot Learning Paper",
            "paper_url": "https://example.edu/paper.pdf",
            "paper_notes": "the evaluation method connects directly to my physical-robot experiments.",
            "admissions_status": "accepting",
        })
        unverified = gen_cold_email.email_content(school, pi, self.profile, "2028 Fall", False)
        self.assertNotIn("A Verified Robot Learning Paper", unverified["body"])
        pi["verification_status"] = "verified_official"
        verified = gen_cold_email.email_content(school, pi, self.profile, "2028 Fall", False)
        self.assertIn("A Verified Robot Learning Paper", verified["body"])
        self.assertIn("the evaluation method connects", verified["body"])
        self.assertIn("https://example.edu/paper.pdf", verified["body"])

    def test_not_accepting_pi_has_explicit_presend_warning(self):
        school = self.school("berkeley")
        pi = copy.deepcopy(school["target_pis"][0])
        pi["admissions_status"] = "not_accepting"
        notes = gen_cold_email.internal_notes(school, pi, self.profile)
        self.assertTrue(any("not accepting students" in note for note in notes))


class MonitorTests(GradPilotTestCase):
    def test_offline_table_parser(self):
        page = """
        <html><body><table>
          <tr><th>School</th><th>Status</th></tr>
          <tr><td>Example University</td><td>Accepted</td></tr>
          <tr><td>Another University</td><td><a href='/detail/2'>Interview</a></td></tr>
        </table></body></html>
        """
        rows = monitor_gradcafe.parse_rows(page, "https://example.test/search?q=robotics", 10)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["columns"], ["Example University", "Accepted"])
        self.assertEqual(rows[1]["links"], ["https://example.test/detail/2"])
        self.assertEqual(len({row["id"] for row in rows}), 2)
    def test_empty_refresh_preserves_non_empty_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            valid_html = root / "valid.html"
            valid_html.write_text(
                "<table><tr><td>Example University</td><td>Accepted</td></tr></table>",
                encoding="utf-8",
            )
            empty_html = root / "empty.html"
            empty_html.write_text("<html><body>Access challenge</body></html>", encoding="utf-8")
            snapshot = root / "snapshot.json"
            command = [
                sys.executable,
                "-I",
                str(ROOT / "scripts" / "monitor_gradcafe.py"),
                "--query",
                "test",
                "--snapshot",
                str(snapshot),
            ]
            first = subprocess.run(
                [*command, "--offline-html", str(valid_html)],
                cwd=ROOT,
                capture_output=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(first.returncode, 0, first.stderr)
            baseline = snapshot.read_bytes()
            second = subprocess.run(
                [*command, "--offline-html", str(empty_html)],
                cwd=ROOT,
                capture_output=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(second.returncode, 3, second.stderr)
            self.assertEqual(snapshot.read_bytes(), baseline)


if __name__ == "__main__":
    unittest.main()
