import { Check, GitBranch, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { Host, VcsBranch } from "../host/host";

/**
 * The vault's branches: switch, start a new one, rename the current one, or
 * delete one whose work is merged. Switching saves open notes first and is
 * refused while anything isn't in a save point, so no work is lost.
 */
export function BranchMenu({
	host,
	current,
	beforeSwitch,
	onChanged,
}: {
	host: Pick<Host, "vcs">;
	/** The current branch's name. */
	current: string | null;
	/** Save open notes to disk; false when one couldn't be saved. */
	beforeSwitch?: () => Promise<boolean>;
	/** Branches changed; `switched` when the vault's files did too. */
	onChanged: (switched: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	const [list, setList] = useState<VcsBranch[]>([]);
	const [name, setName] = useState("");
	const [rename, setRename] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const refresh = async () => setList(await host.vcs.branches());

	const run = async (action: () => Promise<unknown>, switched: boolean) => {
		setBusy(true);
		setMessage(null);
		try {
			if (switched && beforeSwitch && !(await beforeSwitch())) {
				setMessage(
					"A note couldn't be saved to disk, so the branch wasn't switched.",
				);
				return;
			}
			await action();
			await refresh();
			onChanged(switched);
			return true;
		} catch (e) {
			setMessage(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setMessage(null);
				if (next) void refresh().catch(() => {});
			}}
		>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="branch-menu-trigger">
					<GitBranch aria-hidden="true" /> {current ?? "(no branch)"}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="branch-menu"
				aria-label="Branches"
			>
				<p className="settings-note">Switch branch</p>
				<ul className="branch-list">
					{list.map((b) => (
						<li key={b.name}>
							<Button
								variant="ghost"
								size="sm"
								className="branch-row"
								disabled={busy || b.current}
								aria-current={b.current ? "true" : undefined}
								onClick={() =>
									void run(() => host.vcs.switchBranch(b.name), true)
								}
							>
								{b.current ? (
									<Check aria-hidden="true" />
								) : (
									<GitBranch aria-hidden="true" />
								)}
								<span className="branch-name">{b.name}</span>
								<span className="branch-subject">{b.subject}</span>
							</Button>
							{!b.current && (
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Delete branch ${b.name}`}
									title="Delete branch (only when its work is merged)"
									disabled={busy}
									onClick={() =>
										void run(() => host.vcs.deleteBranch(b.name), false)
									}
								>
									<Trash2 aria-hidden="true" />
								</Button>
							)}
						</li>
					))}
				</ul>
				<form
					className="branch-form"
					onSubmit={(e) => {
						e.preventDefault();
						void run(() => host.vcs.createBranch(name.trim(), true), true).then(
							(ok) => ok && setName(""),
						);
					}}
				>
					<Input
						aria-label="New branch name"
						placeholder="New branch, e.g. essay-v2"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<Button type="submit" size="sm" disabled={busy || name.trim() === ""}>
						Create and switch
					</Button>
				</form>
				{current && (
					<form
						className="branch-form"
						onSubmit={(e) => {
							e.preventDefault();
							void run(
								() => host.vcs.renameBranch(current, rename.trim()),
								false,
							).then((ok) => ok && setRename(""));
						}}
					>
						<Input
							aria-label="Rename current branch"
							placeholder={`Rename ${current}`}
							value={rename}
							onChange={(e) => setRename(e.target.value)}
						/>
						<Button
							type="submit"
							size="sm"
							variant="secondary"
							disabled={busy || rename.trim() === ""}
						>
							Rename
						</Button>
					</form>
				)}
				{message && (
					<p role="alert" className="notice">
						{message}
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
