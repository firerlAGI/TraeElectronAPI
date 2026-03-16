const fs = require("node:fs");
const path = require("node:path");
const { buildOpenApiDocument, buildOpenApiYaml } = require("../src/http/openapi");

const docsDir = path.join(__dirname, "..", "docs");
const jsonPath = path.join(docsDir, "openapi.json");
const yamlPath = path.join(docsDir, "openapi.yaml");

const document = buildOpenApiDocument();
const yaml = buildOpenApiYaml();

fs.mkdirSync(docsDir, { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
fs.writeFileSync(yamlPath, yaml, "utf8");

console.log(
  JSON.stringify(
    {
      message: "OpenAPI files exported",
      files: [jsonPath, yamlPath]
    },
    null,
    2
  )
);
