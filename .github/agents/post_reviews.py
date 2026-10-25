#!/usr/bin/env python3
"""Post the reviewer's verdicts (.agent/verdicts/pr-<n>.md) as pull request comments.

A verdict that isn't "merge" also puts the pull request on hold. Pull requests
that were up for review but got no verdict are listed on the run's summary.
Usage: post_reviews.py <reviewer>. Needs `gh` (GH_TOKEN) and GITHUB_REPOSITORY.
"""

import os
import pathlib
import re
import subprocess
import sys

VERDICT = re.compile(r"^\*\*Verdict: (merge|send back|Blake's call)\*\*", re.I)


def parse(text):
    """Return the verdict word ("merge", "send back", "blake's call") or None."""
    match = VERDICT.match(text.strip())
    return match.group(1).lower() if match else None


def main():
    reviewer = sys.argv[1].capitalize()
    repo = os.environ["GITHUB_REPOSITORY"]
    asked = sorted(int(p.stem[3:]) for p in pathlib.Path(".agent/review").glob("pr-*.md"))
    lines = []
    for n in asked:
        path = pathlib.Path(f".agent/verdicts/pr-{n}.md")
        text = path.read_text(encoding="utf-8") if path.exists() else ""
        verdict = parse(text)
        if verdict is None:
            lines.append(f"- #{n}: no valid verdict written; not posted")
            continue
        body = f"{text.strip()}\n\n_Review by {reviewer} (coordinator)._"
        subprocess.run(["gh", "pr", "comment", str(n), "--repo", repo, "--body", body], check=True)
        if verdict != "merge":
            subprocess.run(["gh", "pr", "edit", str(n), "--repo", repo, "--add-label", "hold"], check=True)
        lines.append(f"- #{n}: {verdict}" + ("" if verdict == "merge" else " (put on hold)"))
    report = "# Reviews\n\n" + ("\n".join(lines) if lines else "Nothing to review.") + "\n"
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(report)


if __name__ == "__main__":
    main()
