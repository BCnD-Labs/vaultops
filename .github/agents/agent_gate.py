#!/usr/bin/env python3
"""Decide whether an agent may start, and on which issues (Agents workflow).

Usage: agent_gate.py <agent> <task> [issue] [count]
       agent_gate.py --recheck <issue>
  agent: claude | codex | gemini
  task:  next   (up to `count` of the oldest ready issues, default 3)
         issue  (the given issue number: Blake's choice overrides the labels)
         review (the coordinator reviews open agent pull requests; never blocked by a hold)
  --recheck: before each task of a batch, stop if something went on hold meanwhile.

Follows AGENTS.md "Team and handoff": no new work while anything is on hold,
at most MAX_OPEN open pull requests per agent, and an issue whose "Depends on"
issues are still open waits. Every reason is written in plain words for Blake.
Writes GITHUB_OUTPUT (proceed, tasks as JSON) and the run's summary page, and
comments on an issue that was skipped because it waits for another one.
Needs `gh` signed in (GH_TOKEN) and GITHUB_REPOSITORY set. Standard library only.
"""

import json
import os
import re
import subprocess
import sys

AGENTS = ("claude", "codex", "gemini")
MAX_OPEN = 3
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


def holds(issues, pulls):
    return sorted(x["number"] for x in issues + pulls if "hold" in labels(x))


def plan(agent, task, issues, pulls, wanted=None, coordinator="claude", count=3):
    """Return (tasks to start, plain-language lines for Blake, skipped {issue: reason})."""
    if agent not in AGENTS:
        return [], [f"Nothing started: {agent!r} is not one of the agents ({', '.join(AGENTS)})."], {}
    if task == "review":
        if agent == coordinator:
            return [], [f"{name(agent)} reviews the open agent pull requests as coordinator."], {}
        return [], [f"Nothing started: only the coordinator reviews, and that is {name(coordinator)} right now "
                    "(repo variable COORDINATOR)."], {}
    held = holds(issues, pulls)
    if held:
        return [], [f"Nothing started: {refs(held)} {'is' if len(held) == 1 else 'are'} on hold. No agent starts "
                    "new work until you look at it and remove the hold label."], {}
    mine = sorted(p["number"] for p in pulls if p["head"]["ref"].startswith(f"{agent}/"))
    if len(mine) >= MAX_OPEN:
        return [], [f"Nothing started: {name(agent)} already has {len(mine)} pull requests waiting ({refs(mine)}). "
                    f"New work starts once one is merged or closed."], {}
    by_number = {i["number"]: i for i in issues}
    if task == "issue":
        if wanted not in by_number:
            return [], [f"Nothing started: #{wanted} is not an open issue."], {}
        return [by_number[wanted]], [f"Starting #{wanted} {by_number[wanted]['title']}, the issue you picked."], {}
    if task != "next":
        return [], [f"Nothing started: {task!r} is not a task this button knows."], {}

    room = MAX_OPEN - len(mine)
    slots = min(count, room)
    taken = linked_issues(pulls)
    picks, skipped, notes, lines = [], {}, [], []
    for i in sorted(issues, key=lambda i: i["number"]):
        tags = labels(i)
        if "ready" not in tags or i["number"] in taken or "deferred" in tags:
            continue
        assigned = {t.split(":", 1)[1] for t in tags if t.startswith("agent:")}
        if assigned and agent not in assigned:
            continue
        if len(picks) == slots:
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
        lines.append(f"Starting {len(picks)} of {count}: " +
                     "; ".join(f"#{i['number']} {i['title']}" for i in picks) + ".")
    else:
        lines.append(f"Nothing started for {name(agent)}.")
    lines += list(skipped.values()) + notes
    if len(picks) < count:
        if len(picks) == slots and slots < count:
            lines.append(f"Fewer than {count}: {name(agent)} already has {len(mine)} pull request"
                         f"{'s' if len(mine) != 1 else ''} waiting ({refs(mine)}), and an agent can have at most "
                         f"{MAX_OPEN} open at once.")
        else:
            lines.append(f"{'No' if not picks else 'No more'} tasks are marked ready for {name(agent)}"
                         + (" (the others are waiting on something above)." if skipped or notes else "."))
    return picks, lines, skipped


def recheck(issues, pulls, number):
    held = holds(issues, pulls)
    if held:
        return False, (f"#{number} was not started: {refs(held)} went on hold during this run. Nothing else "
                       "starts until you look at it and remove the hold label.")
    return True, f"#{number}: nothing on hold, starting."


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

    if sys.argv[1] == "--recheck":
        ok, line = recheck(issues, pulls, sys.argv[2])
        print(line if ok else f"::warning title=Stopped::{line}")
        write("GITHUB_OUTPUT", f"proceed={str(ok).lower()}\n")
        write("GITHUB_STEP_SUMMARY", f"{line}\n")
        return

    agent, task = sys.argv[1], sys.argv[2]
    arg = lambda n: sys.argv[n].strip() if len(sys.argv) > n and sys.argv[n].strip() else None  # noqa: E731
    wanted = int(arg(3)) if arg(3) else None
    count = int(arg(4)) if arg(4) else 3
    coordinator = (os.environ.get("COORDINATOR") or "claude").strip().lower()
    picks, lines, skipped = plan(agent, task, issues, pulls, wanted, coordinator, count)

    proceed = bool(picks) or (task == "review" and agent == coordinator)
    tasks = [{"issue": i["number"], "branch": f"{agent}/issue-{i['number']}"} for i in picks]
    # Notices show on the run's main page, so the reasons are seen without digging.
    for line in lines:
        print(f"::notice title=What the Agents button did::{line}")
    write("GITHUB_OUTPUT", f"proceed={str(proceed).lower()}\ntasks={json.dumps(tasks)}\n")
    write("GITHUB_STEP_SUMMARY", "# What the Agents button did\n\n" + "".join(f"- {x}\n" for x in lines))
    if os.environ.get("GATE_COMMENTS") == "true":
        for number, reason in skipped.items():
            comment(repo, number, reason)


if __name__ == "__main__":
    main()
