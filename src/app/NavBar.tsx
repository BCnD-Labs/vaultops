import { ArrowLeft, ArrowRight } from "lucide-react";
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
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarPopover } from "./planner/CalendarPopover";

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
	clearLeftToggle = false,
	clearRightToggle = false,
	controls = true,
	calendar = true,
}: {
	vault: string;
	path: string | null;
	title: string | null;
	canGoBack: boolean;
	canGoForward: boolean;
	onBack: () => void;
	onForward: () => void;
	/** The sidebar toggle floats over the window's top left corner while the
	 *  left sidebar is collapsed; leave room for it. */
	clearLeftToggle?: boolean;
	/** Same for the right sidebar's toggle at the window's top right. */
	clearRightToggle?: boolean;
	/** Back and forward. A pane that is not focused shows only
	 *  where its note lives, since those act on the focused pane. */
	controls?: boolean;
	/** The title-bar calendar button (shown once per window). */
	calendar?: boolean;
}) {
	return (
		<div
			className="nav-bar"
			data-clear-toggle={clearLeftToggle || undefined}
			data-clear-right-toggle={clearRightToggle || undefined}
		>
			{controls && (
				<>
					<StepButton label="Back" disabled={!canGoBack} onClick={onBack}>
						<ArrowLeft aria-hidden="true" />
					</StepButton>
					<StepButton
						label="Forward"
						disabled={!canGoForward}
						onClick={onForward}
					>
						<ArrowRight aria-hidden="true" />
					</StepButton>
				</>
			)}
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
			{calendar && <CalendarPopover />}
		</div>
	);
}
