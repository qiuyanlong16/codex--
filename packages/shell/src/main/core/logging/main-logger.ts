import path from "node:path";
import log from "electron-log";

const mainLog = {
  info: (tag: string, message: string, context?: Record<string, unknown>) => {
    log.info(`[${tag}] ${message}`, context ?? "");
  },
  warn: (tag: string, message: string, context?: Record<string, unknown>) => {
    log.warn(`[${tag}] ${message}`, context ?? "");
  },
  error: (tag: string, message: string, context?: Record<string, unknown>) => {
    log.error(`[${tag}] ${message}`, context ?? "");
  },
  debug: (tag: string, message: string, context?: Record<string, unknown>) => {
    log.debug(`[${tag}] ${message}`, context ?? "");
  },
};

export function initMainLogger(userDataPath: string, isDev: boolean): void {
  log.transports.file.level = isDev ? "debug" : "info";
  log.transports.console.level = isDev ? "debug" : "warn";
  log.transports.file.resolvePathFn = () => path.join(userDataPath, "main.log");
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.info("[logging] main log file", { path: path.join(userDataPath, "main.log") });
}

export { mainLog };
