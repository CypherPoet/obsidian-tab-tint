import type { MenuItem, WorkspaceLeaf } from "obsidian";

/*
 * Obsidian has no public API for a tab's header element or a menu item's root
 * element, so every plugin that styles tab headers reads these two private
 * fields. Keeping the reads here — duck-typed and null-safe — means an
 * internal rename degrades to "tints stop applying" in exactly one place
 * instead of crashing callers.
 */

function asElement(value: unknown): HTMLElement | null {
	// instanceof HTMLElement fails across popout windows, so duck-type instead.
	if (
		value !== null &&
		typeof value === "object" &&
		"classList" in value &&
		"style" in value
	) {
		return value as HTMLElement;
	}
	return null;
}

export function getTabHeaderEl(leaf: WorkspaceLeaf): HTMLElement | null {
	return asElement((leaf as unknown as { tabHeaderEl?: unknown }).tabHeaderEl);
}

export function getMenuItemEl(item: MenuItem): HTMLElement | null {
	return asElement((item as unknown as { dom?: unknown }).dom);
}

export function normalizeHexColor(value: string): string | null {
	const raw = value.trim().replace(/^#/, "");
	if (/^[0-9a-fA-F]{3}$/.test(raw)) {
		const expanded = raw
			.split("")
			.map((digit) => digit + digit)
			.join("");
		return ("#" + expanded).toLowerCase();
	}
	if (/^[0-9a-fA-F]{6}$/.test(raw)) {
		return ("#" + raw).toLowerCase();
	}
	return null;
}

export const DARK_INK = "rgba(0, 0, 0, 0.85)";
export const LIGHT_INK = "rgba(255, 255, 255, 0.92)";

/** Pick a text color with enough contrast against the given background. */
export function readableInk(backgroundColor: string): string {
	const hex = normalizeHexColor(backgroundColor);
	if (hex === null) return "var(--text-normal)";
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.55 ? DARK_INK : LIGHT_INK;
}
