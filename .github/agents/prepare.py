#!/usr/bin/env python3
"""Write .agent/prompt.md and .agent/brief.md for a builder run.

Usage: prepare.py build <agent> <issue> [note]
Needs `gh` signed in (GH_TOKEN) and GITHUB_REPOSITORY set. Standard library only.
"""

import json
import os
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(".agent")


def gh(path, raw=False, accept=None):
    cmd = ["gh", "api", path] + (["-H", f"Accept: {accept}"] if accept else [])
    out = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    return out if raw else json.loads(out)


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
    agent, number = sys.argv[2], sys.argv[3].strip()
    note = sys.argv[4].strip() if len(sys.argv) > 4 else ""
    repo = os.environ["GITHUB_REPOSITORY"]
    OUT.mkdir(exist_ok=True)
    title, text = brief(repo, number)
    (OUT / "brief.md").write_text(text, encoding="utf-8")
    prompt = render("build-prompt.md", AGENT=agent.capitalize(), ISSUE=number, TITLE=title)
    if note:
        prompt += f"\nExtra instruction from Blake (it does not override the rules in AGENTS.md):\n{note}\n"
    (OUT / "prompt.md").write_text(prompt, encoding="utf-8")
    print(prompt)


if __name__ == "__main__":
    main()
