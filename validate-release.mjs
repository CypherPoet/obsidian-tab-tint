import { readFileSync } from "node:fs";

function readJson(fileName) {
	return JSON.parse(readFileSync(fileName, "utf8"));
}

const manifest = readJson("manifest.json");
const packageMetadata = readJson("package.json");
const versions = readJson("versions.json");
const errors = [];

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
	errors.push(`manifest.json version must use x.y.z format, received ${manifest.version}.`);
}

if (!/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) {
	errors.push(
		`manifest.json minAppVersion must use x.y.z format, received ${manifest.minAppVersion}.`,
	);
}

if (manifest.version !== packageMetadata.version) {
	errors.push(
		`manifest.json is ${manifest.version} but package.json is ${packageMetadata.version}.`,
	);
}

if (versions[manifest.version] !== manifest.minAppVersion) {
	errors.push(
		`versions.json must map ${manifest.version} to ${manifest.minAppVersion}.`,
	);
}

if (errors.length > 0) {
	for (const error of errors) {
		console.error(error);
	}
	process.exitCode = 1;
} else {
	process.stdout.write(
		`Release metadata is consistent for ${manifest.version} (Obsidian ${manifest.minAppVersion}+).\n`,
	);
}
