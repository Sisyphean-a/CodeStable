from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from subprocess import CompletedProcess
from unittest import mock

TESTS_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = TESTS_DIR.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import collect_feedback_context as collector
import report_feedback_issue as publisher
from feedback_privacy import (
    publication_approval_hash,
    public_redact,
    render_public_issue,
)


class PrivacyRegressionTests(unittest.TestCase):
    def test_private_paths_and_credentials_fail_closed(self) -> None:
        samples = (
            "src/core/main.ex",
            r"src\core\main.ex",
            "/goal/private/main.ex",
            r"\\server\share\main.ex",
            "internal/no_extension",
            "u:password",
            "user:pass",
            "--proxy-user u:pass",
        )

        for sample in samples:
            with self.subTest(sample=sample):
                self.assertNotIn(sample, public_redact(sample))
                self.assertTrue(publisher.public_body_private_reasons(sample))

    def test_short_repository_tokens_are_redacted(self) -> None:
        redacted = public_redact("ab/cd", private_tokens={"ab", "cd"})
        self.assertNotIn("ab", redacted)
        self.assertNotIn("cd", redacted)

    def test_publisher_rejects_target_repository_identity(self) -> None:
        reasons = publisher.public_body_private_reasons(
            "技能反馈：ab cd",
            {"ab", "cd", "ab/cd"},
        )
        self.assertIn("private-repository", reasons)


class CollectorApprovalTests(unittest.TestCase):
    def test_literal_feedback_does_not_execute_and_rerun_revokes_approval(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            transcript = root / "session.jsonl"
            output = root / "evidence.json"
            marker = root / "executed"
            feedback = f"$(touch {marker}) `touch {marker}` $HOME cs-feat 路由失败"
            records = (
                {"type": "session_meta", "session_id": "s1", "cwd": str(root)},
                {"role": "assistant", "content": "stopped cs-feat"},
                {"role": "user", "content": "不对，cs-feat 应该继续实现。"},
            )
            transcript.write_text(
                "\n".join(json.dumps(item, ensure_ascii=False) for item in records) + "\n",
                encoding="utf-8",
            )
            base = [
                "--feedback", feedback,
                "--session", str(transcript),
                "--cwd", str(root),
                "--output", str(output),
            ]
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(0, collector.main_with_args_for_test(base))
                self.assertEqual(
                    0,
                    collector.main_with_args_for_test(
                        [*base, "--approve-public-preview", "--target-repo", "ab/cd"]
                    ),
                )
            approval = root / "publish-approval.json"
            self.assertTrue(approval.exists())
            self.assertEqual(feedback, json.loads(output.read_text(encoding="utf-8"))["feedback"])
            self.assertFalse(marker.exists())

            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(0, collector.main_with_args_for_test(base))
            context = json.loads((root / "public-issue-context.json").read_text(encoding="utf-8"))
            self.assertEqual("pending", context["privacy_review"]["status"])
            self.assertFalse(approval.exists())


class OneTimeApprovalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        incident = {
            "incident_kind": "routing_failure",
            "target_skill": "cs-feat",
            "expected_behavior": "应继续实现",
            "actual_behavior": "提前停止",
            "impact": "任务未完成",
            "proposed_fix": "继续到证据闭环",
        }
        projection = {
            "privacy": "public-preview",
            "source": "derived-from-local-private-evidence",
            "allowed_fields": list(incident),
            "incidents": [incident],
        }
        projection_hash = publisher.public_projection_hash(projection)
        approval_hash = publication_approval_hash(
            projection_hash,
            "owner-a/repo-a",
            "approval-1",
        )
        review = {
            "status": "approved",
            "projection_hash": projection_hash,
            "target_repo": "owner-a/repo-a",
            "approval_id": "approval-1",
            "approval_hash": approval_hash,
        }
        self.context = {**projection, "projection_hash": projection_hash, "privacy_review": review}
        self.context_path = self.root / "public-issue-context.json"
        self.body_path = self.root / "github-issue.md"
        self.approval_path = self.root / "publish-approval.json"
        self.context_path.write_text(json.dumps(self.context, ensure_ascii=False), encoding="utf-8")
        self.body_path.write_text(render_public_issue(self.context), encoding="utf-8")
        self._write_approval()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_approval(self) -> None:
        approval = {
            "privacy": "local-private",
            "status": "available",
            "projection_hash": self.context["projection_hash"],
            "target_repo": "owner-a/repo-a",
            "approval_id": "approval-1",
            "approval_hash": self.context["privacy_review"]["approval_hash"],
        }
        self.approval_path.write_text(json.dumps(approval), encoding="utf-8")

    def _args(self, repo: str = "owner-a/repo-a") -> list[str]:
        return [
            "--repo", repo,
            "--title", "技能反馈：cs-feat 路由失效",
            "--body-file", str(self.body_path),
            "--public-context", str(self.context_path),
            "--approval-file", str(self.approval_path),
            "--confirm-public-preview",
        ]

    def test_approval_is_bound_to_target_repository(self) -> None:
        with self.assertRaises(SystemExit):
            publisher.main_with_args_for_test(self._args("owner-b/repo-b"))
        self.assertTrue(self.approval_path.exists())

    def test_tampered_approval_hash_is_rejected(self) -> None:
        approval = json.loads(self.approval_path.read_text(encoding="utf-8"))
        approval["approval_hash"] = "0" * 64
        self.approval_path.write_text(json.dumps(approval), encoding="utf-8")
        with self.assertRaises(SystemExit):
            publisher.main_with_args_for_test(self._args())

    def test_real_create_consumes_approval_once(self) -> None:
        auth = CompletedProcess(["gh", "auth", "status"], 0, "", "")
        created = CompletedProcess(["gh", "issue", "create"], 0, "https://example.invalid/1", "")
        with (
            mock.patch.object(publisher.shutil, "which", return_value="gh"),
            mock.patch.object(publisher, "run_read_only_with_proxy_retry", return_value=(auth, None)),
            mock.patch.object(publisher, "run", return_value=created) as create,
        ):
            self.assertEqual(0, publisher.main_with_args_for_test(self._args()))
            self.assertEqual(1, create.call_count)

        self.assertFalse(self.approval_path.exists())
        self.assertTrue(self.approval_path.with_name("publish-approval.json.used").exists())
        with self.assertRaises(SystemExit):
            publisher.main_with_args_for_test(self._args())

    def test_unavailable_gh_does_not_expose_bypass_command(self) -> None:
        with mock.patch.object(publisher.shutil, "which", return_value=None):
            self.assertEqual(0, publisher.main_with_args_for_test(self._args()))
        self.assertTrue(self.approval_path.exists())


if __name__ == "__main__":
    unittest.main()
