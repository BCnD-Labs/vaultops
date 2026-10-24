#!/usr/bin/env python3
"""Delete screenshots of merged pull requests from the ci-screenshots branch.

Usage: screenshot_cleanup.py [--dry-run]

The screenshot check stores each pull request's images in a `pr-<number>/`
folder on the `ci-screenshots` branch. This removes the folders of merged
pull requests in one commit. Open and closed-but-not-merged pull requests are
kept and listed. Removed images stay in the branch's git history.

Needs `gh` signed in (GH_TOKEN) and GITHUB_REPOSITORY set; git pushes with the
same token. Standard library only.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

BRANCH = "ci-screenshots"
FOLDER = re.compile(r"^pr-(\d+)$")


def run(*cmd, cwd=None):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"failed: {' '.join(cmd[:3])} ...\n{result.stderr.strip()}")
    return result.stdout


def gh(path):
    return json.loads(run("gh", "api", path))


def plan(folders, state_of):
    """Split pr-N folder names into (delete, keep) lists using state_of(n)."""
    delete, keep = [], []
    for name in sorted(folders, key=lambda f: int(FOLDER.match(f).group(1)) if FOLDER.match(f) else 0):
        match = FOLDER.match(name)
        if not match:
            keep.append((name, "not a pull request folder"))
            continue
        state = state_of(int(match.group(1)))
        (delete if state == "merged" else keep).append((name, state))
    return delete, keep


def state_of(repo):
    def lookup(n):
        pr = gh(f"repos/{repo}/pulls/{n}")
        return "merged" if pr.get("merged_at") else pr["state"]
    return lookup


def main():
    dry = "--dry-run" in sys.argv
    repo = os.environ["GITHUB_REPOSITORY"]
    tree = gh(f"repos/{repo}/git/trees/{BRANCH}")["tree"]
    folders = [t["path"] for t in tree if t["type"] == "tree"]
    delete, keep = plan(folders, state_of(repo))

    lines = [f"# Screenshot cleanup{' (dry run)' if dry else ''}", "",
             f"## {'Would delete' if dry else 'Deleted'} ({len(delete)})"]
    lines += [f"- {name} (merged)" for name, _ in delete] or ["None."]
    lines += ["", f"## Kept ({len(keep)})"]
    lines += [f"- {name} ({why})" for name, why in keep] or ["None."]
    report = "\n".join(lines) + "\n"

    if delete and not dry:
        token = os.environ["GH_TOKEN"]
        with tempfile.TemporaryDirectory() as work:
            url = f"https://x-access-token:{token}@github.com/{repo}.git"
            run("git", "clone", "-q", "--depth", "1", "--branch", BRANCH, url, work)
            run("git", "rm", "-q", "-r", "--", *[name for name, _ in delete], cwd=work)
            run("git", "-c", "user.name=github-actions",
                "-c", "user.email=github-actions@users.noreply.github.com",
                "commit", "-q", "-m",
                "Remove screenshots of merged pull requests: " + ", ".join(n for n, _ in delete), cwd=work)
            run("git", "push", "-q", "origin", BRANCH, cwd=work)

    print(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
            out.write(report)


if __name__ == "__main__":
    main()
