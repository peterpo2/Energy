import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

let resolvedLogDir: string | null = null;

function getInstallLogsDir(): string {
  const exeDir = path.dirname(process.execPath);
  return path.join(exeDir, "Logs");
}

function getDevLogsDir(): string {
  return path.resolve(process.cwd(), "Logs");
}

function getUserDataLogsDir(): string {
  try {
    return path.join(app.getPath("userData"), "Logs");
  } catch {
    return path.resolve(process.cwd(), "Logs");
  }
}

function ensureDir(dirPath: string): boolean {
  try {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

function resolveLogDir(): string {
  if (resolvedLogDir) {
    return resolvedLogDir;
  }

  const candidates = app.isPackaged
    ? [getInstallLogsDir(), getUserDataLogsDir()]
    : [getDevLogsDir(), getInstallLogsDir(), getUserDataLogsDir()];

  for (const candidate of candidates) {
    if (ensureDir(candidate)) {
      resolvedLogDir = candidate;
      return candidate;
    }
  }

  const fallback = path.resolve(process.cwd(), "Logs");
  ensureDir(fallback);
  resolvedLogDir = fallback;
  return fallback;
}

function normalizeMessage(message: unknown): string {
  if (message instanceof Error) {
    return message.stack ?? message.message;
  }
  if (typeof message === "string") {
    return message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

export function log(level: LogLevel, message: unknown, context?: string): void {
  try {
    const logDir = resolveLogDir();
    const line = `[${new Date().toISOString()}] [${level}]${
      context ? ` [${context}]` : ""
    } ${normalizeMessage(message)}\n`;
    appendFileSync(path.join(logDir, "app.log"), line, "utf8");
  } catch {
    // Do not crash due to logging failures.
  }
}

export function logInfo(message: unknown, context?: string): void {
  log("INFO", message, context);
}

export function logWarn(message: unknown, context?: string): void {
  log("WARN", message, context);
}

export function logError(message: unknown, context?: string): void {
  log("ERROR", message, context);
}

export function getCurrentLogDir(): string {
  return resolveLogDir();
}

