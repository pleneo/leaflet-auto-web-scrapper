import type { LogContext, Logger } from '../../application/ports/logger';
import type { LogLevel } from '../config/environment-config';

export class ConsoleLogger implements Logger {
  private readonly minimumLevel: LogLevel;

  constructor(minimumLevel: LogLevel) {
    this.minimumLevel = minimumLevel;
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

    const formattedMessage = `[${level.toUpperCase()}] ${message}`;

    if (context === undefined) {
      writeWithoutContext(level, formattedMessage);
      return;
    }

    writeWithContext(level, formattedMessage, context);
  }

  private shouldWrite(level: LogLevel): boolean {
    return levelWeight(level) >= levelWeight(this.minimumLevel);
  }
}

function writeWithoutContext(level: LogLevel, message: string): void {
  switch (level) {
    case 'debug':
    case 'info':
      console.info(message);
      return;
    case 'warn':
      console.warn(message);
      return;
    case 'error':
      console.error(message);
      return;
  }
}

function writeWithContext(level: LogLevel, message: string, context: LogContext): void {
  switch (level) {
    case 'debug':
    case 'info':
      console.info(message, context);
      return;
    case 'warn':
      console.warn(message, context);
      return;
    case 'error':
      console.error(message, context);
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
