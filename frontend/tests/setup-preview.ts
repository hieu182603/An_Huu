import { fileURLToPath } from "node:url";
import { preview } from "vite";
import { execSync } from "node:child_process";

// Own the server in this process: shell children can survive teardown on Windows.
export default async function setupPreview() {
  // Free port 8444 if occupied by a previous orphaned process
  try {
    execSync('powershell -Command "Get-NetTCPConnection -LocalPort 8444 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', { stdio: "ignore" });
  } catch {}

  let server: any = null;
  for (let attempt = 0; attempt < 10; attempt++) {
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
      if (attempt === 9) throw err;
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
