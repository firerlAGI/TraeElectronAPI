const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { syncOpenClawPluginRuntime } = require("./sync-openclaw-plugin-runtime");

test("syncOpenClawPluginRuntime copies the bundled runtime payload", () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trae-runtime-sync-"));
  const pluginDir = path.join(repoRoot, "integrations", "openclaw-trae-plugin");
  fs.mkdirSync(path.join(repoRoot, "src", "config"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "scripts"), { recursive: true });
  fs.mkdirSync(pluginDir, { recursive: true });

  fs.writeFileSync(path.join(repoRoot, "package.json"), JSON.stringify({ name: "repo", version: "9.9.9" }), "utf8");
  fs.writeFileSync(
    path.join(pluginDir, "package.json"),
    JSON.stringify({ name: "traeelectronapi", version: "1.2.3", engines: { node: ">=22" } }),
    "utf8"
  );
  fs.writeFileSync(path.join(repoRoot, ".env.example"), "TRAE_BIN=\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "src", "config", "env.js"), "module.exports = {};\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "scripts", "quickstart.js"), "console.log('quickstart');\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "scripts", "start-trae.js"), "console.log('start-trae');\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "scripts", "start-gateway.js"), "console.log('start-gateway');\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "scripts", "inspect-trae.js"), "console.log('inspect-trae');\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "start-traeapi.command"), "#!/bin/bash\n", "utf8");
  fs.writeFileSync(path.join(repoRoot, "start-traeapi.cmd"), "@echo off\r\n", "utf8");

  try {
    const summary = syncOpenClawPluginRuntime({ repoRoot, pluginDir });
    assert.equal(summary.pluginPackage, "traeelectronapi");
    const runtimeRoot = path.join(pluginDir, "runtime", "traeapi");
    assert.equal(summary.runtimeRoot, runtimeRoot);
    assert.equal(fs.existsSync(path.join(runtimeRoot, "scripts", "quickstart.js")), true);
    assert.equal(fs.existsSync(path.join(runtimeRoot, "src", "config", "env.js")), true);
    assert.equal(fs.existsSync(path.join(runtimeRoot, "start-traeapi.sh")), true);

    const runtimePackageJson = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "package.json"), "utf8"));
    assert.equal(runtimePackageJson.version, "1.2.3");
    assert.equal(runtimePackageJson.scripts.quickstart, "node scripts/quickstart.js");

    const runtimeManifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "runtime-manifest.json"), "utf8"));
    assert.equal(runtimeManifest.pluginVersion, "1.2.3");
    assert.equal(runtimeManifest.sourceRepoVersion, "9.9.9");
  } finally {
    fs.rmSync(repoRoot, {
      recursive: true,
      force: true
    });
  }
});
