"""Tests for agent_gate.py. Run: python3 -m unittest discover -s .github/agents"""

import unittest

import agent_gate as g


def issue(n, *labels, body=""):
    return {"number": n, "title": f"Issue {n}", "labels": [{"name": x} for x in labels], "body": body}


def pull(n, branch, body="", *labels):
    return {"number": n, "head": {"ref": branch}, "body": body, "labels": [{"name": x} for x in labels]}


def numbers(picks):
    return [i["number"] for i in picks]


class Next(unittest.TestCase):
    def test_takes_the_three_oldest_ready_issues_without_needing_an_agent_label(self):
        issues = [issue(30, "ready"), issue(18, "ready"), issue(16, "ready"), issue(12), issue(40, "ready")]
        picks, lines, _ = g.plan("claude", "next", issues, [])
        self.assertEqual(numbers(picks), [16, 18, 30])
        self.assertIn("Starting 3 of 3", lines[0])

    def test_agent_labels_are_ignored(self):
        issues = [issue(16, "ready", "agent:codex"), issue(18, "ready")]
        self.assertEqual(numbers(g.plan("claude", "next", issues, [])[0]), [16, 18])

    def test_count_limits_the_batch_to_between_one_and_three(self):
        issues = [issue(n, "ready") for n in (1, 2, 3, 4, 5)]
        self.assertEqual(numbers(g.plan("claude", "next", issues, [], count=1)[0]), [1])
        self.assertEqual(numbers(g.plan("claude", "next", issues, [], count=2)[0]), [1, 2])
        self.assertEqual(numbers(g.plan("claude", "next", issues, [], count=9)[0]), [1, 2, 3])
        self.assertEqual(numbers(g.plan("claude", "next", issues, [], count=0)[0]), [1])

    def test_open_pull_requests_do_not_limit_new_work(self):
        issues = [issue(n, "ready") for n in (1, 2, 3)]
        pulls = [pull(n, f"claude/issue-{n + 50}") for n in (60, 61, 62, 63)]
        self.assertEqual(numbers(g.plan("claude", "next", issues, pulls)[0]), [1, 2, 3])

    def test_a_hold_label_no_longer_stops_anything(self):
        picks, _, _ = g.plan("claude", "next", [issue(18, "ready"), issue(40, "hold")], [])
        self.assertEqual(numbers(picks), [18])

    def test_a_dependency_still_open_skips_the_issue_and_says_why(self):
        issues = [issue(136, "ready"), issue(137, "ready", body="Fix it.\n\n## Depends on\n#136\n\nNote."),
                  issue(140, "ready")]
        picks, lines, skipped = g.plan("claude", "next", issues, [])
        self.assertEqual(numbers(picks), [136, 140])
        self.assertIn("waits for #136 to be finished and merged first", skipped[137])
        self.assertIn(skipped[137], lines)
        self.assertIn("No more tasks are marked ready", lines[-1])

    def test_a_closed_dependency_does_not_block(self):
        issues = [issue(137, "ready", body="## Depends on\n#20 (T06)")]
        self.assertEqual(numbers(g.plan("claude", "next", issues, [])[0]), [137])

    def test_decisions_paused_deferred_and_claimed_issues_are_skipped(self):
        issues = [issue(1, "ready", "needs decision"), issue(2, "ready", "paused"), issue(3, "ready", "deferred"),
                  issue(4, "ready"), issue(5, "ready")]
        picks, lines, _ = g.plan("claude", "next", issues, [pull(9, "codex/issue-4", "Closes #4")])
        self.assertEqual(numbers(picks), [5])
        self.assertTrue(any("waiting on a decision from you" in x for x in lines))
        self.assertTrue(any("paused" in x for x in lines))

    def test_nothing_ready(self):
        picks, lines, _ = g.plan("codex", "next", [issue(18)], [])
        self.assertEqual(picks, [])
        self.assertEqual(lines, ["Nothing started for Codex.", "No tasks are marked ready."])


class Chosen(unittest.TestCase):
    def test_blakes_choice_takes_the_issue_whatever_its_labels(self):
        issues = [issue(16, "agent:claude", "paused")]
        self.assertEqual(numbers(g.plan("codex", "issue", issues, [], wanted=16)[0]), [16])
        self.assertEqual(g.plan("codex", "issue", issues, [], wanted=99)[0], [])

    def test_unknown_agent_or_task_starts_nothing(self):
        self.assertEqual(g.plan("bob", "next", [issue(1, "ready")], [])[0], [])
        self.assertEqual(g.plan("gemini", "next", [issue(1, "ready")], [])[0], [])
        self.assertEqual(g.plan("claude", "review", [issue(1, "ready")], [])[0], [])


class Helpers(unittest.TestCase):
    def test_depends_on_reads_only_its_own_section(self):
        body = "See #5.\n\n## Depends on\n#20 (T06), #21\n\n## Done when\n- [ ] #99"
        self.assertEqual(g.depends_on({"body": body}), {20, 21})
        self.assertEqual(g.depends_on({"body": None}), set())
        self.assertEqual(g.depends_on({"body": "## Depends on\n#136\n\nWaits for #136, unlike #140."}), {136})

    def test_refs(self):
        self.assertEqual(g.refs([2]), "#2")
        self.assertEqual(g.refs([3, 1]), "#1 and #3")
        self.assertEqual(g.refs([1, 2, 3]), "#1, #2 and #3")


if __name__ == "__main__":
    unittest.main()
