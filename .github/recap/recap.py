#!/usr/bin/env python3
"""Recap button: collect the last merged pull requests for an agent, then show its write-up.

Usage: recap.py collect <count>   writes .agent/recap-input.md and .agent/prompt.md
       recap.py publish           copies .agent/recap.md to the run's Summary page
Needs `gh` signed in (GH_TOKEN) and GITHUB_REPOSITORY set. Standard library only.
"""

import json
import os
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(".agent")
BODY_LIMIT = 700


def gh(path):
    out = subprocess.run(["gh", "api", path], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def merged_prs(pulls, count):
    """The `count` most recently merged pull requests, newest first."""
    done = [p for p in pulls if p.get("merged_at")]
    return sorted(done, key=lambda p: p["merged_at"], reverse=True)[: max(1, count)]


def entry(pr):
    body = " ".join((pr.get("body") or "").split())
    if len(body) > BODY_LIMIT:
        body = body[:BODY_LIMIT].rstrip() + "..."
    return f"## #{pr['number']} {pr['title']} (merged {pr['merged_at'][:10]})\n\n{body or '(no description)'}\n"


def format_input(prs):
    return "# Recently merged pull requests (newest first)\n\n" + "\n".join(entry(p) for p in prs)


def collect(count):
    repo = os.environ["GITHUB_REPOSITORY"]
    pulls = gh(f"repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100")
    prs = merged_prs(pulls, count)
    OUT.mkdir(exist_ok=True)
    (OUT / "recap-input.md").write_text(format_input(prs), encoding="utf-8")
    prompt = (HERE / "recap-prompt.md").read_text(encoding="utf-8").replace("{{COUNT}}", str(len(prs)))
    (OUT / "prompt.md").write_text(prompt, encoding="utf-8")
    print(f"{len(prs)} merged pull request(s): " + ", ".join(f"#{p['number']}" for p in prs))


def publish():
    path = OUT / "recap.md"
    text = path.read_text(encoding="utf-8").strip() if path.exists() else ""
    if not text:
        sys.exit("The agent did not write .agent/recap.md, so there is nothing to show.")
    report = "# What changed lately\n\n" + text + "\n"
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(report)


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        collect(int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].strip().isdigit() else 12)
    else:
        publish()
