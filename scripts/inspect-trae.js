const { createTraeAutomationDriver } = require("../src/cdp/dom-driver");
const { loadEnvFiles } = require("../src/config/env");

loadEnvFiles();

async function main() {
  const driver = createTraeAutomationDriver();
  const diagnostics = await driver.getDiagnostics();
  console.log(JSON.stringify(diagnostics, null, 2));
  if (!diagnostics.ready) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        code: error.code || "TRAE_INSPECT_FAILED",
        message: error.message,
        details: error.details || {}
      },
      null,
      2
    )
  );
  process.exit(1);
});
