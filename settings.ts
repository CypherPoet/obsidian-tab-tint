import {
	App,
	ColorComponent,
	PluginSettingTab,
	Setting,
	TextComponent,
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
		{ name: "Rose", color: "#ffb3ba" },
		{ name: "Peach", color: "#ffdfba" },
		{ name: "Mint", color: "#b5ead7" },
		{ name: "Sky", color: "#bae1ff" },
		{ name: "Lavender", color: "#e2baff" },
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
	const palette = DEFAULT_SETTINGS.palette.map((fallback, slot) => {
		const entry = savedPalette[slot];
		if (!entry) return { ...fallback };
		return {
			name: entry.name,
			color: normalizeHexColor(entry.color) ?? fallback.color,
		};
	});

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

export class TabTintSettingTab extends PluginSettingTab {
	plugin: TabTintPlugin;

	constructor(app: App, plugin: TabTintPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.plugin.settings.palette.forEach((_, slot) => {
			this.renderPaletteRow(containerEl, slot);
		});

		new Setting(containerEl)
			.setName("Auto-pin tinted tabs")
			.setDesc(
				"Pin a tab when you tint it and unpin it when you clear the tint."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoPinTintedTabs)
					.onChange(async (value) => {
						this.plugin.settings.autoPinTintedTabs = value;
						await this.plugin.saveSettings();
					});
			});

		let customInkPicker: ColorComponent | undefined;
		new Setting(containerEl)
			.setName("Tab text color")
			.setDesc(
				"Auto picks dark or light text per tint for contrast. Custom uses the color you choose."
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("auto", "Auto (contrast-based)")
					.addOption("dark", "Always dark")
					.addOption("light", "Always light")
					.addOption("custom", "Custom")
					.setValue(this.plugin.settings.inkMode)
					.onChange(async (value) => {
						this.plugin.settings.inkMode = value as TabTintInkMode;
						await this.plugin.saveSettings();
						this.plugin.applyAllTints();
						customInkPicker?.setDisabled(value !== "custom");
					});
			})
			.addColorPicker((picker) => {
				customInkPicker = picker;
				picker
					.setValue(this.plugin.settings.customInkColor)
					.setDisabled(this.plugin.settings.inkMode !== "custom")
					.onChange(async (value) => {
						this.plugin.settings.customInkColor = value;
						await this.plugin.saveSettings();
						this.plugin.applyAllTints();
					});
			});

		new Setting(containerEl)
			.setName("Reset palette")
			.setDesc("Restore the five default pastel colors and their names.")
			.addButton((button) => {
				// setWarning is deprecated in 1.13 (→ setDestructive), but the
				// registry's no-unsupported-api check statically flags any
				// reference to 1.13 APIs while minAppVersion is 1.12 — even
				// behind a runtime guard. See AGENTS.md.
				button
					.setButtonText("Reset")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.palette = DEFAULT_SETTINGS.palette.map(
							(entry) => ({ ...entry })
						);
						await this.plugin.saveSettings();
						this.plugin.applyAllTints();
						this.display();
					});
			});
	}

	private renderPaletteRow(containerEl: HTMLElement, slot: number) {
		const entry = this.plugin.settings.palette[slot];
		let hexText: TextComponent | undefined;
		let picker: ColorComponent | undefined;

		new Setting(containerEl)
			.setName(`Color ${slot + 1}`)
			.addText((text) => {
				text.setPlaceholder("Name")
					.setValue(entry.name)
					.onChange(async (value) => {
						entry.name = value;
						await this.plugin.saveSettings();
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
	}
}
