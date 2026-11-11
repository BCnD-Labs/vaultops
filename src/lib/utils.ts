import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join class names; when two Tailwind classes clash, the later one wins. */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
