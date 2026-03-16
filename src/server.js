const { loadEnvFiles } = require("./config/env");
const { createGatewayServer, startGatewayServer } = require("./http/gateway");

loadEnvFiles();

if (require.main === module) {
  startGatewayServer();
}

module.exports = {
  createGatewayServer,
  startGatewayServer
};
