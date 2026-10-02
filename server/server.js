const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const HOST = process.env.HOST || "localhost";
const PORT = Number(process.env.PORT) || 3001;
const publicDir = path.join(__dirname, "public");
const events = [];

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(data));
}

async function readJson(request, response) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;

    if (Buffer.byteLength(body) > 16_000) {
      sendJson(response, 413, { error: "Request body is too large" });
      return null;
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    sendJson(response, 400, { error: "Request must contain valid JSON" });
    return null;
  }
}

async function serveFile(response, pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (decodedPath === "/") {
    decodedPath = "/index.html";
  }

  const filePath = path.resolve(publicDir, `.${decodedPath}`);
  const relativePath = path.relative(publicDir, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
  };

  try {
    const file = await fs.readFile(filePath);
    const contentType =
      contentTypes[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/events") {
      sendJson(response, 200, events);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/events") {
      const data = await readJson(request, response);

      if (data === null) {
        return;
      }

      if (typeof data.url !== "string" || typeof data.text !== "string") {
        sendJson(response, 400, { error: "Event needs a URL and text" });
        return;
      }

      let pageUrl;

      try {
        pageUrl = new URL(data.url);
      } catch {
        sendJson(response, 400, { error: "Event URL is invalid" });
        return;
      }

      const isAllowedUrl =
        ["http:", "https:"].includes(pageUrl.protocol) &&
        pageUrl.hostname.length > 0;

      if (!isAllowedUrl) {
        sendJson(response, 400, {
          error: "Only http/https page URLs are accepted",
        });
        return;
      }

      events.push({
        url: data.url.slice(0, 2048),
        text: data.text.slice(0, 10_000),
        timestamp: new Date().toISOString(),
      });

      if (events.length > 500) {
        events.shift();
      }

      sendJson(response, 201, { success: true });
      return;
    }

    if (request.method === "DELETE" && requestUrl.pathname === "/events") {
      events.length = 0;
      sendJson(response, 200, { success: true });
      return;
    }

    if (request.method === "GET") {
      await serveFile(response, requestUrl.pathname);
      return;
    }

    response.writeHead(405, { Allow: "GET, POST, DELETE" });
    response.end("Method not allowed");
  } catch {
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Server error" });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dashboard running at http://${HOST}:${PORT}`);
});
