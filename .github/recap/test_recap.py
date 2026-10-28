"""Tests for recap.py. Run: python3 -m unittest discover -s .github/recap"""

import unittest

import recap as r


def pr(n, merged, body="", title=None):
    return {"number": n, "title": title or f"PR {n}", "merged_at": merged, "body": body}


class Collect(unittest.TestCase):
    def test_takes_the_most_recently_merged_and_skips_closed_unmerged(self):
        pulls = [pr(1, "2026-10-20T10:00:00Z"), pr(2, None), pr(3, "2026-10-27T10:00:00Z"), pr(4, "2026-10-25T10:00:00Z")]
        self.assertEqual([p["number"] for p in r.merged_prs(pulls, 2)], [3, 4])

    def test_count_is_at_least_one(self):
        self.assertEqual(len(r.merged_prs([pr(1, "2026-10-20T10:00:00Z"), pr(2, "2026-10-21T10:00:00Z")], 0)), 1)

    def test_long_descriptions_are_trimmed_and_whitespace_collapsed(self):
        text = r.entry(pr(7, "2026-10-26T10:00:00Z", "word  \n" * 400))
        self.assertIn("#7 PR 7 (merged 2026-10-26)", text)
        self.assertTrue(text.rstrip().endswith("..."))
        self.assertNotIn("\n\n\n", text)

    def test_missing_description(self):
        self.assertIn("(no description)", r.entry(pr(8, "2026-10-26T10:00:00Z", None)))


if __name__ == "__main__":
    unittest.main()
