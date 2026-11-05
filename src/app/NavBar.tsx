import {
	ArrowLeft,
	ArrowRight,
	BookOpen,
	Ellipsis,
	Pencil,
} from "lucide-react";
import type { ReactNode } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

function StepButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="nav-step"
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

/**
 * The bar under the tabs: back and forward through opened notes, then where the
 * open note lives. A sidebar's show button appears at its end of the bar only
 * while that sidebar is collapsed, so the bar never reserves room for it.
 */
export function NavBar({
	vault,
	path,
	title,
	canGoBack,
	canGoForward,
	onBack,
	onForward,
	leftToggle,
	rightToggle,
	reading = false,
	onToggleReading,
}: {
	vault: string;
	path: string | null;
	title: string | null;
	canGoBack: boolean;
	canGoForward: boolean;
	onBack: () => void;
	onForward: () => void;
	leftToggle?: ReactNode;
	rightToggle?: ReactNode;
	/** The open note is shown for reading only. */
	reading?: boolean;
	/** Given only while a note is open: shows the reading toggle and the more menu. */
	onToggleReading?: () => void;
}) {
	return (
		<div className="nav-bar">
			{leftToggle}
			<StepButton label="Back" disabled={!canGoBack} onClick={onBack}>
				<ArrowLeft aria-hidden="true" />
			</StepButton>
			<StepButton label="Forward" disabled={!canGoForward} onClick={onForward}>
				<ArrowRight aria-hidden="true" />
			</StepButton>
			<Breadcrumb className="shell-breadcrumb">
				<BreadcrumbList>
					{title !== null && (
						<>
							<BreadcrumbItem>
								{path?.split("/").slice(0, -1).join("/") || vault}
							</BreadcrumbItem>
							<BreadcrumbSeparator />
						</>
					)}
					<BreadcrumbItem>
						<BreadcrumbPage>{title ?? vault}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			{onToggleReading && (
				<>
					<StepButton
						label={
							reading ? "Switch to editing view" : "Switch to reading view"
						}
						disabled={false}
						onClick={onToggleReading}
					>
						{reading ? (
							<Pencil aria-hidden="true" />
						) : (
							<BookOpen aria-hidden="true" />
						)}
					</StepButton>
					<DropdownMenu>
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="nav-step"
										aria-label="More options"
									>
										<Ellipsis aria-hidden="true" />
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent>More options</TooltipContent>
						</Tooltip>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={onToggleReading}>
								{reading ? "Switch to editing view" : "Switch to reading view"}
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={!path}
								onSelect={() => {
									try {
										void navigator.clipboard?.writeText(path ?? "");
									} catch {
										/* Clipboard is optional. */
									}
								}}
							>
								Copy file path
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</>
			)}
			{rightToggle}
		</div>
	);
}
