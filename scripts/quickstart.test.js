const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildTraeCandidates, resolveDefaultTraeUserDataDir } = require("./quickstart");

test("resolveDefaultTraeUserDataDir returns the macOS Trae profile path", () => {
  assert.equal(
    resolveDefaultTraeUserDataDir("darwin", { HOME: "/Users/example" }),
    path.join("/Users/example", "Library", "Application Support", "Trae")
  );
});

test("buildTraeCandidates includes macOS bundle and executable candidates", () => {
  const candidates = buildTraeCandidates("darwin", { HOME: "/Users/example", TRAE_BIN: "" });

  assert.equal(candidates.includes("/Applications/Trae.app/Contents/MacOS/Trae"), true);
  assert.equal(candidates.includes("/Applications/Trae.app"), true);
  assert.equal(
    candidates.includes(path.join("/Users/example", "Applications", "Trae.app", "Contents", "MacOS", "Trae")),
    true
  );
  assert.equal(candidates.includes(path.join("/Users/example", "Applications", "Trae.app")), true);
});