#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const pluginDir = path.resolve(__dirname, "..", "integrations", "openclaw-trae-plugin");
  const packageJsonPath = path.join(pluginDir, "package.json");
  const pluginManifestPath = path.join(pluginDir, "openclaw.plugin.json");
  const packageJson = readJson(packageJsonPath);
  const pluginManifest = readJson(pluginManifestPath);

  assertCondition(typeof packageJson.name === "string" && packageJson.name.trim(), "Plugin package.json must define a package name.");
  assertCondition(packageJson.private !== true, "Plugin package.json must not remain private for npm publishing.");
  assertCondition(packageJson.version === pluginManifest.version, "Plugin package version must match openclaw.plugin.json version.");
  assertCondition(pluginManifest.id === "trae-ide", "OpenClaw plugin id must remain trae-ide.");
  assertCondition(Array.isArray(packageJson.openclaw?.extensions), "Plugin package.json must define openclaw.extensions.");
  assertCondition(packageJson.openclaw.extensions.includes("./index.js"), "Plugin package.json must expose ./index.js as an OpenClaw extension.");
  assertCondition(typeof packageJson.scripts?.["sync:runtime"] === "string", "Plugin package.json must define scripts.sync:runtime.");
  assertCondition(typeof packageJson.scripts?.prepack === "string", "Plugin package.json must define a prepack script.");
  assertCondition(Array.isArray(packageJson.files) && packageJson.files.includes("runtime"), "Plugin package.json must publish the bundled runtime directory.");

  const requiredFiles = ["index.js", "openclaw.plugin.json", "README.md"];
  for (const relativePath of requiredFiles) {
    assertCondition(fs.existsSync(path.join(pluginDir, relativePath)), `Missing required plugin file: ${relativePath}`);
  }

  process.stdout.write(
    [
      "OpenClaw plugin release check passed.",
      `- npm package: ${packageJson.name}`,
      `- version: ${packageJson.version}`,
      `- plugin id: ${pluginManifest.id}`,
      `- plugin dir: ${pluginDir}`
    ].join("\n") + "\n"
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`[release-check] ${error.message}\n`);
  process.exit(1);
}
