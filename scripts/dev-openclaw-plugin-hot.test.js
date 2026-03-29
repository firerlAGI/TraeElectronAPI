const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildHotReloadLayout, buildOpenClawDevConfig, syncHotPluginDirectory } = require("./dev-openclaw-plugin-hot");

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "traeapi-hot-plugin-"));
}

test("syncHotPluginDirectory creates an isolated hot plugin mirror and config", () => {
  const rootDir = createTempRoot();
  const sourcePluginDir = path.join(rootDir, "integrations", "openclaw-trae-plugin");
  fs.mkdirSync(sourcePluginDir, { recursive: true });
  fs.writeFileSync(path.join(sourcePluginDir, "index.js"), "module.exports = {};\n", "utf8");
  fs.writeFileSync(path.join(sourcePluginDir, "openclaw.plugin.json"), "{\"id\":\"traeclaw\"}\n", "utf8");
  fs.writeFileSync(path.join(rootDir, "start-traeapi.command"), "#!/bin/bash\n", "utf8");
  fs.writeFileSync(path.join(rootDir, "start-traeapi.cmd"), "@echo off\r\n", "utf8");

  const layout = buildHotReloadLayout({ rootDir });
  const summary = syncHotPluginDirectory({ layout, platform: "darwin" });

  assert.equal(summary.sourcePluginDir, sourcePluginDir);
  assert.notEqual(summary.sourcePluginDir, summary.hotPluginDir);
  assert.equal(fs.existsSync(path.join(summary.hotPluginDir, "index.js")), true);
  assert.equal(fs.existsSync(path.join(layout.hotRootDir, "README.dev-hot.txt")), true);
  assert.equal(fs.existsSync(path.join(summary.hotPluginDir, "HOT_PLUGIN_README.txt")), true);

  const generatedConfig = JSON.parse(fs.readFileSync(layout.generatedConfigPath, "utf8"));
  assert.equal(generatedConfig.plugins.load.paths[0], summary.hotPluginDir);
  assert.equal(generatedConfig.plugins.entries["traeclaw"].config.quickstartCwd, rootDir);
  assert.equal(
    generatedConfig.plugins.entries["traeclaw"].config.quickstartCommand,
    `"${path.join(rootDir, "start-traeapi.command")}"`
  );
});

test("buildOpenClawDevConfig keeps plugin mirror and dev repo root separated", () => {
  const layout = buildHotReloadLayout({
    rootDir: "/tmp/trae-dev",
    hotRootDir: "/tmp/trae-dev/.runtime/openclaw-plugin-hot"
  });

  const config = buildOpenClawDevConfig(layout, {
    platform: "darwin"
  });

  assert.equal(config.plugins.load.paths[0], "/tmp/trae-dev/.runtime/openclaw-plugin-hot/traeclaw");
  assert.equal(config.plugins.entries["traeclaw"].config.quickstartCwd, "/tmp/trae-dev");
  assert.equal(config.plugins.entries["traeclaw"].config.quickstartCommand, "\"/tmp/trae-dev/start-traeapi.command\"");
  assert.equal(config.agents.list[0].tools.alsoAllow.includes("trae_update_self"), true);
});
