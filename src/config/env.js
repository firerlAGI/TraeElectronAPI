const fs = require("node:fs");
const path = require("node:path");

function parseEnvText(text) {
  const entries = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    let value = rawLine.slice(separatorIndex + 1).trim();
    if (!value) {
      entries[key] = "";
      continue;
    }

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0];
      if (quote === '"') {
        try {
          value = JSON.parse(value);
        } catch (error) {
          value = value.slice(1, -1);
        }
      } else {
        value = value.slice(1, -1);
      }
    }

    entries[key] = value;
  }
  return entries;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      values: {}
    };
  }

  const text = fs.readFileSync(filePath, "utf8");
  return {
    filePath,
    exists: true,
    text,
    values: parseEnvText(text)
  };
}

function loadEnvFiles(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const files = Array.isArray(options.files)
    ? options.files.map((filePath) => path.resolve(cwd, filePath))
    : [path.join(cwd, ".env"), path.join(cwd, ".env.local")];
  const override = options.override === true;
  const loadedFiles = [];
  const values = {};

  for (const filePath of files) {
    const envFile = readEnvFile(filePath);
    if (!envFile.exists) {
      continue;
    }
    loadedFiles.push(filePath);
    for (const [key, value] of Object.entries(envFile.values)) {
      values[key] = value;
      if (override || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  return {
    cwd,
    files,
    loadedFiles,
    values
  };
}

function formatEnvValue(value) {
  const stringValue = String(value ?? "");
  if (!stringValue) {
    return "";
  }
  if (/[\s#]/.test(stringValue)) {
    return JSON.stringify(stringValue);
  }
  return stringValue;
}

function updateEnvFile(filePath, updates = {}) {
  const resolvedPath = path.resolve(filePath);
  const originalText = fs.existsSync(resolvedPath) ? fs.readFileSync(resolvedPath, "utf8") : "";
  const lines = originalText ? originalText.split(/\r?\n/) : [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }
    const serializedValue = formatEnvValue(value);
    const lineValue = `${key}=${serializedValue}`;
    const lineIndex = lines.findIndex((line) => new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`).test(line));
    if (lineIndex >= 0) {
      lines[lineIndex] = lineValue;
    } else {
      lines.push(lineValue);
    }
  }

  const normalizedText = `${lines.filter((line, index, source) => !(index === source.length - 1 && line === "")).join("\n")}\n`;
  fs.writeFileSync(resolvedPath, normalizedText, "utf8");
}

module.exports = {
  loadEnvFiles,
  parseEnvText,
  readEnvFile,
  updateEnvFile
};
