import { readFileSync } from "node:fs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const updateLog = readFileSync("UPDATE_LOG.md", "utf8");

const packageVersion = packageJson.version;
const lockVersion = packageLock.version;
const lockRootVersion = packageLock.packages?.[""]?.version;
const updateLogVersion = updateLog.match(/^##\s+(\d+\.\d+\.\d+)/m)?.[1] ?? null;

if (!packageVersion) fail("package.json is missing a version.");
if (lockVersion !== packageVersion) {
  fail(`package-lock.json version ${lockVersion} does not match package.json ${packageVersion}.`);
}
if (lockRootVersion !== packageVersion) {
  fail(`package-lock root version ${lockRootVersion} does not match package.json ${packageVersion}.`);
}
if (updateLogVersion !== packageVersion) {
  fail(`UPDATE_LOG.md top entry ${updateLogVersion ?? "missing"} does not match package.json ${packageVersion}.`);
}

if (process.exitCode) {
  process.exit();
}

console.log(`Release metadata is consistent for v${packageVersion}.`);
