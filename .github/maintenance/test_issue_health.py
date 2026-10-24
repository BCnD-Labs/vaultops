"""Tests for issue_health.py. Run: python3 -m unittest discover -s .github/maintenance"""

import unittest
from datetime import datetime, timezone

import issue_health as h

NOW = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)


def issue(n, milestone=None, labels=(), sub=None):
    return {"number": n, "title": f"Issue {n}", "milestone": {"title": milestone} if milestone else None,
            "labels": [{"name": x} for x in labels], "sub_issues_summary": sub}


def pull(n, created, draft=False):
    return {"number": n, "title": f"PR {n}", "created_at": created, "draft": draft,
            "user": {"login": "codex"}}


class Health(unittest.TestCase):
    def test_no_milestone_skips_weekly_updates(self):
        issues = [issue(1), issue(2, "M1"), issue(3, labels=["weekly"]), issue(4, labels=["bug"])]
        self.assertEqual([i["number"] for i in h.no_milestone(issues)], [1, 4])

    def test_finished_tasks_need_all_sub_issues_closed(self):
        issues = [issue(1, "M1", sub={"total": 4, "completed": 4}),
                  issue(2, "M1", sub={"total": 4, "completed": 3}),
                  issue(3, "M1", sub={"total": 0, "completed": 0}),
                  issue(4, "M1")]
        self.assertEqual([i["number"] for i in h.finished_tasks(issues)], [1])

    def test_stale_pulls_use_the_day_limit(self):
        pulls = [pull(1, "2026-10-20T12:00:00Z"), pull(2, "2026-10-21T12:00:01Z"),
                 pull(3, "2026-10-24T08:00:00Z")]
        self.assertEqual([p["number"] for p in h.stale_pulls(pulls, NOW, 3)], [1])
        self.assertEqual([p["number"] for p in h.stale_pulls(pulls, NOW, 0)], [1, 2, 3])

    def test_report(self):
        report = h.render([issue(5), issue(6, "M1", sub={"total": 2, "completed": 2})],
                          [pull(7, "2026-10-18T12:00:00Z", draft=True)], NOW, 3)
        self.assertIn("3 item(s) need a look.", report)
        self.assertIn("- #5 Issue 5", report)
        self.assertIn("- #7 PR 7 (open 6 days, draft, by codex)", report)
        self.assertIn("- #6 Issue 6 (2 of 2 done)", report)

    def test_clean_report(self):
        report = h.render([issue(1, "M1")], [], NOW, 3)
        self.assertIn("Nothing needs attention.", report)
        self.assertEqual(report.count("None."), 3)


if __name__ == "__main__":
    unittest.main()
