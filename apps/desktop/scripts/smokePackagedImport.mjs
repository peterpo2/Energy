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
    (entry) => entry.toLowerCase().endsWith(".exe") && !entry.toLowerCase().includes("uninstall"),
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
  const inputFile = process.argv[2];
  if (!inputFile || !existsSync(inputFile)) {
    fail("Подай съществуващ Excel файл като първи аргумент.");
  }

  const exePath = findExecutable();
  const logsDir = path.join(unpackedDir, "Logs");
  const resultFile = path.join(logsDir, "runtime-smoke-result.json");

  try {
    await rm(resultFile, { force: true });
  } catch {
    // Ignore.
  }

  console.log(`Стартиране на packaged import smoke test: ${exePath}`);
  const child = spawn(exePath, [`--runtime-smoke-file=${path.resolve(inputFile)}`], {
    cwd: unpackedDir,
    detached: false,
    stdio: "ignore",
  });

  const resultReady = await waitFor(async () => {
    if (!existsSync(resultFile)) {
      return false;
    }
    const size = (await stat(resultFile)).size;
    return size > 0;
  }, 60000);

  if (!resultReady) {
    try {
      child.kill();
    } catch {
      // Ignore.
    }
    fail("Packaged import smoke test failed: няма runtime-smoke-result.json.");
  }

  const payload = JSON.parse(readFileSync(resultFile, "utf8"));
  if (!payload.datasetId || payload.rowCountNormalized <= 0) {
    fail("Packaged import smoke test failed: резултатът не съдържа валиден импорт.");
  }

  console.log(JSON.stringify(payload, null, 2));
  console.log("Packaged import smoke test passed.");
}

await main();
