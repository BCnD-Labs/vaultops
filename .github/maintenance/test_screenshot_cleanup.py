"""Tests for screenshot_cleanup.py. Run: python3 -m unittest discover -s .github/maintenance"""

import unittest

import screenshot_cleanup as s


class Plan(unittest.TestCase):
    def test_only_merged_pull_requests_are_deleted(self):
        states = {98: "merged", 114: "closed", 115: "open", 9: "merged"}
        delete, keep = s.plan(["pr-115", "pr-98", "pr-114", "pr-9", "notes"], states.get)
        self.assertEqual([n for n, _ in delete], ["pr-9", "pr-98"])
        self.assertEqual(keep, [("notes", "not a pull request folder"),
                                ("pr-114", "closed"), ("pr-115", "open")])

    def test_folder_pattern_is_exact(self):
        delete, keep = s.plan(["pr-98-old", "xpr-98"], lambda n: "merged")
        self.assertEqual(delete, [])
        self.assertEqual(len(keep), 2)


if __name__ == "__main__":
    unittest.main()
