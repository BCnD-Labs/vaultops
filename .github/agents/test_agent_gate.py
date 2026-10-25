"""Tests for agent_gate.py. Run: python3 -m unittest discover -s .github/agents"""

import unittest

import agent_gate as g


def issue(n, *labels):
    return {"number": n, "title": f"Issue {n}", "labels": [{"name": x} for x in labels]}


def pull(n, branch, body="", *labels):
    return {"number": n, "head": {"ref": branch}, "body": body, "labels": [{"name": x} for x in labels]}


class Gate(unittest.TestCase):
    def test_takes_the_oldest_ready_issue_for_this_agent(self):
        issues = [issue(30, "ready", "agent:codex"), issue(18, "ready", "agent:codex"),
                  issue(16, "ready", "agent:claude"), issue(12, "agent:codex")]
        ok, picked, _ = g.decide("codex", "next", issues, [])
        self.assertTrue(ok)
        self.assertEqual(picked["number"], 18)

    def test_any_hold_stops_new_work_for_everyone(self):
        issues = [issue(18, "ready", "agent:codex"), issue(40, "hold")]
        for agent in ("codex", "gemini", "claude"):
            ok, _, reason = g.decide(agent, "next", issues, [])
            self.assertFalse(ok)
            self.assertIn("#40", reason)
        ok, _, _ = g.decide("codex", "next", [issue(18, "ready", "agent:codex")],
                            [pull(50, "claude/x", "", "hold")])
        self.assertFalse(ok)

    def test_a_hold_never_blocks_a_review(self):
        ok, _, _ = g.decide("claude", "review", [issue(40, "hold")], [])
        self.assertTrue(ok)

    def test_only_the_coordinator_reviews_whoever_it_is(self):
        self.assertFalse(g.decide("codex", "review", [], [])[0])
        self.assertTrue(g.decide("codex", "review", [], [], coordinator="codex")[0])
        self.assertFalse(g.decide("claude", "review", [], [], coordinator="codex")[0])

    def test_one_open_pull_request_per_agent(self):
        issues = [issue(18, "ready", "agent:codex"), issue(19, "ready", "agent:codex")]
        ok, _, reason = g.decide("codex", "next", issues, [pull(60, "codex/issue-18", "Closes #18")])
        self.assertFalse(ok)
        self.assertIn("#60", reason)
        self.assertTrue(g.decide("gemini", "next", [issue(19, "ready", "agent:gemini")],
                                 [pull(60, "codex/issue-18")])[0])

    def test_skips_issues_already_claimed_paused_or_waiting_on_a_decision(self):
        issues = [issue(18, "ready", "agent:gemini"), issue(19, "ready", "agent:gemini", "paused"),
                  issue(20, "ready", "agent:gemini", "needs decision"), issue(21, "ready", "agent:gemini")]
        ok, picked, _ = g.decide("gemini", "next", issues, [pull(70, "blake/fix", "Part of #18")])
        self.assertTrue(ok)
        self.assertEqual(picked["number"], 21)

    def test_blakes_choice_overrides_the_labels_but_not_a_hold(self):
        issues = [issue(16, "ready", "agent:claude")]
        ok, picked, _ = g.decide("codex", "issue", issues, [], wanted=16)
        self.assertTrue(ok)
        self.assertEqual(picked["number"], 16)
        self.assertFalse(g.decide("codex", "issue", issues + [issue(9, "hold")], [], wanted=16)[0])
        self.assertFalse(g.decide("codex", "issue", issues, [], wanted=99)[0])

    def test_nothing_ready(self):
        ok, _, reason = g.decide("gemini", "next", [issue(18, "ready", "agent:codex")], [])
        self.assertFalse(ok)
        self.assertIn("agent:gemini", reason)


if __name__ == "__main__":
    unittest.main()
