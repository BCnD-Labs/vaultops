const f = (o: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat(undefined, { ...o, timeZone: "UTC" });
const at = (key: string) => new Date(`${key}T12:00:00Z`);
export const fmtDay = (key: string) =>
	f({ weekday: "short", month: "short", day: "numeric" }).format(at(key));
export const fmtLong = (key: string) =>
	f({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(
		at(key),
	);
export const fmtShort = (key: string) =>
	f({ month: "short", day: "numeric" }).format(at(key));
export const fmtMonth = (key: string) =>
	f({ month: "long", year: "numeric" }).format(at(key));
export const fmtWeekday = (key: string) =>
	f({ weekday: "short" }).format(at(key));
export const dayNum = (key: string) => String(Number(key.slice(8, 10)));
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
