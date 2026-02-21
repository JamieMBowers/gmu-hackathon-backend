const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const functionDirs = [
  "claims-analyze",
  "config-debug",
  "health",
  "search-openalex",
  "search-combined",
  "sources-parse",
  "sources-enrich",
  "suggestions-resolve",
];

const expectedDistFiles = [
  "claimsAnalyze.js",
  "config-debug.js",
  "health.js",
  "search-openalex.js",
  "search-combined.js",
  "sources-parse.js",
  "sources-enrich.js",
  "suggestions-resolve.js",
];

test("host.json exists", () => {
  assert.ok(fileExists(path.join(root, "host.json")), "host.json missing");
});

test("dist functions exist", () => {
  const distDir = path.join(root, "dist", "functions");
  assert.ok(fileExists(distDir), "dist/functions missing");

  for (const fileName of expectedDistFiles) {
    const filePath = path.join(distDir, fileName);
    assert.ok(fileExists(filePath), `Missing ${fileName} in dist/functions`);
  }
});

test("function.json files reference existing scripts", () => {
  for (const dirName of functionDirs) {
    const functionJsonPath = path.join(root, dirName, "function.json");
    assert.ok(fileExists(functionJsonPath), `Missing ${dirName}/function.json`);

    const functionJson = readJson(functionJsonPath);
    assert.ok(functionJson.scriptFile, `Missing scriptFile in ${dirName}/function.json`);

    const resolvedScript = path.resolve(path.join(root, dirName), functionJson.scriptFile);
    assert.ok(
      fileExists(resolvedScript),
      `scriptFile not found for ${dirName}: ${functionJson.scriptFile}`
    );
  }
});

test("@azure/functions is resolvable", () => {
  const resolved = require.resolve("@azure/functions", { paths: [root] });
  assert.ok(resolved, "@azure/functions not resolvable from root");
});
