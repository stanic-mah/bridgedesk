import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileTool } from "./pi-tools.js";

const root = await mkdtemp(join(tmpdir(), "bridgedesk-pi-tools-test-"));

try {
  const response = await writeFileTool(
    {
      path: "nested/Testing 123.md",
      content: "BridgeDesk write test\n",
    },
    { cwd: root, root },
  );

  assert.equal(response.isError, undefined);
  assert.equal((await stat(join(root, "nested", "Testing 123.md"))).isFile(), true);
  assert.equal(await readFile(join(root, "nested", "Testing 123.md"), "utf8"), "BridgeDesk write test\n");

  const blocked = await writeFileTool(
    {
      path: "../outside.md",
      content: "blocked\n",
    },
    { cwd: root, root },
  );

  assert.equal(blocked.isError, true);
  assert.match(blocked.content[0]?.type === "text" ? blocked.content[0].text : "", /outside allowed roots/);
} finally {
  await rm(root, { recursive: true, force: true });
}
