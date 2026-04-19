// ================================================================
//  permissions index
// ================================================================
// This file serves as the main entry point for the permissions system, exporting the configuration, resolver, and middleware for use in other parts of the application (e.g. event handlers).

module.exports = {
  config: require("./config"),
  hasPermission: require("./resolver").hasPermission,
  permissionMiddleware: require("./middleware").permissionMiddleware
};

