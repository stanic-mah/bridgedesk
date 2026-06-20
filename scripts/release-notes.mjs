import { readFileSync, writeFileSync } from "node:fs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    version: null,
    focus: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--focus") {
      args.focus = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--output") {
      args.output = argv[index + 1];
      index += 1;
      continue;
    }
    if (!args.version) {
      args.version = value?.replace(/^v/, "") ?? null;
      continue;
    }
    fail(`Unexpected argument: ${value}`);
  }

  if (!args.version || !/^\d+\.\d+\.\d+$/.test(args.version)) {
    fail("Usage: node scripts/release-notes.mjs <version> --focus \"release focus\" [--output file]");
  }
  if (!args.focus?.trim()) {
    fail("Release notes need --focus so the first sentence stays specific.");
  }

  return {
    version: args.version,
    focus: trimSentenceEnd(args.focus.trim()),
    output: args.output,
  };
}

function trimSentenceEnd(value) {
  return value.replace(/[.?!]\s*$/, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bulletsForVersion(updateLog, version) {
  const pattern = new RegExp(
    `^##\\s+${escapeRegExp(version)}\\s*$([\\s\\S]*?)(?=^##\\s+\\d+\\.\\d+\\.\\d+\\s*$|(?![\\s\\S]))`,
    "m",
  );
  const match = updateLog.match(pattern);
  if (!match) fail(`UPDATE_LOG.md has no entry for ${version}.`);

  const bullets = match[1]
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join("\n");

  if (!bullets.startsWith("- ")) {
    fail(`UPDATE_LOG.md entry for ${version} needs bullet points.`);
  }

  return bullets;
}

function renderReleaseNotes({ version, focus, bullets }) {
  return [
    `BridgeDesk v${version} focuses on ${focus}.`,
    "",
    bullets,
    "",
    "Recommended download: `BridgeDesk-Setup.exe`",
    "",
    "The portable exe is included for manual use only. Auto-update uses the installer plus `latest.yml`.",
    "",
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));
const updateLog = readFileSync("UPDATE_LOG.md", "utf8");
const notes = renderReleaseNotes({
  version: args.version,
  focus: args.focus,
  bullets: bulletsForVersion(updateLog, args.version),
});

if (args.output) {
  writeFileSync(args.output, notes, "utf8");
} else {
  process.stdout.write(notes);
}
