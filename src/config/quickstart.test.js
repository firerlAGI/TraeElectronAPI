const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  buildQuickstartRuntimePlan,
  parseArgList,
  upsertArgByPrefix
} = require("./quickstart");

test("parseArgList ignores empty values and trims whitespace", () => {
  assert.deepEqual(parseArgList(""), []);
  assert.deepEqual(parseArgList("  --foo=bar   --baz  "), ["--foo=bar", "--baz"]);
});

test("upsertArgByPrefix replaces existing matching args", () => {
  assert.deepEqual(
    upsertArgByPrefix(["--foo=1", "--user-data-dir=old", "--bar=2"], "--user-data-dir=", "--user-data-dir=new"),
    ["--foo=1", "--bar=2", "--user-data-dir=new"]
  );
});

test("buildQuickstartRuntimePlan keeps configured launch args and adds isolated fallback settings", () => {
  const plan = buildQuickstartRuntimePlan({
    rootDir: "E:\\tiy\\chajian2",
    traeBin: "D:\\trae\\Trae\\Trae.exe",
    projectPath: "E:\\tiy\\chajian2\\.runtime\\trae-project",
    traeArgs: "--flag=value",
    remoteDebuggingPort: 9222,
    traeStartTimeoutMs: 30000
  });

  assert.equal(plan.configured.debuggerPort, 9222);
  assert.equal(plan.configured.env.TRAE_ARGS, "--flag=value");
  assert.equal(plan.isolated.debuggerPort, 9333);
  assert.equal(
    plan.isolated.userDataDir,
    path.resolve("E:\\tiy\\chajian2", ".runtime", "trae-quickstart-profile")
  );
  assert.equal(
    plan.isolated.env.TRAE_ARGS,
    `--flag=value --user-data-dir=${path.resolve("E:\\tiy\\chajian2", ".runtime", "trae-quickstart-profile")}`
  );
});

test("buildQuickstartRuntimePlan moves the isolated fallback port away from the configured port", () => {
  const plan = buildQuickstartRuntimePlan({
    rootDir: "E:\\tiy\\chajian2",
    remoteDebuggingPort: 9333,
    quickstartRemoteDebuggingPort: 9333
  });

  assert.equal(plan.configured.debuggerPort, 9333);
  assert.equal(plan.isolated.debuggerPort, 9444);
});
