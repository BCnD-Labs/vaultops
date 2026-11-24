import {
	Calendar,
	CheckSquare,
	ChevronsUpDown,
	Hash,
	List,
	Type,
} from "lucide-react";
import type { PropertyType } from "../core/notes/properties";

export const PROPERTY_ICONS = {
	text: Type,
	number: Hash,
	date: Calendar,
	checkbox: CheckSquare,
	list: List,
	select: ChevronsUpDown,
};

export const TYPE_LABEL: Record<PropertyType, string> = {
	text: "Text",
	number: "Number",
	date: "Date",
	checkbox: "Checkbox",
	list: "List",
	select: "Select",
};
