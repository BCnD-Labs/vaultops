#!/usr/bin/env python3
"""Pick the issues an agent builds (Agents workflow).

Usage: agent_gate.py <agent> <task> [issue] [count]
  agent: claude | codex
  task:  next   (up to `count`, at most 3, of the oldest ready issues)
         issue  (the given issue number)

Follows AGENTS.md "Team and handoff": an issue needs the `ready` label, no open
pull request of its own, and every "Depends on" issue closed; `paused`,
`needs decision` and `deferred` issues are left alone. Every reason is written
in plain words for Blake. Writes GITHUB_OUTPUT (proceed, tasks as JSON) and the
run's summary page, and comments on an issue that was skipped because it waits
for another one.
Needs `gh` signed in (GH_TOKEN) and GITHUB_REPOSITORY set. Standard library only.
"""

import json
import os
import re
import subprocess
import sys

AGENTS = ("claude", "codex")
MAX_BATCH = 3
LINK = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|part of)\s+#(\d+)", re.I)
# The "## Depends on" heading and the lines under it, up to the next blank line.
DEPENDS = re.compile(r"^#+\s*depends on\s*\n(.*?)(?=\n\s*\n|\n#|\Z)", re.I | re.M | re.S)
MARKER = "<!-- agent-gate -->"


def gh(*args, body=None):
    cmd = ["gh", "api", *args]
    if body is not None:
        cmd += ["--input", "-"]
    result = subprocess.run(cmd, input=json.dumps(body) if body is not None else None,
                            capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"gh failed: {' '.join(args)}\n{result.stderr.strip()}")
    return json.loads(result.stdout) if result.stdout.strip() else {}


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


def name(agent):
    return agent.capitalize()


def refs(numbers):
    """#4, #5 and #6"""
    items = [f"#{n}" for n in sorted(numbers)]
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def linked_issues(pulls):
    return {int(n) for p in pulls for n in LINK.findall(p.get("body") or "")}


def depends_on(issue):
    """Issue numbers listed under a "Depends on" heading in the issue's description."""
    found = set()
    for section in DEPENDS.findall(issue.get("body") or ""):
        found |= {int(n) for n in re.findall(r"#(\d+)", section)}
    return found


def plan(agent, task, issues, pulls, wanted=None, count=3):
    """Return (tasks to start, plain-language lines for Blake, skipped {issue: reason})."""
    if agent not in AGENTS:
        return [], [f"Nothing started: {agent!r} is not one of the agents ({', '.join(AGENTS)})."], {}
    by_number = {i["number"]: i for i in issues}
    if task == "issue":
        if wanted not in by_number:
            return [], [f"Nothing started: #{wanted} is not an open issue."], {}
        return [by_number[wanted]], [f"Starting #{wanted} {by_number[wanted]['title']}, the issue you picked."], {}
    if task != "next":
        return [], [f"Nothing started: {task!r} is not a task this button knows."], {}

    count = max(1, min(count, MAX_BATCH))
    taken = linked_issues(pulls)
    picks, skipped, notes = [], {}, []
    for i in sorted(issues, key=lambda i: i["number"]):
        tags = labels(i)
        if "ready" not in tags or i["number"] in taken or "deferred" in tags:
            continue
        if len(picks) == count:
            break
        if "needs decision" in tags:
            notes.append(f"#{i['number']} was not started: it is waiting on a decision from you.")
            continue
        if "paused" in tags:
            notes.append(f"#{i['number']} was not started: it is paused (see the comment on it).")
            continue
        waiting = sorted(n for n in depends_on(i) if n in by_number)
        if waiting:
            skipped[i["number"]] = (f"#{i['number']} was not started: it waits for {refs(waiting)} to be finished "
                                    "and merged first.")
            continue
        picks.append(i)

    if picks:
        lines = [f"Starting {len(picks)} of {count}: " + "; ".join(f"#{i['number']} {i['title']}" for i in picks) + "."]
    else:
        lines = [f"Nothing started for {name(agent)}."]
    lines += list(skipped.values()) + notes
    if len(picks) < count:
        lines.append(f"{'No' if not picks else 'No more'} tasks are marked ready"
                     + (" (the others are waiting on something above)." if skipped or notes else "."))
    return picks, lines, skipped


def write(path_env, text):
    if os.environ.get(path_env):
        with open(os.environ[path_env], "a", encoding="utf-8") as f:
            f.write(text)


def comment(repo, number, text):
    """One gate comment per issue, updated in place instead of piling up."""
    body = f"{MARKER}\n**Agents button:** {text}"
    for c in all_pages(f"repos/{repo}/issues/{number}/comments?"):
        if MARKER in (c.get("body") or ""):
            if c["body"] != body:
                gh(f"repos/{repo}/issues/comments/{c['id']}", "-X", "PATCH", body={"body": body})
            return
    gh(f"repos/{repo}/issues/{number}/comments", "-X", "POST", body={"body": body})


def main():
    repo = os.environ["GITHUB_REPOSITORY"]
    issues = [i for i in all_pages(f"repos/{repo}/issues?state=open") if "pull_request" not in i]
    pulls = all_pages(f"repos/{repo}/pulls?state=open")

    agent, task = sys.argv[1], sys.argv[2]
    arg = lambda n: sys.argv[n].strip() if len(sys.argv) > n and sys.argv[n].strip() else None  # noqa: E731
    wanted = int(arg(3)) if arg(3) else None
    count = int(arg(4)) if arg(4) else 3
    picks, lines, skipped = plan(agent, task, issues, pulls, wanted, count)

    tasks = [{"issue": i["number"], "branch": f"{agent}/issue-{i['number']}"} for i in picks]
    # Notices show on the run's main page, so the reasons are seen without digging.
    for line in lines:
        print(f"::notice title=What the Agents button did::{line}")
    write("GITHUB_OUTPUT", f"proceed={str(bool(picks)).lower()}\ntasks={json.dumps(tasks)}\n")
    write("GITHUB_STEP_SUMMARY", "# What the Agents button did\n\n" + "".join(f"- {x}\n" for x in lines))
    if os.environ.get("GATE_COMMENTS") == "true":
        for number, reason in skipped.items():
            comment(repo, number, reason)


if __name__ == "__main__":
    main()
