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

    def test_an_issue_labeled_for_another_agent_is_left_to_that_agent(self):
        issues = [issue(16, "ready", "agent:codex"), issue(18, "ready", "agent:claude"), issue(19, "ready")]
        self.assertEqual(numbers(g.plan("claude", "next", issues, [])[0]), [18, 19])
        self.assertEqual(numbers(g.plan("codex", "next", issues, [])[0]), [16, 19])

    def test_count_limits_the_batch(self):
        issues = [issue(n, "ready") for n in (1, 2, 3)]
        self.assertEqual(numbers(g.plan("claude", "next", issues, [], count=1)[0]), [1])

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
        picks, lines, _ = g.plan("gemini", "next", [issue(18, "agent:codex")], [])
        self.assertEqual(picks, [])
        self.assertEqual(lines, ["Nothing started for Gemini.", "No tasks are marked ready for Gemini."])


class Limits(unittest.TestCase):
    def test_any_hold_stops_new_work_for_everyone(self):
        issues = [issue(18, "ready"), issue(40, "hold")]
        for agent in ("codex", "gemini", "claude"):
            picks, lines, _ = g.plan(agent, "next", issues, [])
            self.assertEqual(picks, [])
            self.assertIn("#40 is on hold", lines[0])
        picks, lines, _ = g.plan("codex", "next", [issue(18, "ready")], [pull(50, "claude/x", "", "hold")])
        self.assertEqual(picks, [])

    def test_open_pull_requests_use_up_the_three_slots(self):
        issues = [issue(n, "ready") for n in (1, 2, 3)]
        picks, lines, _ = g.plan("claude", "next", issues, [pull(60, "claude/issue-7"), pull(61, "codex/issue-8")])
        self.assertEqual(numbers(picks), [1, 2])
        self.assertIn("already has 1 pull request waiting (#60)", lines[-1])
        full = [pull(n, f"claude/issue-{n}") for n in (60, 61, 62)]
        picks, lines, _ = g.plan("claude", "next", issues, full)
        self.assertEqual(picks, [])
        self.assertIn("#60, #61 and #62", lines[0])

    def test_recheck_stops_the_rest_of_a_batch_after_a_hold(self):
        self.assertTrue(g.recheck([issue(1)], [], 25)[0])
        ok, line = g.recheck([issue(1, "hold")], [], 25)
        self.assertFalse(ok)
        self.assertIn("#25 was not started: #1 went on hold", line)


class Review(unittest.TestCase):
    def test_a_hold_never_blocks_a_review(self):
        self.assertIn("reviews", g.plan("claude", "review", [issue(40, "hold")], [])[1][0])

    def test_only_the_coordinator_reviews_whoever_it_is(self):
        self.assertIn("Nothing started", g.plan("codex", "review", [], [])[1][0])
        self.assertIn("reviews", g.plan("codex", "review", [], [], coordinator="codex")[1][0])


class Chosen(unittest.TestCase):
    def test_blakes_choice_overrides_the_labels_but_not_a_hold(self):
        issues = [issue(16, "agent:claude")]
        self.assertEqual(numbers(g.plan("codex", "issue", issues, [], wanted=16)[0]), [16])
        self.assertEqual(g.plan("codex", "issue", issues + [issue(9, "hold")], [], wanted=16)[0], [])
        self.assertEqual(g.plan("codex", "issue", issues, [], wanted=99)[0], [])


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
