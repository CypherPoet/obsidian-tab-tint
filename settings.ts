import {
	App,
	ColorComponent,
	PluginSettingTab,
	Setting,
	TextComponent,
	type SettingDefinitionItem,
} from "obsidian";
import type TabTintPlugin from "./main";
import { normalizeHexColor } from "./tabColors";

export interface PaletteEntry {
	name: string;
	color: string;
}

export type TabTintInkMode = "auto" | "dark" | "light" | "custom";

export interface TabTintSettings {
	palette: PaletteEntry[];
	/** Maps file path → palette slot index. */
	fileTints: Record<string, number>;
	autoPinTintedTabs: boolean;
	inkMode: TabTintInkMode;
	customInkColor: string;
}

export const DEFAULT_SETTINGS: TabTintSettings = {
	palette: [
		{ name: "Berry", color: "#f53d7d" },
		{ name: "Peach", color: "#eea34f" },
		{ name: "Mint", color: "#73e8bd" },
		{ name: "Sky", color: "#7fbff0" },
		{ name: "Lavender", color: "#ba74ec" },
	],
	fileTints: {},
	autoPinTintedTabs: true,
	inkMode: "auto",
	customInkColor: "#222222",
};

export function slotDisplayName(entry: PaletteEntry, slot: number): string {
	return entry.name.trim() || `Color ${slot + 1}`;
}

function isPaletteEntry(value: unknown): value is PaletteEntry {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof (value as PaletteEntry).name === "string" &&
		typeof (value as PaletteEntry).color === "string"
	);
}

export function resolveSettings(raw: unknown): TabTintSettings {
	const saved = (raw ?? {}) as Partial<TabTintSettings>;

	const savedPalette = Array.isArray(saved.palette)
		? saved.palette.filter(isPaletteEntry)
		: [];
	// An entry with an unparseable color keeps its slot (with a fallback color)
	// instead of being dropped — dropping would shift every higher fileTints
	// index and silently recolor tabs.
	const palette: PaletteEntry[] =
		savedPalette.length > 0
			? savedPalette.map((entry, slot) => ({
					name: entry.name,
					color:
						normalizeHexColor(entry.color) ??
						DEFAULT_SETTINGS.palette[
							slot % DEFAULT_SETTINGS.palette.length
						].color,
				}))
			: DEFAULT_SETTINGS.palette.map((entry) => ({ ...entry }));

	const fileTints: Record<string, number> = {};
	if (saved.fileTints !== null && typeof saved.fileTints === "object") {
		for (const [path, slot] of Object.entries(saved.fileTints ?? {})) {
			if (
				typeof slot === "number" &&
				Number.isInteger(slot) &&
				slot >= 0 &&
				slot < palette.length
			) {
				fileTints[path] = slot;
			}
		}
	}

	const inkMode: TabTintInkMode =
		saved.inkMode === "dark" ||
		saved.inkMode === "light" ||
		saved.inkMode === "custom"
			? saved.inkMode
			: "auto";

	return {
		palette,
		fileTints,
		autoPinTintedTabs:
			typeof saved.autoPinTintedTabs === "boolean"
				? saved.autoPinTintedTabs
				: DEFAULT_SETTINGS.autoPinTintedTabs,
		inkMode,
		customInkColor:
			normalizeHexColor(saved.customInkColor ?? "") ??
			DEFAULT_SETTINGS.customInkColor,
	};
}

/** Settings bound to declarative controls, resolved via get/setControlValue. */
type ControlKey = "autoPinTintedTabs" | "inkMode" | "customInkColor";

export class TabTintSettingTab extends PluginSettingTab {
	plugin: TabTintPlugin;

	constructor(app: App, plugin: TabTintPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem<ControlKey>[] {
		const { palette } = this.plugin.settings;

		return [
			{
				type: "list",
				heading: "Palette",
				items: palette.map((entry, slot) => ({
					name: `Color ${slot + 1}`,
					// The user's own name for the slot is what they'd search for.
					aliases: entry.name.trim() ? [entry.name.trim()] : undefined,
					render: (setting: Setting) =>
						this.renderPaletteRow(setting, slot),
				})),
				// Dropped at one color rather than shown-but-refusing: the
				// palette needs a slot for fileTints indices to mean anything.
				onDelete:
					palette.length > 1
						? (index: number) => void this.removeColor(index)
						: undefined,
				addItem: {
					name: "Add color",
					action: () => void this.addColor(),
				},
			},
			{
				name: "Auto-pin tinted tabs",
				desc: "Pin a tab when you tint it and unpin it when you clear the tint.",
				control: { type: "toggle", key: "autoPinTintedTabs" },
			},
			{
				name: "Tab text color",
				desc: "Auto picks dark or light text per tint for contrast.",
				control: {
					type: "dropdown",
					key: "inkMode",
					options: {
						auto: "Auto (contrast-based)",
						dark: "Always dark",
						light: "Always light",
						custom: "Custom",
					},
				},
			},
			{
				name: "Custom text color",
				desc: "Used when tab text color is set to custom.",
				control: {
					type: "color",
					key: "customInkColor",
					disabled: () => this.plugin.settings.inkMode !== "custom",
				},
			},
			{
				name: "Reset palette",
				desc: "Restore the five default colors and their names.",
				render: (setting: Setting) => {
					setting.addButton((button) => {
						button
							.setButtonText("Reset")
							.setDestructive()
							.onClick(() => void this.resetPalette());
					});
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		const { settings } = this.plugin;
		switch (key) {
			case "autoPinTintedTabs":
				return settings.autoPinTintedTabs;
			case "inkMode":
				return settings.inkMode;
			case "customInkColor":
				return settings.customInkColor;
			default:
				return undefined;
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const { settings } = this.plugin;
		switch (key) {
			case "autoPinTintedTabs":
				settings.autoPinTintedTabs = value as boolean;
				await this.plugin.saveSettings();
				return;
			case "inkMode":
				settings.inkMode = value as TabTintInkMode;
				await this.plugin.saveSettings();
				this.plugin.applyAllTints();
				// The custom-color row's `disabled` predicate reads inkMode.
				this.refreshDomState();
				return;
			case "customInkColor":
				settings.customInkColor = value as string;
				await this.plugin.saveSettings();
				this.plugin.applyAllTints();
				return;
		}
	}

	// Palette edits change how many rows exist, so they need update() (a full
	// re-render) rather than refreshDomState().

	private async addColor() {
		await this.plugin.addPaletteColor();
		this.update();
	}

	private async removeColor(slot: number) {
		await this.plugin.removePaletteColor(slot);
		this.update();
	}

	private async resetPalette() {
		await this.plugin.resetPalette();
		this.update();
	}

	private renderPaletteRow(setting: Setting, slot: number) {
		const entry = this.plugin.settings.palette[slot];
		let hexText: TextComponent | undefined;
		let picker: ColorComponent | undefined;

		setting
			.setName(`Color ${slot + 1}`)
			.addText((text) => {
				text.setPlaceholder("Name")
					.setValue(entry.name)
					.onChange(async (value) => {
						entry.name = value;
						await this.plugin.saveSettings();
						this.plugin.refreshTintCommands();
					});
				text.inputEl.addClass("tab-tint-name-input");
				text.inputEl.setAttribute(
					"aria-label",
					`Name for color ${slot + 1}`
				);
			})
			.addText((text) => {
				hexText = text;
				text.setPlaceholder("#rrggbb")
					.setValue(entry.color)
					.onChange(async (value) => {
						const normalized = normalizeHexColor(value);
						text.inputEl.toggleClass(
							"tab-tint-invalid",
							normalized === null
						);
						if (normalized === null) return;
						entry.color = normalized;
						await this.plugin.saveSettings();
						this.plugin.applyAllTints();
						picker?.setValue(normalized);
					});
				text.inputEl.addClass("tab-tint-hex-input");
				text.inputEl.setAttribute(
					"aria-label",
					`Hex code for color ${slot + 1}`
				);
			})
			.addColorPicker((colorPicker) => {
				picker = colorPicker;
				colorPicker.setValue(entry.color).onChange(async (value) => {
					entry.color = value;
					await this.plugin.saveSettings();
					this.plugin.applyAllTints();
					hexText?.setValue(value);
					hexText?.inputEl.removeClass("tab-tint-invalid");
				});
			});
		// The row's delete affordance comes from the list's onDelete.
	}
}
