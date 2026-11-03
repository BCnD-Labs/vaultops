import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Tabs({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col", className)}
			{...props}
		/>
	);
}

function TabsList({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"flex items-center gap-1 border-b-[length:var(--border-width)] border-border",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"-mb-px border-b-2 border-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-ring data-[state=active]:border-primary data-[state=active]:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1 outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
