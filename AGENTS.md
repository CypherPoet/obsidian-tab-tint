# Tab Tint — Maintainer Notes

## Private-API Dependency

Obsidian exposes no public API for a tab's header element or a menu item's root element, so Tab Tint reads two undocumented internals: `WorkspaceLeaf.tabHeaderEl` and `MenuItem.dom`.

- Keep every read of them in [tabColors.ts](tabColors.ts), behind duck-typed, null-returning accessors.
- Duck-type instead of `instanceof HTMLElement` — `instanceof` fails across popout windows.
- The accessors return null rather than throwing, so a renamed field stops tinting without crashing. When an Obsidian release "breaks" tinting, check [tabColors.ts](tabColors.ts) first.

## Compatibility Floor

Never call an API newer than `minAppVersion`, even behind a `typeof` guard: `no-unsupported-api` flags it **statically**, so a runtime feature-detect fails review instead of surviving it (learned at 1.0.2).

## Building and Running

- NPM run scripts: [package.json](package.json).
- `npm run lint` is the same `eslint-plugin-obsidianmd` check the directory review runs. CI pairs it with `npm run build` on every PR.

## Releasing

Bump the version in the PR itself: `npm version patch|minor|major --no-git-tag-version`, then commit `manifest.json` and `versions.json`. Merging to `main` tags the commit and drafts the GitHub release — review and publish that draft. CI fails any PR that changes plugin code without a bump.
