import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const html = await readFile(resolve(root, "index.html"), "utf8");
const references = [...html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)].map(
  (match) => match[1],
);
for (const stylesheet of references.filter((ref) => ref.endsWith(".css"))) {
  const css = await readFile(resolve(root, stylesheet), "utf8");
  references.push(
    ...[...css.matchAll(/url\(["']\.\/([^"']+)["']\)/g)].map(
      (match) => match[1],
    ),
  );
}
for (const ref of new Set(references)) await access(resolve(root, ref));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
if (ids.length !== new Set(ids).size) throw new Error("Duplicate HTML id");
for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
  if (!ids.includes(anchor)) throw new Error(`Missing anchor: ${anchor}`);
}
for (const script of references.filter((ref) => ref.endsWith(".js"))) {
  const result = spawnSync(
    process.execPath,
    ["--check", resolve(root, script)],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(
  `OK: JavaScript syntax, ${new Set(references).size} local assets, ${ids.length} unique IDs, all anchor targets.`,
);
