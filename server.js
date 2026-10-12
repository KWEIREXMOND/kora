/**
 * KORA — production server entry file.
 *
 * Required by hosts whose Node.js manager launches an application from a
 * startup FILE rather than an npm command (cPanel "Setup Node.js App" →
 * "Application Startup File"). This is the exact equivalent of
 * `npm start` (`next start`): it serves the prebuilt `.next` output in
 * production mode, including Proxy/middleware, API routes and SSR.
 *
 * Build once before first use:  npm run build
 * Then either:                  node server.js     (cPanel startup file)
 * Or the standard command:      npm start          (same behavior)
 *
 * Environment: PORT (assigned by the host; default 3000),
 *              HOST (bind address; default 0.0.0.0),
 *              plus the usual variables from .env.example.
 */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOST || "0.0.0.0";
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer(async (req, res) => {
      try {
        await handle(req, res, parse(req.url, true));
      } catch (err) {
        console.error("Request handler error:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }).listen(port, hostname, (err) => {
      if (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
      }
      console.log(`KORA production server ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to prepare Next.js app:", err);
    process.exit(1);
  });
