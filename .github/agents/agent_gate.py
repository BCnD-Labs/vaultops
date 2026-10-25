#!/usr/bin/env python3
"""Decide whether an agent may start, and on which issue (Agents workflow).

Usage: agent_gate.py <agent> <task> [issue]
  agent: claude | codex | gemini
  task:  next   (oldest open issue labeled `ready` + `agent:<agent>`)
         issue  (the given issue number: Blake's choice overrides the labels)
         review (the coordinator reviews open agent pull requests; never blocked by a hold)

Follows AGENTS.md "Team and handoff": no new work while anything is on hold,
and an agent with an open pull request finishes it first. Writes the result to
GITHUB_OUTPUT (proceed, issue, title, branch) and the run's summary page.
Needs `gh` signed in (GH_TOKEN) and GITHUB_REPOSITORY set. Standard library only.
"""

import json
import os
import re
import subprocess
import sys

AGENTS = ("claude", "codex", "gemini")
LINK = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|part of)\s+#(\d+)", re.I)


def gh(path):
    result = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"gh failed: {path}\n{result.stderr.strip()}")
    return json.loads(result.stdout)


def all_pages(path):
    found, page = [], 1
    while True:
        items = gh(f"{path}&per_page=100&page={page}")
        found += items
        if len(items) < 100:
            return found
        page += 1


def labels(item):
    return {x["name"] for x in item.get("labels", [])}


def linked_issues(pulls):
    return {int(n) for p in pulls for n in LINK.findall(p.get("body") or "")}


def decide(agent, task, issues, pulls, wanted=None, coordinator="claude"):
    """Return (proceed, issue or None, reason)."""
    if agent not in AGENTS:
        return False, None, f"unknown agent {agent!r}"
    if task == "review":
        return (True, None, "review open pull requests as coordinator") if agent == coordinator else (
            False, None, f"only the coordinator reviews (currently {coordinator}; repo variable COORDINATOR)")
    held = sorted(x["number"] for x in issues + pulls if "hold" in labels(x))
    if held:
        return False, None, "on hold: " + ", ".join(f"#{n}" for n in held) + \
            " (Blake clears a hold by removing the label)"
    mine = [p for p in pulls if p["head"]["ref"].startswith(f"{agent}/")]
    if mine:
        return False, None, f"{agent} already has open pull request #{mine[0]['number']}; finish it first"
    by_number = {i["number"]: i for i in issues}
    if task == "issue":
        if wanted not in by_number:
            return False, None, f"issue #{wanted} is not an open issue"
        return True, by_number[wanted], f"issue #{wanted}, chosen by Blake"
    if task != "next":
        return False, None, f"unknown task {task!r}"
    taken = linked_issues(pulls)
    ready = [i for i in issues
             if {"ready", f"agent:{agent}"} <= labels(i) and not labels(i) & {"paused", "needs decision"}
             and i["number"] not in taken]
    if not ready:
        return False, None, f"no open issue is labeled ready + agent:{agent}"
    pick = min(ready, key=lambda i: i["number"])
    return True, pick, f"oldest ready issue for {agent}"


def main():
    agent, task = sys.argv[1], sys.argv[2]
    wanted = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].strip() else None
    repo = os.environ["GITHUB_REPOSITORY"]
    issues = [i for i in all_pages(f"repos/{repo}/issues?state=open") if "pull_request" not in i]
    pulls = all_pages(f"repos/{repo}/pulls?state=open")
    coordinator = (os.environ.get("COORDINATOR") or "claude").strip().lower()
    proceed, issue, reason = decide(agent, task, issues, pulls, wanted, coordinator)

    line = (f"**{agent}** may start: {reason}" + (f" → #{issue['number']} {issue['title']}" if issue else "")
            if proceed else f"**{agent}** will not start: {reason}.")
    print(line)
    out = {"proceed": str(proceed).lower(), "issue": issue["number"] if issue else "",
           "title": issue["title"] if issue else "",
           "branch": f"{agent}/issue-{issue['number']}" if issue else ""}
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            for key, value in out.items():
                f.write(f"{key}={value}\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(f"# Agent gate\n\n{line}\n")


if __name__ == "__main__":
    main()
