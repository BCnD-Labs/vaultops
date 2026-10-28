import { createLogger, type Logger } from "./logger";

let current: Logger = createLogger();

/** The app-wide logger. Until `setLogger` runs it only keeps events in memory. */
export const getLogger = (): Logger => current;

/** Called once at startup with the logger that writes to the log file. */
export function setLogger(logger: Logger): void {
	current = logger;
}
