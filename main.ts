import {
	FileView,
	Menu,
	Notice,
	Plugin,
	TAbstractFile,
	TFolder,
	WorkspaceLeaf,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	PaletteEntry,
	TabTintSettings,
	TabTintSettingTab,
	resolveSettings,
	slotDisplayName,
} from "./settings";
import {
	DARK_INK,
	LIGHT_INK,
	getMenuItemEl,
	getTabHeaderEl,
	readableInk,
} from "./tabColors";

const TINTED_CLASS = "tab-tint-tinted";

export default class TabTintPlugin extends Plugin {
	settings!: TabTintSettings;

	async onload() {
		this.settings = resolveSettings(await this.loadData());
		this.addSettingTab(new TabTintSettingTab(this.app, this));
		this.registerCommands();

		// Append tint options to the native tab-header context menu.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, _file, source, leaf) => {
				if (source !== "tab-header" || !leaf) return;
				this.addTintMenuItems(menu, leaf);
			})
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.applyAllTints())
		);

		// Cheaper than a full sweep: only the leaf that changed needs refreshing.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf) this.refreshLeaf(leaf);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.migrateTints(file, oldPath);
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.forgetTintsUnder(file.path)) {
					void this.saveSettings();
				}
			})
		);

		this.app.workspace.onLayoutReady(() => this.applyAllTints());
	}

	onunload() {
		// Leave the workspace as if the plugin were never here.
		this.app.workspace.iterateAllLeaves((leaf) => {
			const header = getTabHeaderEl(leaf);
			if (!header?.classList.contains(TINTED_CLASS)) return;
			this.clearLeafPaint(leaf);
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ── Commands ──────────────────────────────────────────────────────────────

	private tintCommandCount = 0;

	private registerCommands() {
		this.registerTintCommands();

		this.addCommand({
			id: "clear-tint",
			name: "Clear tint",
			checkCallback: (checking) => {
				const leaf = this.app.workspace.getMostRecentLeaf();
				if (!leaf) return false;
				const path = this.getTintablePath(leaf);
				if (path === null || this.settings.fileTints[path] === undefined) {
					return false;
				}
				if (!checking) this.clearTint(leaf);
				return true;
			},
		});

		this.addCommand({
			id: "clear-all-tints",
			name: "Clear all tints",
			callback: () => this.clearAllTints(),
		});

		this.addCommand({
			id: "merge-duplicate-tabs",
			name: "Merge duplicate tabs",
			callback: () => this.mergeDuplicateTabs(),
		});
	}

	private registerTintCommands() {
		this.settings.palette.forEach((entry, slot) => {
			this.addCommand({
				id: `apply-tint-${slot + 1}`,
				name: `Apply tint ${slot + 1}: ${slotDisplayName(entry, slot)}`,
				checkCallback: (checking) => {
					const leaf = this.app.workspace.getMostRecentLeaf();
					if (!leaf || this.getTintablePath(leaf) === null) return false;
					if (!checking) this.setTint(leaf, slot);
					return true;
				},
			});
		});
		this.tintCommandCount = this.settings.palette.length;
	}

	/** Re-derive the apply-tint commands after the palette changes size or names. */
	refreshTintCommands() {
		for (let slot = 0; slot < this.tintCommandCount; slot++) {
			this.removeCommand(`apply-tint-${slot + 1}`);
		}
		this.registerTintCommands();
	}

	// ── Context menu ──────────────────────────────────────────────────────────

	private addTintMenuItems(menu: Menu, leaf: WorkspaceLeaf) {
		const path = this.getTintablePath(leaf);
		if (path === null) return;

		menu.addSeparator();

		this.settings.palette.forEach((entry, slot) => {
			menu.addItem((item) => {
				item.setTitle(slotDisplayName(entry, slot));
				item.onClick(() => this.setTint(leaf, slot));

				const itemEl = getMenuItemEl(item);
				if (itemEl) {
					const swatch = itemEl.createSpan({ cls: "tab-tint-swatch" });
					swatch.style.setProperty("--tab-tint-swatch-color", entry.color);
				}
			});
		});

		if (this.settings.fileTints[path] !== undefined) {
			menu.addItem((item) => {
				item.setTitle("Clear tint");
				item.setIcon("x");
				item.onClick(() => this.clearTint(leaf));
			});
		}
	}

	// ── Tint application ──────────────────────────────────────────────────────

	setTint(leaf: WorkspaceLeaf, slot: number) {
		const path = this.getTintablePath(leaf);
		if (path === null || slot < 0 || slot >= this.settings.palette.length) {
			return;
		}
		this.settings.fileTints[path] = slot;
		void this.saveSettings();
		this.refreshLeavesForPath(path);
		if (this.settings.autoPinTintedTabs) leaf.setPinned(true);
	}

	clearTint(leaf: WorkspaceLeaf) {
		const path = this.getTintablePath(leaf);
		if (path === null) return;
		delete this.settings.fileTints[path];
		void this.saveSettings();
		this.refreshLeavesForPath(path);
		if (this.settings.autoPinTintedTabs) leaf.setPinned(false);
	}

	clearAllTints() {
		const tintedPaths = new Set(Object.keys(this.settings.fileTints));
		this.settings.fileTints = {};
		void this.saveSettings();
		this.app.workspace.iterateAllLeaves((leaf) => {
			const path = this.getTintablePath(leaf);
			if (path === null || !tintedPaths.has(path)) return;
			this.clearLeafPaint(leaf);
		});
	}

	applyAllTints() {
		this.app.workspace.iterateAllLeaves((leaf) => this.refreshLeaf(leaf));
	}

	// ── Palette editing ───────────────────────────────────────────────────────

	async addPaletteColor() {
		const { palette } = this.settings;
		// Seed the new slot by cycling the defaults instead of a flat gray.
		const template =
			DEFAULT_SETTINGS.palette[palette.length % DEFAULT_SETTINGS.palette.length];
		palette.push({ name: "", color: template.color });
		await this.saveSettings();
		this.refreshTintCommands();
	}

	async removePaletteColor(slot: number) {
		const { palette, fileTints } = this.settings;
		if (palette.length <= 1 || slot < 0 || slot >= palette.length) return;

		palette.splice(slot, 1);

		// Tabs on the removed slot lose their tint; higher slots shift down so
		// every other tab keeps the exact color it had.
		const clearedPaths = new Set<string>();
		for (const [path, s] of Object.entries(fileTints)) {
			if (s === slot) {
				delete fileTints[path];
				clearedPaths.add(path);
			} else if (s > slot) {
				fileTints[path] = s - 1;
			}
		}

		await this.saveSettings();
		this.refreshTintCommands();
		this.repaintAfterPaletteChange(clearedPaths);
	}

	async resetPalette() {
		this.settings.palette = DEFAULT_SETTINGS.palette.map((entry) => ({
			...entry,
		}));

		// The palette may have shrunk (user had more colors than the defaults).
		const clearedPaths = new Set<string>();
		for (const [path, slot] of Object.entries(this.settings.fileTints)) {
			if (slot >= this.settings.palette.length) {
				delete this.settings.fileTints[path];
				clearedPaths.add(path);
			}
		}

		await this.saveSettings();
		this.refreshTintCommands();
		this.repaintAfterPaletteChange(clearedPaths);
	}

	private repaintAfterPaletteChange(clearedPaths: Set<string>) {
		this.app.workspace.iterateAllLeaves((leaf) => {
			const path = this.getTintablePath(leaf);
			if (path !== null && clearedPaths.has(path)) {
				this.clearLeafPaint(leaf);
			} else {
				this.refreshLeaf(leaf);
			}
		});
	}

	private refreshLeaf(leaf: WorkspaceLeaf) {
		const path = this.getTintablePath(leaf);
		if (path === null) {
			// Sidebar and auxiliary views must never carry a leftover tint.
			const header = getTabHeaderEl(leaf);
			if (header?.classList.contains(TINTED_CLASS)) {
				this.paintHeader(leaf, null);
			}
			return;
		}
		const slot = this.settings.fileTints[path];
		const entry = slot !== undefined ? this.settings.palette[slot] : undefined;
		this.paintHeader(leaf, entry ?? null);
	}

	private refreshLeavesForPath(path: string) {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (this.getTintablePath(leaf) === path) this.refreshLeaf(leaf);
		});
	}

	private paintHeader(leaf: WorkspaceLeaf, entry: PaletteEntry | null) {
		const header = getTabHeaderEl(leaf);
		if (!header) return;

		if (entry) {
			header.style.setProperty("--tab-tint-color", entry.color);
			header.style.setProperty("--tab-tint-ink", this.resolveInk(entry.color));
			header.classList.add(TINTED_CLASS);
		} else {
			header.style.removeProperty("--tab-tint-color");
			header.style.removeProperty("--tab-tint-ink");
			header.classList.remove(TINTED_CLASS);
		}
	}

	/** Strip a leaf's tint paint, and unpin it when auto-pin is on. */
	private clearLeafPaint(leaf: WorkspaceLeaf) {
		this.paintHeader(leaf, null);
		if (this.settings.autoPinTintedTabs) leaf.setPinned(false);
	}

	private resolveInk(tintColor: string): string {
		switch (this.settings.inkMode) {
			case "dark":
				return DARK_INK;
			case "light":
				return LIGHT_INK;
			case "custom":
				return this.settings.customInkColor;
			default:
				return readableInk(tintColor);
		}
	}

	// ── Rename / delete bookkeeping ───────────────────────────────────────────

	private migrateTints(file: TAbstractFile, oldPath: string) {
		let changed = false;

		if (file instanceof TFolder) {
			const oldPrefix = oldPath + "/";
			for (const [path, slot] of Object.entries(this.settings.fileTints)) {
				if (!path.startsWith(oldPrefix)) continue;
				delete this.settings.fileTints[path];
				this.settings.fileTints[
					file.path + "/" + path.slice(oldPrefix.length)
				] = slot;
				changed = true;
			}
		} else {
			const slot = this.settings.fileTints[oldPath];
			if (slot !== undefined) {
				delete this.settings.fileTints[oldPath];
				this.settings.fileTints[file.path] = slot;
				changed = true;
			}
		}

		if (changed) {
			void this.saveSettings();
			this.applyAllTints();
		}
	}

	private forgetTintsUnder(path: string): boolean {
		let changed = false;
		const prefix = path + "/";
		for (const key of Object.keys(this.settings.fileTints)) {
			if (key === path || key.startsWith(prefix)) {
				delete this.settings.fileTints[key];
				changed = true;
			}
		}
		return changed;
	}

	// ── Duplicate-tab merging (explicit command, never automatic) ─────────────

	mergeDuplicateTabs() {
		const leavesByPath = new Map<string, WorkspaceLeaf[]>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			const path = this.getTintablePath(leaf);
			if (path === null) return;
			const group = leavesByPath.get(path);
			if (group) {
				group.push(leaf);
			} else {
				leavesByPath.set(path, [leaf]);
			}
		});

		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		let closed = 0;
		leavesByPath.forEach((leaves) => {
			if (leaves.length < 2) return;
			const keeper =
				activeLeaf && leaves.includes(activeLeaf) ? activeLeaf : leaves[0];
			for (const leaf of leaves) {
				if (leaf === keeper) continue;
				leaf.setPinned(false);
				leaf.detach();
				closed++;
			}
		});

		new Notice(
			closed > 0
				? `Closed ${closed} duplicate tab${closed === 1 ? "" : "s"}`
				: "No duplicate tabs found"
		);
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	/**
	 * The path of the file document shown in this leaf, or null when the leaf
	 * must not be tinted (sidebar views, graphs, empty tabs).
	 */
	private getTintablePath(leaf: WorkspaceLeaf): string | null {
		if (this.isSidebarLeaf(leaf)) return null;

		const view = leaf.view;
		if (view instanceof FileView) {
			return view.file?.path ?? null;
		}

		// Deferred (not-yet-loaded) tabs have no FileView, but their serialized
		// state still names the file, so startup tints reach background tabs.
		if (leaf.isDeferred) {
			const state = leaf.getViewState();
			if (state.type === "graph" || state.type === "localgraph") return null;
			const file = state.state?.file;
			if (typeof file === "string") return file;
		}

		return null;
	}

	private isSidebarLeaf(leaf: WorkspaceLeaf): boolean {
		const root: unknown = leaf.getRoot();
		const { leftSplit, rightSplit } = this.app.workspace;
		return root === (leftSplit as unknown) || root === (rightSplit as unknown);
	}
}
