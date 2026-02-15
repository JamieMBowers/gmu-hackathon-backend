// Thin wrapper so Azure Functions and Core Tools can load the compiled entry point.
// The actual logic lives in dist/functions/index.js (TypeScript output).
module.exports = require("../dist/functions/index.js");
