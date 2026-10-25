#!/usr/bin/env python3
"""Issue health report (Maintenance button). Read-only: it changes nothing.

Lists:
  - anything labeled "hold" (agents start no new work while one exists),
  - draft pull requests with no activity for --days (stale claims),
  - open issues with no milestone (weekly updates aside),
  - pull requests open longer than --days (default 3),
  - tasks whose sub-issues are all closed but which are still open.

Writes the report to stdout and, on GitHub, to the run's summary page.
Needs `gh` signed in (GH_TOKEN) and GITHUB_REPOSITORY set. Standard library only.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

SKIP_LABELS = {"weekly"}


def gh(path):
    result = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"gh failed: {path}\n{result.stderr.strip()}")
    return json.loads(result.stdout)


def all_pages(path):
    found, page = [], 1
    while True:
        items = gh(f"{path}{'&' if '?' in path else '?'}per_page=100&page={page}")
        found += items
        if len(items) < 100:
            return found
        page += 1


def labels(item):
    return {x["name"] for x in item.get("labels", [])}


def no_milestone(issues):
    return [i for i in issues if not i.get("milestone") and not labels(i) & SKIP_LABELS]


def finished_tasks(issues):
    """Open issues that have sub-issues, all of them closed."""
    done = []
    for i in issues:
        summary = i.get("sub_issues_summary") or {}
        if summary.get("total", 0) > 0 and summary.get("completed") == summary["total"]:
            done.append(i)
    return done


def holds(issues, pulls):
    """Open issues and pull requests labeled hold."""
    return sorted([x for x in issues + pulls if "hold" in labels(x)], key=lambda x: x["number"])


def stale_claims(pulls, now, days):
    """Draft pull requests (work in progress) not updated for `days`."""
    cutoff = now - timedelta(days=days)
    return [p for p in pulls if p.get("draft")
            and datetime.fromisoformat(p["updated_at"].replace("Z", "+00:00")) < cutoff]


def stale_pulls(pulls, now, days):
    cutoff = now - timedelta(days=days)
    return [p for p in pulls
            if datetime.fromisoformat(p["created_at"].replace("Z", "+00:00")) < cutoff]


def age(stamp, now):
    days = (now - datetime.fromisoformat(stamp.replace("Z", "+00:00"))).days
    return "today" if days == 0 else f"{days} day{'s' if days != 1 else ''}"


def render(issues, pulls, now, days):
    sections = [
        ("On hold: no agent starts new work until these are cleared", holds(issues, pulls),
         lambda x: f"- #{x['number']} {x['title']}"),
        (f"Stale claims: draft pull requests idle more than {days} days", stale_claims(pulls, now, days),
         lambda p: f"- #{p['number']} {p['title']} (last activity {age(p['updated_at'], now)} ago, "
                   f"by {p['user']['login']})"),
        ("Issues with no milestone", no_milestone(issues),
         lambda i: f"- #{i['number']} {i['title']}"),
        (f"Pull requests open more than {days} days", stale_pulls(pulls, now, days),
         lambda p: f"- #{p['number']} {p['title']} (open {age(p['created_at'], now)}"
                   f"{', draft' if p.get('draft') else ''}, by {p['user']['login']})"),
        ("Tasks with every sub-issue closed, still open", finished_tasks(issues),
         lambda i: f"- #{i['number']} {i['title']} "
                   f"({i['sub_issues_summary']['completed']} of {i['sub_issues_summary']['total']} done)"),
    ]
    total = sum(len(items) for _, items, _ in sections)
    lines = [f"# Issue health ({now:%Y-%m-%d})", "",
             "Nothing needs attention." if total == 0 else f"{total} item(s) need a look."]
    for title, items, fmt in sections:
        lines += ["", f"## {title} ({len(items)})"]
        lines += [fmt(x) for x in items] or ["None."]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=3, help="flag pull requests open longer than this")
    args = parser.parse_args()
    repo = os.environ["GITHUB_REPOSITORY"]
    issues = [i for i in all_pages(f"repos/{repo}/issues?state=open") if "pull_request" not in i]
    pulls = all_pages(f"repos/{repo}/pulls?state=open")
    report = render(issues, pulls, datetime.now(timezone.utc), args.days)
    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
            out.write(report)


if __name__ == "__main__":
    main()
