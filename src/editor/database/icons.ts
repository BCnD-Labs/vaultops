import {
	AlignLeft,
	Calendar,
	CircleChevronDown,
	CircleDot,
	Gauge,
	Hash,
	Link,
	type LucideIcon,
	SquareCheck,
	Tags,
	Type,
} from "lucide-react";
import type { ColumnType } from "./model";

/** The icon shown beside each column type, in headers, menus and the row page. */
export const TYPE_ICONS: Readonly<Record<ColumnType, LucideIcon>> = {
	title: Type,
	text: AlignLeft,
	number: Hash,
	select: CircleChevronDown,
	multiSelect: Tags,
	date: Calendar,
	checkbox: SquareCheck,
	url: Link,
	status: CircleDot,
	progress: Gauge,
};
