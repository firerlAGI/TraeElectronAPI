const test = require("node:test");
const assert = require("node:assert/strict");
const plugin = require("./index");

test("plugin registers status, self-update, new chat, open project, mode switch, delegate tools, and the trae slash command", () => {
  const registrations = [];
  const commands = [];
  plugin.register({
    config: {
      plugins: {
        entries: {
          "traeclaw": {
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
    },
    registerCommand(spec) {
      commands.push(spec);
    }
  });

  assert.equal(registrations.length, 6);
  assert.equal(registrations[0].spec.name, "trae_status");
  assert.equal(registrations[1].spec.name, "trae_update_self");
  assert.equal(registrations[2].spec.name, "trae_new_chat");
  assert.equal(registrations[3].spec.name, "trae_open_project");
  assert.equal(registrations[4].spec.name, "trae_switch_mode");
  assert.deepEqual(registrations[4].spec.parameters.properties.mode.enum, ["solo", "ide"]);
  assert.equal(registrations[5].spec.name, "trae_delegate");
  assert.equal(registrations[5].spec.parameters.properties.projectPath.type, "string");
  assert.equal(registrations[5].options.optional, true);
  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, "trae");
  assert.equal(commands[0].acceptsArgs, true);
});

test("parseTraeSlashArgs defaults to final reply mode", () => {
  assert.deepEqual(plugin.parseTraeSlashArgs("fix the mac startup flow"), {
    task: "fix the mac startup flow",
    includeProcessText: false
  });
});

test("parseTraeSlashArgs enables process mode with the process subcommand", () => {
  assert.deepEqual(plugin.parseTraeSlashArgs("process inspect the current repository"), {
    task: "inspect the current repository",
    includeProcessText: true
  });
  assert.deepEqual(plugin.parseTraeSlashArgs("--process inspect the current repository"), {
    task: "inspect the current repository",
    includeProcessText: true
  });
});

test("buildTraeSlashUsage documents the process subcommand", () => {
  const usage = plugin.buildTraeSlashUsage();
  assert.equal(usage.includes("/Trae <task>"), true);
  assert.equal(usage.includes("/Trae process <task>"), true);
});
