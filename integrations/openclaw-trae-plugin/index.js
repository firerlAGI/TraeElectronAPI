const {
  PLUGIN_ID,
  createTraeApiClient,
  formatDelegateToolResult,
  formatStatusToolResult,
  resolvePluginRuntimeConfig
} = require("./lib/traeapi-client");

function buildToolContent(text) {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

function register(api) {
  const getClient = () => createTraeApiClient(resolvePluginRuntimeConfig(api));

  api.registerTool({
    name: "trae_status",
    description: "Check whether the local TraeAPI bridge is reachable and whether Trae automation is ready.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        allowAutoStart: {
          type: "boolean",
          default: false
        }
      }
    },
    async execute(_id, params = {}) {
      const client = getClient();
      const status = await client.getStatus({
        allowAutoStart: params.allowAutoStart === true
      });
      return buildToolContent(formatStatusToolResult(status));
    }
  });

  api.registerTool(
    {
      name: "trae_delegate",
      description:
        "Delegate an IDE task to the local Trae desktop app through TraeAPI. Use this when you want Trae itself to inspect or modify the open project.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          task: {
            type: "string",
            minLength: 1
          },
          sessionId: {
            type: "string"
          },
          allowAutoStart: {
            type: "boolean",
            default: true
          }
        },
        required: ["task"]
      },
      async execute(_id, params = {}) {
        const client = getClient();
        const result = await client.delegateTask({
          task: params.task,
          sessionId: params.sessionId,
          allowAutoStart: params.allowAutoStart !== false
        });
        return buildToolContent(formatDelegateToolResult(result));
      }
    },
    {
      optional: true
    }
  );
}

module.exports = {
  id: PLUGIN_ID,
  name: "Trae IDE",
  register
};
module.exports.default = module.exports;
