"""Tests for the review helpers. Run: python3 -m unittest discover -s .github/agents"""

import unittest

import post_reviews as post
import prepare


def pr(n, *labels, draft=False):
    return {"number": n, "draft": draft, "labels": [{"name": x} for x in labels]}


class Reviews(unittest.TestCase):
    def test_reviewer_never_reviews_its_own_work(self):
        pulls = [pr(1, "agent:codex"), pr(2, "agent:claude"), pr(3, "agent:gemini"),
                 pr(4, "agent:codex", "hold"), pr(5, "agent:codex", draft=True), pr(6)]
        self.assertEqual([p["number"] for p in prepare.to_review(pulls, "claude")], [1, 3])
        self.assertEqual([p["number"] for p in prepare.to_review(pulls, "codex")], [2, 3])
        self.assertEqual([p["number"] for p in prepare.to_review(pulls, "claude", only=3)], [3])

    def test_verdict_lines(self):
        self.assertEqual(post.parse("**Verdict: merge**\n\nLooks right."), "merge")
        self.assertEqual(post.parse("  **Verdict: send back**\n- fix x"), "send back")
        self.assertEqual(post.parse("**Verdict: Blake's call**\nA or B"), "blake's call")
        self.assertIsNone(post.parse("I think it's fine. **Verdict: merge**"))
        self.assertIsNone(post.parse(""))


if __name__ == "__main__":
    unittest.main()
