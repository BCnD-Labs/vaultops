#!/usr/bin/env python3
"""Apply a file of issue changes to this repo's issues (run by the Maintenance workflow).

Usage: apply_issue_updates.py <changes.json> [--dry-run]

Safe to run again: each step checks the issue's current state first, so a
finished step is skipped (no repeated comments, labels or edits).
Needs `gh` signed in (GH_TOKEN) and GITHUB_REPOSITORY set.
"""

import json
import os
import subprocess
import sys
import urllib.parse

REPO = os.environ["GITHUB_REPOSITORY"]
DRY = "--dry-run" in sys.argv
DATA = json.load(open(sys.argv[1], encoding="utf-8"))


def gh(*args, body=None):
    cmd = ["gh", "api", *args]
    if body is not None:
        cmd += ["--input", "-"]
    result = subprocess.run(cmd, input=json.dumps(body) if body is not None else None,
                            capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"gh failed: {' '.join(args)}\n{result.stderr.strip()}")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def act(description, fn):
    print(("would: " if DRY else "") + description)
    if not DRY:
        fn()


def all_issues():
    """Map "T04.1" etc. to the issue; an open issue wins over a closed one."""
    found = {}
    page = 1
    while True:
        items = gh(f"repos/{REPO}/issues?state=all&per_page=100&page={page}")
        if not items:
            return found
        for issue in items:
            title = issue["title"]
            if "pull_request" in issue or ": " not in title or not title.startswith("T"):
                continue
            key = title.split(": ", 1)[0]
            if key not in found or (found[key]["state"] == "closed" and issue["state"] == "open"):
                found[key] = issue
        page += 1


def body_for(item, numbers):
    lines = [item["what"], "", "## Done when", *[f"- [ ] {d}" for d in item["done"]]]
    if item.get("decision"):
        lines += ["", f"**Needs a maintainer decision:** {item['decision']}."]
    if item.get("needs"):
        refs = [f"#{numbers[n]} ({n})" if n in numbers else f"{n} (done)" for n in item["needs"]]
        lines += ["", "## Depends on", ", ".join(refs)]
    if item.get("note"):
        lines += ["", item["note"]]
    return "\n".join(lines)


def main():
    issues = all_issues()
    numbers = {k: v["number"] for k, v in issues.items()}
    wanted = set(DATA["edit"]) | set(DATA["defer"]) | set(DATA["close"]) | set(DATA["unlabel"])
    missing = sorted(wanted - set(issues))
    if missing:
        sys.exit(f"Issues not found by title: {missing}")

    labels = [x["name"] for x in gh(f"repos/{REPO}/labels?per_page=100")]
    if DATA["deferLabel"] not in labels:
        act(f"create label {DATA['deferLabel']!r}", lambda: gh(
            f"repos/{REPO}/labels", "-X", "POST",
            body={"name": DATA["deferLabel"], "color": "c5def5", "description": "Moved out of phase 1"}))
    milestones = {m["title"]: m["number"] for m in gh(f"repos/{REPO}/milestones?state=all&per_page=100")}
    if DATA["deferMilestone"] not in milestones:
        def make():
            milestones[DATA["deferMilestone"]] = gh(
                f"repos/{REPO}/milestones", "-X", "POST", body={"title": DATA["deferMilestone"]})["number"]
        act(f"create milestone {DATA['deferMilestone']!r}", make)

    for key, item in DATA["edit"].items():
        issue = issues[key]
        title, body = f"{key}: {item['title']}", body_for(item, numbers)
        if issue["title"] != title or (issue["body"] or "") != body:
            act(f"edit #{issue['number']} {title}", lambda n=issue["number"], t=title, b=body: gh(
                f"repos/{REPO}/issues/{n}", "-X", "PATCH", body={"title": t, "body": b}))

    for key, note in DATA["defer"].items():
        issue = issues[key]
        if (issue.get("milestone") or {}).get("title") == DATA["deferMilestone"]:
            continue

        def defer(n=issue["number"], note=note):
            gh(f"repos/{REPO}/issues/{n}", "-X", "PATCH", body={"milestone": milestones[DATA["deferMilestone"]]})
            gh(f"repos/{REPO}/issues/{n}/labels", "-X", "POST", body={"labels": [DATA["deferLabel"]]})
            gh(f"repos/{REPO}/issues/{n}/comments", "-X", "POST", body={"body": note})
        act(f"defer #{issue['number']} ({key})", defer)

    for key, (reason, note) in DATA["close"].items():
        issue = issues[key]
        if issue["state"] == "closed":
            continue

        def close(n=issue["number"], reason=reason, note=note):
            gh(f"repos/{REPO}/issues/{n}/comments", "-X", "POST", body={"body": note})
            gh(f"repos/{REPO}/issues/{n}", "-X", "PATCH", body={"state": "closed", "state_reason": reason})
        act(f"close #{issue['number']} ({key}) as {reason}", close)

    for key in DATA["unlabel"]:
        issue = issues[key]
        if not any(x["name"] == "needs decision" for x in issue["labels"]):
            continue
        label = urllib.parse.quote("needs decision")
        act(f"remove 'needs decision' from #{issue['number']} ({key})", lambda n=issue["number"]: gh(
            f"repos/{REPO}/issues/{n}/labels/{label}", "-X", "DELETE"))

    print("Dry run: nothing changed." if DRY else "Done.")


if __name__ == "__main__":
    main()
