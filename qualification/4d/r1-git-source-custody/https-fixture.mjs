import { readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { extname, resolve, sep } from "node:path";

const [completeRoot, partialRoot, certPath, keyPath, readyPath, logPath] = process.argv.slice(2);
const expectedSecret = process.env.R1C14_SYNTHETIC_SECRET;
if (!completeRoot || !partialRoot || !certPath || !keyPath || !readyPath || !logPath || !expectedSecret) {
  throw new Error("missing HTTPS fixture argument");
}

const resolvedCompleteRoot = resolve(completeRoot);
const resolvedPartialRoot = resolve(partialRoot);
const requests = [];
const contentTypes = new Map([
  [".pack", "application/x-git-packed-objects"],
  [".idx", "application/x-git-packed-objects-toc"],
]);

const server = createServer(
  {
    cert: await readFile(certPath),
    key: await readFile(keyPath),
  },
  async (request, response) => {
    const url = new URL(request.url ?? "/", "https://git.allowed.test");
    requests.push({
      method: request.method,
      path: url.pathname,
      requestTarget: request.url ?? "/",
      authorizationPresent: Boolean(request.headers.authorization),
    });

    if (url.pathname.startsWith("/redirect.git/")) {
      response.writeHead(302, { location: `https://git.allowed.test/forbidden${url.pathname}` });
      response.end();
      return;
    }
    if (url.pathname.startsWith("/forbidden/")) {
      response.writeHead(500);
      response.end("redirect followed");
      return;
    }
    const isPrivate = url.pathname.startsWith("/admitted/private/repo.git/");
    if (isPrivate) {
      const expected = `Basic ${Buffer.from(`fixture:${expectedSecret}`).toString("base64")}`;
      if (request.headers.authorization !== expected) {
        response.writeHead(401, { "www-authenticate": 'Basic realm="r1c14"' });
        response.end();
        return;
      }
    }
    const route = isPrivate
      ? "/admitted/private/repo.git/"
      : url.pathname.startsWith("/admitted/partial.git/")
        ? "/admitted/partial.git/"
        : url.pathname.startsWith("/admitted/repo.git/")
          ? "/admitted/repo.git/"
          : null;
    if (!route) {
      response.writeHead(404);
      response.end();
      return;
    }

    const resolvedRoot = route === "/admitted/partial.git/" ? resolvedPartialRoot : resolvedCompleteRoot;
    const relative = url.pathname.slice(route.length);
    const target = resolve(resolvedRoot, relative);
    if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${sep}`)) {
      response.writeHead(403);
      response.end();
      return;
    }

    try {
      const targetStat = await stat(target);
      if (!targetStat.isFile()) throw new Error("not a file");
      const body = await readFile(target);
      response.writeHead(200, {
        "content-length": body.length,
        "content-type": contentTypes.get(extname(target)) ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  },
);

server.listen(443, "127.0.0.1", async () => {
  await writeFile(readyPath, JSON.stringify({ port: 443 }));
});

async function stop() {
  await writeFile(logPath, JSON.stringify(requests, null, 2));
  server.close(() => process.exit(0));
}

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
