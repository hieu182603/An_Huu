import { fileURLToPath } from "node:url";
import { preview } from "vite";

// Own the server in this process: shell children can survive teardown on Windows.
export default async function setupPreview() {
  let server: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      server = await preview({
        root: fileURLToPath(new URL("../", import.meta.url)),
        logLevel: "error",
        preview: { host: "127.0.0.1", port: 8444, strictPort: true },
        plugins: [{
          name: "isolated-browser-test-api",
          configurePreviewServer(previewServer) {
            // Tests must mock APIs explicitly; never forward mutations to the dev DB.
            previewServer.middlewares.use((req, res, next) => {
              if (!/^\/api(?:\/|\?|$)/.test(req.url ?? "")) return next();
              res.statusCode = 503;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: { code: "UNMOCKED_TEST_API", message: "Browser test API fixture missing." } }));
            });
          },
        }],
      });
      break;
    } catch (err: any) {
      if (attempt === 4) throw err;
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  return async () => {
    try {
      server?.httpServer?.closeAllConnections?.();
      await server?.close();
    } catch {}
  };
}
