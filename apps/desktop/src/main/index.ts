import path from "node:path";
import { existsSync } from "node:fs";
import { app, BrowserWindow, dialog } from "electron";
import { createSqliteClient, SqliteClient } from "@persistence";
import { createMainWindow } from "./app/createMainWindow";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";
import { logDatabaseDiagnostics } from "./services/databaseDiagnostics";
import { getCurrentLogDir, logError, logInfo } from "./services/logger";
import { runRuntimeSmokeTestWithExit } from "./services/runtimeSmokeTest";
import { mainBgText } from "./i18n/bg";

let sqliteClient: SqliteClient | null = null;
let mainWindow: BrowserWindow | null = null;

function resolveMigrationsDir(): string {
  const candidates = [
    // Dev from apps/desktop cwd
    path.resolve(process.cwd(), "..", "..", "packages", "persistence", "src", "db", "migrations"),
    // Dev from repo root cwd
    path.resolve(process.cwd(), "packages", "persistence", "src", "db", "migrations"),
    // Built app layout
    path.resolve(__dirname, "..", "migrations"),
    // Packaged resources layout fallback
    path.resolve(app.getAppPath(), "dist-electron", "migrations"),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Unable to locate migrations directory. Checked: ${candidates.join(" | ")}`,
    );
  }
  return found;
}

function createDatabaseClient(): SqliteClient {
  const dbPath = path.join(app.getPath("userData"), "energy.db");
  return createSqliteClient({
    dbPath,
    migrationsDir: resolveMigrationsDir(),
  });
}

function getRuntimeSmokeFileArg(argv: string[]): string | null {
  const entry = argv.find((item) => item.startsWith("--runtime-smoke-file="));
  if (!entry) {
    return null;
  }
  return entry.slice("--runtime-smoke-file=".length).trim() || null;
}

async function bootstrap(): Promise<void> {
  try {
    const runtimeSmokeFile = getRuntimeSmokeFileArg(process.argv);
    if (!runtimeSmokeFile) {
      const singleInstanceLock = app.requestSingleInstanceLock();
      if (!singleInstanceLock) {
        app.quit();
        return;
      }

      app.on("second-instance", (_event, argv, workingDirectory) => {
        if (!mainWindow) {
          logInfo(
            `Second-instance event received without existing window. argv=${JSON.stringify(argv)} cwd=${workingDirectory}`,
            "bootstrap",
          );
          return;
        }
        logInfo(
          `Second-instance event received. argv=${JSON.stringify(argv)} cwd=${workingDirectory}`,
          "bootstrap",
        );
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
        logInfo(mainBgText.log.secondInstanceFocused, "bootstrap");
      });
    }

    await app.whenReady();
    logInfo(`App ready. Log directory: ${getCurrentLogDir()}`, "bootstrap");

    sqliteClient = createDatabaseClient();
    logInfo("SQLite initialized.", "bootstrap");
    logDatabaseDiagnostics(sqliteClient);
    registerIpcHandlers({ sqlite: sqliteClient });
    logInfo("IPC handlers registered.", "bootstrap");

    if (runtimeSmokeFile) {
      void runRuntimeSmokeTestWithExit(sqliteClient, runtimeSmokeFile);
      return;
    }

    mainWindow = createMainWindow();
    logInfo("Main window created.", "bootstrap");
    mainWindow.on("closed", () => {
      mainWindow = null;
    });

    app.on("activate", () => {
      logInfo("App activate event received.", "bootstrap");
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createMainWindow();
        mainWindow.on("closed", () => {
          mainWindow = null;
        });
        logInfo("Main window re-created after activate.", "bootstrap");
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    logError(message, "bootstrap");
    dialog.showErrorBox(mainBgText.dialogs.startupErrorTitle, message);
    app.exit(1);
  }
}

void bootstrap();

app.on("window-all-closed", () => {
  logInfo("window-all-closed", "lifecycle");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  logInfo("before-quit", "lifecycle");
  sqliteClient?.close();
  logInfo("SQLite connection closed.", "lifecycle");
  sqliteClient = null;
});

process.on("uncaughtException", (error) => {
  const message = error.stack ?? error.message;
  logError(`uncaughtException: ${message}`, "process");
  dialog.showErrorBox(mainBgText.dialogs.uncaughtExceptionTitle, message);
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  logError(`unhandledRejection: ${message}`, "process");
  dialog.showErrorBox(mainBgText.dialogs.unhandledRejectionTitle, message);
});
