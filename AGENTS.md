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

Releases are cut automatically from `main`: when a merge changes `manifest.json`'s `version`, the `Release` workflow builds the plugin and creates a **draft** GitHub release — tagged with that exact version, no `v` prefix (Obsidian requires the exact match) — with `main.js`, `manifest.json`, and `styles.css` attached. Review and publish the draft.

So every code change ships by bumping the version **in its PR**:

- Run `npm version patch|minor|major --no-git-tag-version` — updates `manifest.json` and `versions.json` together (via `version-bump.mjs`) without committing or tagging — then commit those files as part of the PR.
- The `Version check` workflow **fails any PR** that touches plugin code (`*.ts`, `styles.css`) without a `manifest.json` version bump, so a shippable change can't merge without queuing a release.
- On merge, the tag and draft release are created for you — there is no manual `git push --tags` step.

`.npmrc` pins `tag-version-prefix=""` so a local `npm version` (should you ever tag by hand) produces the bare tag Obsidian needs, not npm's default `v`-prefixed one.
