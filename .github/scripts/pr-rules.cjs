// Pull request rule checker, run by .github/workflows/pr-rules.yml through
// actions/github-script. Rules come from AGENTS.md:
//   - roughly under 400 changed lines, lock files aside (warning only)
//   - links its issue: "Closes #N" (or Fixes/Resolves) or "Part of #N"
//   - has a "Tested" and a "Not tested" section, and a "Based on" line
//   - no "Generated with Claude Code" footers or session links (removed automatically)

const MARKER = "<!-- vaultops-pr-rules -->";
const SIZE_LIMIT = 400;
const LOCK_FILES = new Set([
	"package-lock.json",
	"npm-shrinkwrap.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"bun.lockb",
	"Cargo.lock",
]);

// A section label at the start of a line, optionally bold, a heading or a list item.
const label = (words) =>
	new RegExp(`^\\s*(?:[-*]\\s+)?(?:#+\\s*)?(?:\\*\\*|__)?${words}\\b`, "im");
const RULES = [
	{
		test: /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+|\bpart of\s+#\d+/i,
		message:
			'Link the issue: add "Closes #N" (this PR finishes it) or "Part of #N".',
	},
	{
		test: label("tested"),
		message: 'Add a "Tested" section: what was checked and how.',
	},
	{
		test: label("not tested"),
		message: 'Add a "Not tested" section (say "nothing" if everything was).',
	},
	{
		test: label("based on"),
		message:
			'Add a "Based on" line: the library, official doc or known pattern this follows, or "new code, because nothing fit: …".',
	},
];

// Lines that are only a signature: "Generated with/by Claude Code", a Claude session link,
// or a Co-Authored-By trailer.
const FOOTER_LINE =
	/^\s*(?:[_*]*\s*(?:🤖\s*)?generated (?:with|by) \[?claude code\b.*|<?https:\/\/claude\.ai\/code\/\S*>?|co-authored-by:.*)$/i;

function stripFooter(body) {
	const lines = (body || "").replace(/\r\n/g, "\n").split("\n");
	const kept = lines.filter((line) => !FOOTER_LINE.test(line));
	if (kept.length === lines.length) return body || "";
	// Drop separators and blank lines the footer leaves behind at the end.
	while (
		kept.length &&
		/^\s*(?:---+|\*\*\*+|___+)?\s*$/.test(kept[kept.length - 1])
	)
		kept.pop();
	return `${kept.join("\n")}\n`;
}

function checkBody(body) {
	return RULES.filter((rule) => !rule.test.test(body || "")).map(
		(rule) => rule.message,
	);
}

function countLines(files) {
	return files
		.filter((f) => !LOCK_FILES.has(f.filename.split("/").pop()))
		.reduce((sum, f) => sum + f.additions + f.deletions, 0);
}

function report(errors, warnings) {
	if (!errors.length && !warnings.length) {
		return `${MARKER}\n**Pull request rules:** all pass.\n`;
	}
	const lines = [MARKER, "**Pull request rules** (from AGENTS.md)", ""];
	for (const e of errors) lines.push(`- ❌ ${e}`);
	for (const w of warnings) lines.push(`- ⚠️ ${w}`);
	lines.push("", "_Updates itself when the description or code changes._");
	return `${lines.join("\n")}\n`;
}

async function run({ github, context, core }) {
	const { owner, repo } = context.repo;
	const pr = context.payload.pull_request;
	const canWrite =
		pr.head.repo && pr.head.repo.full_name === `${owner}/${repo}`;
	// Re-read the description: the event payload can be older than an earlier run's cleanup.
	const fresh = await github.rest.pulls.get({
		owner,
		repo,
		pull_number: pr.number,
	});
	let body = fresh.data.body || "";

	const cleaned = stripFooter(body);
	const notes = [];
	if (cleaned !== body) {
		if (canWrite) {
			await github.rest.pulls.update({
				owner,
				repo,
				pull_number: pr.number,
				body: cleaned,
			});
			notes.push(
				"Removed a signature footer or session link from the description.",
			);
		} else {
			notes.push(
				"The description has a signature footer or session link; please remove it.",
			);
		}
		body = cleaned;
	}

	const files = await github.paginate(github.rest.pulls.listFiles, {
		owner,
		repo,
		pull_number: pr.number,
		per_page: 100,
	});
	const changed = countLines(files);
	const errors = checkBody(body);
	const warnings = [...notes];
	if (changed > SIZE_LIMIT) {
		warnings.push(
			`${changed} changed lines (lock files aside). The guide is roughly under ${SIZE_LIMIT}: split it per sub-issue if it can be, or say why it can't.`,
		);
	}

	const text = report(errors, warnings);
	await core.summary.addRaw(text.replace(MARKER, "")).write();

	if (canWrite) {
		const comments = await github.paginate(github.rest.issues.listComments, {
			owner,
			repo,
			issue_number: pr.number,
			per_page: 100,
		});
		const mine = comments.find((c) => c.body?.startsWith(MARKER));
		if (mine) {
			if (mine.body !== text) {
				await github.rest.issues.updateComment({
					owner,
					repo,
					comment_id: mine.id,
					body: text,
				});
			}
		} else if (errors.length || warnings.length) {
			await github.rest.issues.createComment({
				owner,
				repo,
				issue_number: pr.number,
				body: text,
			});
		}
	}

	for (const w of warnings) core.warning(w);
	if (errors.length) core.setFailed(errors.join("\n"));
}

module.exports = { run, checkBody, stripFooter, countLines, report, MARKER };
