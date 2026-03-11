import { existsSync, readFileSync, readdirSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const appDir = process.cwd();
const unpackedDir = path.join(appDir, "dist", "win-unpacked");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function findExecutable() {
  if (!existsSync(unpackedDir)) {
    fail(`Липсва папка за packaged приложение: ${unpackedDir}`);
  }

  const exe = readdirSync(unpackedDir).find(
    (entry) =>
      entry.toLowerCase().endsWith(".exe") && !entry.toLowerCase().includes("uninstall"),
  );

  if (!exe) {
    fail(`Не е намерен изпълним файл в ${unpackedDir}`);
  }

  return path.join(unpackedDir, exe);
}

async function waitFor(check, timeoutMs, intervalMs = 500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function main() {
  const exePath = findExecutable();
  const logsDir = path.join(unpackedDir, "Logs");
  const logFile = path.join(logsDir, "app.log");

  try {
    await rm(logFile, { force: true });
  } catch {
    // Ignore.
  }

  console.log(`Стартиране на packaged app: ${exePath}`);
  const child = spawn(exePath, {
    cwd: unpackedDir,
    detached: false,
    stdio: "ignore",
  });

  child.unref();

  const logReady = await waitFor(async () => {
    if (!existsSync(logFile)) {
      return false;
    }

    const size = (await stat(logFile)).size;
    return size > 0;
  }, 15000);

  if (!logReady) {
    try {
      child.kill();
    } catch {
      // Ignore.
    }
    fail("Smoke test failed: не беше създаден startup log.");
  }

  const startupOk = await waitFor(async () => {
    const content = readFileSync(logFile, "utf8");
    return (
      content.includes("SQLite initialized.") &&
      content.includes("Main window created.") &&
      content.includes("Window shown.")
    );
  }, 15000);

  try {
    child.kill();
  } catch {
    // Ignore.
  }

  if (!startupOk) {
    fail("Smoke test failed: packaged app не достигна очакван startup state.");
  }

  console.log("Smoke test passed: packaged app стартира успешно.");
}

await main();
