const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { mkdtempSync, rmSync, writeFileSync } = fs;
const { loadEnvFiles, parseEnvText, readEnvFile, updateEnvFile } = require("./env");

test("parseEnvText supports comments and quoted values", () => {
  const values = parseEnvText(`
# comment
TRAE_BIN="C:\\\\Program Files\\\\Trae\\\\Trae.exe"
TRAE_PROJECT_PATH='E:\\project path'
TRAE_ARGS=
`);

  assert.equal(values.TRAE_BIN, "C:\\Program Files\\Trae\\Trae.exe");
  assert.equal(values.TRAE_PROJECT_PATH, "E:\\project path");
  assert.equal(values.TRAE_ARGS, "");
});

test("loadEnvFiles and updateEnvFile merge .env values predictably", () => {
  const tempRoot = path.join(process.cwd(), ".runtime");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = mkdtempSync(path.join(tempRoot, "env-test-"));
  const envPath = path.join(tempDir, ".env");
  const envLocalPath = path.join(tempDir, ".env.local");

  try {
    writeFileSync(envPath, "PORT=8787\nTRAE_BIN=C:\\Trae\\Trae.exe\n", "utf8");
    writeFileSync(envLocalPath, "PORT=8788\n", "utf8");

    updateEnvFile(envPath, {
      TRAE_PROJECT_PATH: "E:\\demo project",
      PORT: "9000"
    });

    const envFile = readEnvFile(envPath);
    assert.equal(envFile.values.PORT, "9000");
    assert.equal(envFile.values.TRAE_PROJECT_PATH, "E:\\demo project");

    const loaded = loadEnvFiles({
      cwd: tempDir,
      override: true
    });
    assert.equal(loaded.values.PORT, "8788");
    assert.equal(process.env.PORT, "8788");
    assert.equal(process.env.TRAE_BIN, "C:\\Trae\\Trae.exe");
    assert.equal(process.env.TRAE_PROJECT_PATH, "E:\\demo project");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadEnvFiles preserves existing process env values unless override is enabled", () => {
  const tempRoot = path.join(process.cwd(), ".runtime");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = mkdtempSync(path.join(tempRoot, "env-test-"));
  const envPath = path.join(tempDir, ".env");
  const previousPort = process.env.PORT;

  try {
    writeFileSync(envPath, "PORT=8787\n", "utf8");
    process.env.PORT = "8793";

    loadEnvFiles({
      cwd: tempDir
    });

    assert.equal(process.env.PORT, "8793");
  } finally {
    if (previousPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = previousPort;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});
