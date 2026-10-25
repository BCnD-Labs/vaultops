#!/usr/bin/env python3
"""Write .agent/prompt.md (and .agent/brief.md for builds) for an agent run.

Usage: prepare.py build <agent> <issue> [note]
       prepare.py review <agent> [pull request] [note]

Review mode also writes .agent/review/pr-<n>.md for each pull request to
review: open, not a draft, no `hold`, built by an agent other than the
reviewer (a coordinator never reviews its own work).
Needs `gh` signed in (GH_TOKEN) and GITHUB_REPOSITORY set. Standard library only.
"""

import json
import os
import pathlib
import re
import subprocess
import sys

LINK = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|part of)\s+#(\d+)", re.I)

HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(".agent")


def gh(path, raw=False, accept=None):
    cmd = ["gh", "api", path] + (["-H", f"Accept: {accept}"] if accept else [])
    out = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    return out if raw else json.loads(out)


def labels(item):
    return {x["name"] for x in item.get("labels", [])}


def to_review(pulls, reviewer, only=None):
    """Open, ready, not on hold, built by an agent other than the reviewer."""
    picked = []
    for p in pulls:
        names = labels(p)
        agents = {n for n in names if n.startswith("agent:")}
        if p.get("draft") or "hold" in names or not agents or f"agent:{reviewer}" in names:
            continue
        if only and p["number"] != only:
            continue
        picked.append(p)
    return sorted(picked, key=lambda p: p["number"])


def review_file(repo, pr):
    checks = gh(f"repos/{repo}/commits/{pr['head']['sha']}/check-runs?per_page=100")["check_runs"]
    lines = [f"# Pull request #{pr['number']}: {pr['title']}", "", pr.get("body") or "(no description)",
             "", "## Checks"]
    lines += [f"- {c['name']}: {c['conclusion'] or c['status']}" for c in checks] or ["- (none yet)"]
    for n in sorted({int(x) for x in LINK.findall(pr.get("body") or "")}):
        lines += ["", brief(repo, n)[1]]
    diff = gh(f"repos/{repo}/pulls/{pr['number']}", raw=True, accept="application/vnd.github.diff")
    lines += ["", "## Diff", "", "```diff", diff, "```"]
    return "\n".join(lines) + "\n"


def brief(repo, number):
    issue = gh(f"repos/{repo}/issues/{number}")
    comments = gh(f"repos/{repo}/issues/{number}/comments?per_page=100")
    parts = [f"# #{number}: {issue['title']}", "", issue.get("body") or "(no description)"]
    for c in comments:
        parts += ["", f"## Comment by {c['user']['login']} ({c['created_at'][:10]})", "", c["body"]]
    return issue["title"], "\n".join(parts) + "\n"


def render(template, **values):
    text = (HERE / template).read_text(encoding="utf-8")
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text


def main():
    mode, agent = sys.argv[1], sys.argv[2]
    number = sys.argv[3].strip() if len(sys.argv) > 3 else ""
    note = sys.argv[4].strip() if len(sys.argv) > 4 else ""
    repo = os.environ["GITHUB_REPOSITORY"]
    OUT.mkdir(exist_ok=True)
    if mode == "build":
        title, text = brief(repo, number)
        (OUT / "brief.md").write_text(text, encoding="utf-8")
        prompt = render("build-prompt.md", AGENT=agent.capitalize(), ISSUE=number, TITLE=title)
    else:
        pulls = gh(f"repos/{repo}/pulls?state=open&per_page=100")
        picked = to_review(pulls, agent, int(number) if number else None)
        (OUT / "review").mkdir(exist_ok=True)
        (OUT / "verdicts").mkdir(exist_ok=True)
        for pr in picked:
            (OUT / "review" / f"pr-{pr['number']}.md").write_text(review_file(repo, pr), encoding="utf-8")
        print(f"{len(picked)} pull request(s) to review: " + ", ".join(f"#{p['number']}" for p in picked))
        prompt = render("review-prompt.md", AGENT=agent.capitalize())
    if note:
        prompt += f"\nExtra instruction from Blake (it overrides the labels, not the rules in AGENTS.md):\n{note}\n"
    (OUT / "prompt.md").write_text(prompt, encoding="utf-8")
    print(prompt)


if __name__ == "__main__":
    main()
