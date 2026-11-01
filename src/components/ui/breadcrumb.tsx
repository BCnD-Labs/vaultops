import { Slot } from "@radix-ui/react-slot";
import { ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Breadcrumb(props: ComponentProps<"nav">) {
	return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: ComponentProps<"ol">) {
	return (
		<ol
			data-slot="breadcrumb-list"
			className={cn(
				"flex flex-wrap items-center gap-1 text-sm text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function BreadcrumbItem({ className, ...props }: ComponentProps<"li">) {
	return (
		<li
			data-slot="breadcrumb-item"
			className={cn("inline-flex items-center gap-1", className)}
			{...props}
		/>
	);
}

function BreadcrumbLink({
	asChild,
	className,
	...props
}: ComponentProps<"a"> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "a";
	return (
		<Comp
			data-slot="breadcrumb-link"
			className={cn("transition-colors hover:text-foreground", className)}
			{...props}
		/>
	);
}

function BreadcrumbPage({ className, ...props }: ComponentProps<"span">) {
	return (
		<span
			data-slot="breadcrumb-page"
			aria-current="page"
			className={cn("font-medium text-foreground", className)}
			{...props}
		/>
	);
}

function BreadcrumbSeparator({ className, ...props }: ComponentProps<"li">) {
	return (
		<li
			data-slot="breadcrumb-separator"
			role="presentation"
			aria-hidden="true"
			className={cn("[&>svg]:size-3.5", className)}
			{...props}
		>
			<ChevronRight />
		</li>
	);
}

export {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
};
