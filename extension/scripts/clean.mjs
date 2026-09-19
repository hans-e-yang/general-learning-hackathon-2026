// Removes tsc's source map/js leftovers we don't ship plus stray .tsbuildinfo
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of readdirSync(root)) {
  const p = join(root, f);
  if (!statSync(p).isFile()) continue;
  if (f.endsWith(".js.map") || f.endsWith(".tsbuildinfo")) rmSync(p);
}
