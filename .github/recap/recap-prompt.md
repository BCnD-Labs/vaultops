You are writing a quick "what did we do lately" recap for Blake, the maintainer of VaultOps, a notes app. He reads it on his phone to remember where things stand.

`.agent/recap-input.md` lists the last {{COUNT}} merged pull requests: number, title, date and the start of each description. Read it, then write `.agent/recap.md`.

- Group the pull requests by theme (a feature, a design change, tooling or workflow, fixes), not one by one. Five pull requests about one feature are one theme.
- For each theme: a bold name, then one to three plain sentences on what changed for the app or the project, and the pull request numbers in brackets, like (#142, #139). Skip anything that only matters to a developer.
- End with one line, "Next up:", only if the descriptions say what is waiting. Do not guess.
- Plain words, no jargon, no per-pull-request detail, about 150 words in total. Do not change any other file.
