import type { LogContext, Logger } from '../../application/ports/logger';
import type { LogLevel } from '../config/environment-config';

export interface JsonLoggerEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext | null;
}

export class JsonLogger implements Logger {
  private readonly minimumLevel: LogLevel;

  private readonly nowIso: () => string;

  constructor(minimumLevel: LogLevel, nowIso: () => string = () => new Date().toISOString()) {
    this.minimumLevel = minimumLevel;
    this.nowIso = nowIso;
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldWrite(level)) {
      return;
    }

    writeJson(level, {
      timestamp: this.nowIso(),
      level,
      message,
      context: context ?? null,
    });
  }

  private shouldWrite(level: LogLevel): boolean {
    return levelWeight(level) >= levelWeight(this.minimumLevel);
  }
}

function writeJson(level: LogLevel, entry: JsonLoggerEntry): void {
  const line = JSON.stringify(entry);

  switch (level) {
    case 'debug':
    case 'info':
      console.info(line);
      return;
    case 'warn':
      console.warn(line);
      return;
    case 'error':
      console.error(line);
      return;
  }
}

function levelWeight(level: LogLevel): number {
  switch (level) {
    case 'debug':
      return 10;
    case 'info':
      return 20;
    case 'warn':
      return 30;
    case 'error':
      return 40;
  }
}
