# Tab Tint — Maintainer Notes

## Private-API dependency (the load-bearing caveat)

Obsidian exposes no public API for a tab's header element or a menu item's root element. Tab Tint reads two undocumented internals:

- `WorkspaceLeaf.tabHeaderEl` — the tab header DOM node that tints are painted on
- `MenuItem.dom` — the menu item root that context-menu swatches are appended to

**Rules:**

- Every read of these internals lives in `tabColors.ts`, behind duck-typed, null-returning accessors. Never access them from anywhere else — if new code needs a private field, add an accessor there.
- The accessors duck-type instead of using `instanceof HTMLElement`, because `instanceof` fails across popout windows. Keep it that way.
- The designed failure mode is a silent no-op: if an Obsidian update renames these fields, tints stop applying but nothing crashes. When a release of Obsidian "breaks" tinting, check `tabColors.ts` first — the fix is almost certainly renaming a field there.

## Compatibility floor

`minAppVersion` is 1.12.0, tracking the latest *public* Obsidian release — the 1.13 APIs the registry review recommends exist only in early-access builds. Two review recommendations are deliberate casualties of that floor; resolve them only when 1.13 is generally available and the floor moves:

- `PluginSettingTab.display()` → `getSettingDefinitions()` (new in 1.13)
- `ButtonComponent.setWarning()` → `setDestructive()` (new in 1.13)

Do not try to bridge these with runtime feature-detection: the registry's `no-unsupported-api` review rule **statically** flags any reference to an API newer than `minAppVersion`, even behind a `typeof` guard, and fails the review with a blocking error (learned the hard way at 1.0.2). The deprecated calls stay until the floor moves.

## Releasing

Tag must exactly equal `manifest.json`'s `version` — no `v` prefix (Obsidian requires the exact match). `npm version patch|minor|major` bumps `manifest.json` and `versions.json` together (via `version-bump.mjs`), then `git push && git push --tags`. CI builds from the tag and creates a draft release with `main.js`, `manifest.json`, and `styles.css` attached; review and publish it.
