import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const target = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const data = await readFile(target);
    res.writeHead(200, {
      "Content-Type": mime[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (error) {
    res
      .writeHead(error.code === "ENOENT" ? 404 : 400)
      .end(error.code === "ENOENT" ? "Not found" : "Bad request");
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Set PORT to another port.`
      : error.message,
  );
  process.exit(1);
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `ORBIT is ready: http://localhost:${port}\nPress Ctrl+C to stop.`,
  ),
);
