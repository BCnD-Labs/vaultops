export type WindowRect = {
	left: number;
	top: number;
	width: number;
	height: number;
};

type WindowSize = Pick<WindowRect, "width" | "height">;

function fitAxis(start: number, size: number, span: number, minimum: number) {
	const margin = Math.min(8, span / 2);
	const length = Math.min(Math.max(minimum, size), span - 2 * margin);
	const offset = Math.max(margin, Math.min(start, span - length - margin));
	return [offset, length] as const;
}

export function fitWindow(
	rect: WindowRect,
	viewport: WindowSize,
	{
		x = 0,
		y = 0,
		resize = false,
	}: { x?: number; y?: number; resize?: boolean } = {},
): WindowRect {
	let { left, top, width, height } = rect;
	if (resize) {
		width = Math.min(width + x, viewport.width - left - 8);
		height = Math.min(height + y, viewport.height - top - 8);
	} else {
		left += x;
		top += y;
	}
	[left, width] = fitAxis(left, width, viewport.width, 180);
	[top, height] = fitAxis(top, height, viewport.height, 120);
	return { left, top, width, height };
}
