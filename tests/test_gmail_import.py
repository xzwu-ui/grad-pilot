from __future__ import annotations

import base64
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import gmail_review  # noqa: E402
import import_gmail  # noqa: E402
from common import EXAMPLE_DATA, GradPilotError, load_database, validate_database  # noqa: E402


def encode(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii").rstrip("=")


def message(
    message_id: str,
    text: str,
    subject: str = "PhD application update",
    sender: str = "Graduate Admissions <admissions@example.edu>",
    date: str = "Sun, 1 Feb 2028 10:00:00 -0800",
) -> dict:
    return {
        "id": message_id,
        "threadId": f"thread-{message_id}",
        "snippet": text[:140],
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "Subject", "value": subject},
                {"name": "From", "value": sender},
                {"name": "Date", "value": date},
            ],
            "body": {"data": encode(text)},
        },
    }


class GmailImportTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data, _ = load_database(EXAMPLE_DATA)

    def candidate(self, raw_message, data=None):
        report = import_gmail.build_report(
            [raw_message], copy.deepcopy(data or self.data), EXAMPLE_DATA, "offline:test", "offline"
        )
        return report["candidates"][0]

    def review(self, data, fields, school_id="berkeley", message_date="2028-02-01"):
        return {
            "kind": "gradpilot-gmail-review",
            "version": 1,
            "batch_id": "test-batch",
            "database_sha256": import_gmail.database_fingerprint(data),
            "approved": [
                {
                    "gmail_message_id": "approved-message",
                    "message_date": message_date,
                    "school_id": school_id,
                    "fields": fields,
                }
            ],
        }


class ParsingTests(GmailImportTestCase):
    def test_admission_extracts_school_id_and_sender_calendar_date(self):
        raw = message(
            "admit-1",
            "We are pleased to offer you admission to UC Berkeley.\n"
            "Application ID: UCB-2028-0042\nSubmission Date: December 1, 2027",
            subject="UC Berkeley PhD admission offer",
            date="Fri, 1 Feb 2028 00:30:00 +0800",
        )
        candidate = self.candidate(raw)
        self.assertEqual(candidate["school_id"], "berkeley")
        self.assertEqual(candidate["raw_status"], "Admitted")
        self.assertEqual(candidate["proposed"]["application_id"], "UCB-2028-0042")
        self.assertEqual(candidate["proposed"]["submission_date"], "2027-12-01")
        self.assertEqual(candidate["proposed"]["status"], "Admitted")
        self.assertEqual(candidate["proposed"]["decision_date"], "2028-02-01")
        self.assertEqual(candidate["confidence"], "high")

    def test_offer_of_admission_and_negated_acceptance_are_distinguished(self):
        offer = self.candidate(
            message("offer-1", "This is an offer of admission to UC Berkeley.")
        )
        self.assertEqual(offer["proposed"]["status"], "Admitted")
        rejected = self.candidate(
            message("not-accepted-1", "You have not been accepted to Stanford University.")
        )
        self.assertEqual(rejected["proposed"]["status"], "Closed")

    def test_rejection_takes_precedence_over_submission_confirmation(self):
        raw = message(
            "reject-1",
            "Thank you for submitting your application to Stanford University. "
            "We regret to inform you that your application was unsuccessful.",
        )
        candidate = self.candidate(raw)
        self.assertEqual(candidate["school_id"], "stanford")
        self.assertEqual(candidate["proposed"]["status"], "Closed")
        self.assertEqual(candidate["proposed"]["close_reason"], "rejected")

    def test_interview_date_and_hyphenated_reference_id(self):
        raw = message(
            "interview-1",
            "MIT interview invitation. Your interview is scheduled for February 10, 2028.\n"
            "Reference ID: MIT-44-XYZ",
        )
        candidate = self.candidate(raw)
        self.assertEqual(candidate["school_id"], "mit")
        self.assertEqual(candidate["proposed"]["status"], "Interview")
        self.assertEqual(candidate["proposed"]["interview_date"], "2028-02-10")
        self.assertEqual(candidate["proposed"]["application_id"], "MIT-44-XYZ")

    def test_waitlist_and_under_review_mapping(self):
        waitlist = self.candidate(message("wait-1", "You have been waitlisted at CMU."))
        self.assertEqual(waitlist["proposed"]["status"], "Waitlisted")
        review = self.candidate(
            message("review-1", "Your UC Berkeley application is under faculty review.")
        )
        self.assertEqual(review["raw_status"], "Under Review")
        self.assertEqual(review["proposed"]["status"], "Submitted")
        self.assertTrue(any("Under Review" in warning for warning in review["warnings"]))

    def test_nested_mime_prefers_plain_text_over_html(self):
        raw = message("mime-1", "fallback")
        raw["payload"] = {
            "mimeType": "multipart/mixed",
            "headers": raw["payload"]["headers"],
            "parts": [
                {
                    "mimeType": "multipart/alternative",
                    "parts": [
                        {
                            "mimeType": "text/html",
                            "body": {"data": encode("<p>Wrong status: Rejected</p>")},
                        },
                        {
                            "mimeType": "text/plain",
                            "body": {"data": encode("UC Berkeley interview invitation")},
                        },
                    ],
                },
                {
                    "mimeType": "application/pdf",
                    "filename": "invite.pdf",
                    "body": {"data": encode("ignored")},
                },
            ],
        }
        self.assertIn("UC Berkeley interview invitation", import_gmail.message_text(raw))
        self.assertNotIn("Wrong status", import_gmail.message_text(raw))
        self.assertEqual(self.candidate(raw)["proposed"]["status"], "Interview")

    def test_html_is_cleaned_when_no_plain_part_exists(self):
        raw = message("html-1", "fallback")
        raw["payload"]["mimeType"] = "text/html"
        raw["payload"]["body"]["data"] = encode(
            "<style>Rejected</style><p>You have been admitted to UC Berkeley.</p>"
            "<script>alert(1)</script>"
        )
        text = import_gmail.message_text(raw)
        self.assertIn("admitted", text)
        self.assertNotIn("Rejected", text)
        self.assertNotIn("alert", text)

    def test_multiple_schools_require_manual_selection(self):
        candidate = self.candidate(
            message(
                "ambiguous-1",
                "UC Berkeley and Stanford University both received your application.",
            )
        )
        self.assertIsNone(candidate["school_id"])
        self.assertEqual(set(candidate["matched_school_ids"]), {"berkeley", "stanford"})
        self.assertTrue(any("多个项目" in warning for warning in candidate["warnings"]))

    def test_existing_application_id_can_match_without_school_name(self):
        data = copy.deepcopy(self.data)
        data["schools"][0]["application_id"] = "UCB-EXISTING-1"
        candidate = self.candidate(message("id-only", "Application ID: UCB-EXISTING-1"), data)
        self.assertEqual(candidate["school_id"], "berkeley")
        self.assertEqual(candidate["match_method"], "application_id")

    def test_old_submission_email_warns_about_status_regression(self):
        data = copy.deepcopy(self.data)
        data["schools"][0]["status"] = "Admitted"
        candidate = self.candidate(
            message("old-1", "We have received your application to UC Berkeley."), data
        )
        self.assertTrue(any("早于当前状态" in warning for warning in candidate["warnings"]))

    def test_ambiguous_numeric_dates_are_not_guessed(self):
        candidate = self.candidate(
            message("date-1", "UC Berkeley interview on 02/03/2028 at 10 AM.")
        )
        self.assertNotIn("interview_date", candidate["proposed"])


class ApplyTests(GmailImportTestCase):
    def test_apply_changes_only_approved_fields_and_records_message(self):
        original_notes = self.data["schools"][0]["notes"]
        review = self.review(
            self.data,
            {
                "application_id": "UCB-APPROVED-1",
                "submission_date": "2027-12-01",
                "status": "Submitted",
                "interview_date": "2028-02-10",
            },
        )
        updated, changes = import_gmail.apply_review(self.data, review)
        school = updated["schools"][0]
        self.assertEqual(school["application_id"], "UCB-APPROVED-1")
        self.assertEqual(school["submission_date"], "2027-12-01")
        self.assertEqual(school["interview_date"], "2028-02-10")
        self.assertEqual(school["status"], "Submitted")
        self.assertEqual(school["notes"], original_notes)
        self.assertEqual(len(changes), 4)
        self.assertEqual(updated["gmail_imports"][0]["gmail_message_id"], "approved-message")
        self.assertNotIn("application_id", self.data["schools"][0])
        validate_database(updated)

    def test_stale_database_fingerprint_is_rejected(self):
        review = self.review(self.data, {"status": "Submitted"})
        changed = copy.deepcopy(self.data)
        changed["schools"][0]["notes"] = "Edited after review"
        with self.assertRaisesRegex(GradPilotError, "changed after this review"):
            import_gmail.apply_review(changed, review)

    def test_unknown_or_empty_fields_are_rejected(self):
        unknown = self.review(self.data, {"notes": "overwrite"})
        with self.assertRaisesRegex(GradPilotError, "unsupported fields"):
            import_gmail.apply_review(self.data, unknown)
        empty = self.review(self.data, {})
        with self.assertRaisesRegex(GradPilotError, "no selected fields"):
            import_gmail.apply_review(self.data, empty)

    def test_close_reason_requires_closed_status(self):
        review = self.review(self.data, {"close_reason": "rejected", "status": "Interview"})
        with self.assertRaisesRegex(GradPilotError, "requires Closed"):
            import_gmail.apply_review(self.data, review)

    def test_non_closed_status_clears_previous_close_reason(self):
        data = copy.deepcopy(self.data)
        data["schools"][0]["status"] = "Closed"
        data["schools"][0]["decision"] = {"close_reason": "rejected"}
        review = self.review(data, {"status": "Interview"})
        updated, changes = import_gmail.apply_review(data, review)
        self.assertEqual(updated["schools"][0]["status"], "Interview")
        self.assertIsNone(updated["schools"][0]["decision"]["close_reason"])
        self.assertTrue(any(change["field"] == "close_reason" for change in changes))

    def test_closed_status_is_applied_before_close_reason(self):
        review = self.review(
            self.data, {"close_reason": "rejected", "status": "Closed"}
        )
        updated, _ = import_gmail.apply_review(self.data, review)
        self.assertEqual(updated["schools"][0]["status"], "Closed")
        self.assertEqual(updated["schools"][0]["decision"]["close_reason"], "rejected")

    def test_duplicate_application_id_is_rejected(self):
        data = copy.deepcopy(self.data)
        data["schools"][1]["application_id"] = "DUPLICATE-ID"
        review = self.review(data, {"application_id": "DUPLICATE-ID"})
        with self.assertRaisesRegex(GradPilotError, "duplicate application_id"):
            import_gmail.apply_review(data, review)

    def test_review_html_escapes_script_closing_subject(self):
        report = import_gmail.build_report(
            [
                message(
                    "xss-1",
                    "UC Berkeley interview invitation",
                    subject="UC Berkeley </script><script>alert(1)</script>",
                )
            ],
            self.data,
            EXAMPLE_DATA,
            "offline:test",
            "offline",
        )
        rendered = gmail_review.render_review_html(report)
        self.assertNotIn("</script><script>alert(1)</script>", rendered)
        self.assertIn("\\u003c/script\\u003e", rendered)
        self.assertIn("Content-Security-Policy", rendered)


class CliRoundTripTests(GmailImportTestCase):
    def test_offline_fetch_preview_and_private_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            offline = root / "messages.json"
            offline.write_text(
                json.dumps(
                    {
                        "messages": [
                            {
                                "id": "offline-admit",
                                "threadId": "offline-thread",
                                "snippet": "Admission offer",
                                "text": (
                                    "We are pleased to offer you admission to UC Berkeley. "
                                    "Application ID: UCB-OFFLINE-1"
                                ),
                                "payload": {
                                    "headers": [
                                        {"name": "Subject", "value": "UC Berkeley PhD result"},
                                        {"name": "From", "value": "admissions@example.edu"},
                                        {"name": "Date", "value": "Wed, 1 Mar 2028 09:00:00 -0800"},
                                    ]
                                },
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            output = root / "out"
            fetch = subprocess.run(
                [
                    sys.executable,
                    "-I",
                    str(ROOT / "scripts" / "import_gmail.py"),
                    "fetch",
                    "--offline-messages",
                    str(offline),
                    "--data",
                    str(EXAMPLE_DATA),
                    "--output-dir",
                    str(output),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(fetch.returncode, 0, fetch.stderr)
            candidate_path = next(output.glob("*.candidates.json"))
            self.assertTrue(next(output.glob("*.review.html")).is_file())
            report = json.loads(candidate_path.read_text(encoding="utf-8"))
            self.assertEqual(report["candidates"][0]["school_id"], "berkeley")
            private = root / "applications.private.json"
            private.write_bytes(EXAMPLE_DATA.read_bytes())
            review = {
                "kind": "gradpilot-gmail-review",
                "version": 1,
                "batch_id": report["batch_id"],
                "database_sha256": report["database_sha256"],
                "approved": [
                    {
                        "gmail_message_id": "offline-admit",
                        "message_date": "2028-03-01",
                        "school_id": "berkeley",
                        "fields": {
                            "application_id": "UCB-OFFLINE-1",
                            "status": "Admitted",
                            "decision_date": "2028-03-01",
                        },
                    }
                ],
            }
            review_path = root / "approved.json"
            review_path.write_text(json.dumps(review), encoding="utf-8")
            command = [
                sys.executable,
                "-I",
                str(ROOT / "scripts" / "import_gmail.py"),
                "apply",
                str(review_path),
                "--data",
                str(private),
            ]
            preview = subprocess.run(
                command,
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(preview.returncode, 0, preview.stderr)
            self.assertIn("Preview only", preview.stdout)
            self.assertEqual(private.read_bytes(), EXAMPLE_DATA.read_bytes())
            written = subprocess.run(
                [*command, "--write-private"],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(written.returncode, 0, written.stderr)
            saved = json.loads(private.read_text(encoding="utf-8"))
            self.assertEqual(saved["schools"][0]["status"], "Admitted")
            self.assertEqual(saved["schools"][0]["application_id"], "UCB-OFFLINE-1")
            self.assertEqual(saved["gmail_imports"][0]["gmail_message_id"], "offline-admit")
            stale = subprocess.run(
                [*command, "--write-private"],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(stale.returncode, 2)
            self.assertIn("changed after this review", stale.stderr)


if __name__ == "__main__":
    unittest.main()
