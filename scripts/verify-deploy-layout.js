const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const requiredPaths = [
  "host.json",
  "package.json",
  "package-lock.json",
  "dist/functions/health.js",
  "dist/functions/claimsAnalyze.js",
  "claims-analyze/function.json",
  "config-debug/function.json",
  "health/function.json",
  "search-openalex/function.json",
  "search-combined/function.json",
  "sources-parse/function.json",
  "sources-enrich/function.json",
  "suggestions-resolve/function.json",
];

const missing = requiredPaths.filter((rel) => !fs.existsSync(path.join(root, rel)));

if (missing.length > 0) {
  console.error("Missing required deployment files:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("Deploy layout looks OK.");
