const test = require("node:test");
const assert = require("node:assert/strict");
const plugin = require("./index");

test("plugin registers status and delegate tools", () => {
  const registrations = [];
  plugin.register({
    config: {
      plugins: {
        entries: {
          "trae-ide": {
            config: {
              baseUrl: "http://127.0.0.1:8787"
            }
          }
        }
      }
    },
    registerTool(spec, options = {}) {
      registrations.push({
        spec,
        options
      });
    }
  });

  assert.equal(registrations.length, 2);
  assert.equal(registrations[0].spec.name, "trae_status");
  assert.equal(registrations[1].spec.name, "trae_delegate");
  assert.equal(registrations[1].options.optional, true);
});
