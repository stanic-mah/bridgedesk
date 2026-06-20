import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = resolve(root, "src/desktop");
const buildAssets = resolve(root, "build");
const target = resolve(root, "dist/desktop");

await mkdir(target, { recursive: true });

for (const file of ["index.html", "styles.css"]) {
  await cp(resolve(source, file), resolve(target, file));
}

for (const file of ["icon.png", "tray-icon.png"]) {
  await cp(resolve(buildAssets, file), resolve(target, file));
}
