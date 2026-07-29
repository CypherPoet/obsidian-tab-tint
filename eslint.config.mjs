import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	// main.js is the esbuild bundle, never source.
	{ ignores: ["main.js", "node_modules/**"] },
	...obsidianmd.configs.recommended,
	{
		// Several recommended rules (no-unsupported-api among them) need type
		// information, which the parser only builds when pointed at the tsconfig.
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
