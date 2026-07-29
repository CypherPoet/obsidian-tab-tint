# Tab Tint — Maintainer Notes

## Private-API Dependency

Obsidian exposes no public API for a tab's header element or a menu item's root element, so Tab Tint reads two undocumented internals: `WorkspaceLeaf.tabHeaderEl` and `MenuItem.dom`.

- Keep every read of them in [tabColors.ts](tabColors.ts), behind duck-typed, null-returning accessors. If new code needs a private field, add an accessor there rather than reaching for it directly.
- Duck-type instead of `instanceof HTMLElement` — `instanceof` fails across popout windows.
- The designed failure mode is a silent no-op: if an Obsidian update renames these fields, tinting stops but nothing crashes. When an Obsidian release "breaks" tinting, check `tabColors.ts` first.

## Compatibility Floor

Never call an API newer than `minAppVersion`, even behind a `typeof` guard. The directory review's `no-unsupported-api` rule flags it **statically**, so a runtime feature-detect fails review instead of surviving it (learned at 1.0.2). Raise the floor first, or keep the older call and accept the deprecation warning.

## Building and Running

- NPM run scripts: [package.json](package.json).
- Run `npm run lint` before pushing — it is the same `eslint-plugin-obsidianmd` check the directory review runs. CI runs it with `npm run build` on every PR.

## Releasing

Bump the version in the PR itself: `npm version patch|minor|major --no-git-tag-version`, then commit `manifest.json` and `versions.json`. Merging to `main` tags the commit and drafts the GitHub release — review and publish that draft. CI fails any PR that changes plugin code without a bump.
