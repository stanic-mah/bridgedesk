import { spawn } from "node:child_process";

const child = spawn("electron-builder", ["--win", "nsis", "portable", "--publish", "never"], {
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
  shell: true,
  stdio: "inherit",
  windowsHide: true,
});

child.on("close", (code) => {
  process.exitCode = code ?? 1;
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
