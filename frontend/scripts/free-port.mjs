import { execSync } from "node:child_process";

try {
  const out = execSync("netstat -ano", { encoding: "utf8" });
  for (const line of out.split("\n")) {
    if (line.includes(":8444") && line.includes("LISTENING")) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0") {
        try {
          execSync(`taskkill /F /PID ${pid}`);
          console.log(`Killed PID ${pid} listening on 8444`);
        } catch {}
      }
    }
  }
} catch {}
