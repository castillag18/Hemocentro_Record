const { execSync } = require("node:child_process");

function freePort3000() {
  try {
    if (process.platform === "win32") {
      const out = execSync('netstat -ano | findstr :3000 | findstr LISTENING', {
        encoding: "utf8",
      });
      const pids = new Set(
        out
          .trim()
          .split("\n")
          .map((line) => line.trim().split(/\s+/).pop())
          .filter(Boolean),
      );
      for (const pid of pids) {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log(`Puerto 3000 liberado (PID ${pid})`);
      }
      return;
    }
    execSync("npx --yes kill-port 3000", { stdio: "inherit" });
  } catch {
    // Puerto libre o sin procesos
  }
}

freePort3000();
