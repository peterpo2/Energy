import path from "node:path";
import { BrowserWindow, app, shell } from "electron";
import { logError, logInfo, logWarn } from "../services/logger";

function resolvePreloadPath(): string {
  return path.join(__dirname, "../preload/index.js");
}

function resolveRendererIndexPath(): string {
  return path.join(__dirname, "../../dist/renderer/index.html");
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 760,
    backgroundColor: "#0B0E12",
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL;
  const allowedDevOrigin = devUrl ? new URL(devUrl).origin : null;
  if (!app.isPackaged && devUrl) {
    logInfo(`Loading renderer from dev server: ${devUrl}`, "window");
    void win.loadURL(devUrl);
  } else {
    const rendererPath = resolveRendererIndexPath();
    logInfo(`Loading renderer file: ${rendererPath}`, "window");
    void win.loadFile(rendererPath);
  }

  const showWindow = (): void => {
    if (win.isDestroyed()) {
      return;
    }
    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
  };

  win.once("ready-to-show", showWindow);
  win.webContents.once("did-finish-load", showWindow);
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logError(
      `did-fail-load code=${errorCode} description=${errorDescription} url=${validatedURL}`,
      "window",
    );
    showWindow();
  });

  // Fallback to avoid invisible background process if renderer never becomes "ready-to-show".
  setTimeout(showWindow, 3000);

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!app.isPackaged && allowedDevOrigin && url.startsWith(allowedDevOrigin)) {
      return;
    }

    if (app.isPackaged && url.startsWith("file://")) {
      return;
    }

    event.preventDefault();
    logWarn(`Blocked navigation to ${url}`, "window");
    void shell.openExternal(url);
  });

  win.on("show", () => logInfo("Window shown.", "window"));
  win.on("closed", () => logInfo("Window closed.", "window"));
  win.webContents.on("render-process-gone", (_event, details) => {
    logError(`Renderer process gone: ${JSON.stringify(details)}`, "window");
  });

  return win;
}
