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
			{rightToggle}
		</div>
	);
}
