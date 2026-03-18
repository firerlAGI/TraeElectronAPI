#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const RUNTIME_RELATIVE_PATH = path.join("runtime", "traeapi");
const RUNTIME_FILE_SPECS = [
  ".env.example",
  path.join("src"),
  path.join("scripts", "quickstart.js"),
  path.join("scripts", "start-trae.js"),
  path.join("scripts", "start-gateway.js"),
  path.join("scripts", "inspect-trae.js"),
  "start-traeapi.command",
  "start-traeapi.cmd"
];

function pathExists(targetPath) {
  return Boolean(targetPath) && fs.existsSync(targetPath);
}

function shouldIncludeRuntimePath(sourcePath) {
  return !String(sourcePath || "").endsWith(".test.js");
}

function copyEntry(repoRoot, targetRoot, relativePath) {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);
  if (!pathExists(sourcePath)) {
    throw new Error(`Runtime source entry not found: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const stats = fs.statSync(sourcePath);
  if (stats.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      force: true,
      filter: shouldIncludeRuntimePath
    });
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
}

function buildRuntimePackageJson(pluginPackageJson) {
  return {
    name: `${pluginPackageJson.name}-runtime`,
    version: pluginPackageJson.version,
    private: true,
    description: "Bundled TraeAPI runtime shipped inside the OpenClaw plugin package.",
    scripts: {
      quickstart: "node scripts/quickstart.js"
    },
    engines: {
      node: pluginPackageJson.engines?.node || ">=22"
    }
  };
}

function buildRuntimeStartScript() {
  return [
    "#!/bin/bash",
    "set -euo pipefail",
    "",
    'ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"',
    'cd "$ROOT_DIR"',
    "",
    "exec node scripts/quickstart.js"
  ].join("\n");
}

function syncOpenClawPluginRuntime(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const pluginDir = path.resolve(options.pluginDir || path.join(repoRoot, "integrations", "openclaw-trae-plugin"));
  const runtimeRoot = path.join(pluginDir, RUNTIME_RELATIVE_PATH);
  const pluginPackageJson = JSON.parse(fs.readFileSync(path.join(pluginDir, "package.json"), "utf8"));
  const repoPackageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

  fs.rmSync(runtimeRoot, {
    recursive: true,
    force: true
  });
  fs.mkdirSync(runtimeRoot, { recursive: true });

  for (const relativePath of RUNTIME_FILE_SPECS) {
    copyEntry(repoRoot, runtimeRoot, relativePath);
  }

  fs.writeFileSync(
    path.join(runtimeRoot, "package.json"),
    `${JSON.stringify(buildRuntimePackageJson(pluginPackageJson), null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(path.join(runtimeRoot, "start-traeapi.sh"), `${buildRuntimeStartScript()}\n`, "utf8");
  fs.chmodSync(path.join(runtimeRoot, "start-traeapi.sh"), 0o755);
  fs.chmodSync(path.join(runtimeRoot, "start-traeapi.command"), 0o755);
  fs.writeFileSync(
    path.join(runtimeRoot, "runtime-manifest.json"),
    `${JSON.stringify(
      {
        pluginPackage: pluginPackageJson.name,
        pluginVersion: pluginPackageJson.version,
        sourceRepoPackage: repoPackageJson.name,
        sourceRepoVersion: repoPackageJson.version,
        syncedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return {
    pluginDir,
    runtimeRoot,
    pluginPackage: pluginPackageJson.name,
    pluginVersion: pluginPackageJson.version
  };
}

function formatSummary(summary) {
  return [
    "OpenClaw plugin runtime sync completed.",
    `- Plugin dir: ${summary.pluginDir}`,
    `- Runtime dir: ${summary.runtimeRoot}`,
    `- Package: ${summary.pluginPackage}@${summary.pluginVersion}`
  ].join("\n");
}

if (require.main === module) {
  try {
    const summary = syncOpenClawPluginRuntime();
    process.stdout.write(`${formatSummary(summary)}\n`);
  } catch (error) {
    process.stderr.write(`[sync-openclaw-plugin-runtime] ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  RUNTIME_RELATIVE_PATH,
  syncOpenClawPluginRuntime,
  formatSummary
};
