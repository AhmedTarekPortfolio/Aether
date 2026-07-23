/// <reference types="vite/client" />

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDev = import.meta.env.DEV;

  debug(message: string, context?: Record<string, any>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context);
  }

  error(message: string, error?: any, context?: Record<string, any>) {
    this.log('error', message, { ...context, error: error?.message || error });
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>) {
    if (!this.isDev && level === 'debug') return;

    const timestamp = new Date().toISOString();
    const formatted = `[Aether ${level.toUpperCase()}] ${timestamp} - ${message}`;

    switch (level) {
      case 'debug':
        console.debug(formatted, context || '');
        break;
      case 'info':
        console.info(formatted, context || '');
        break;
      case 'warn':
        console.warn(formatted, context || '');
        break;
      case 'error':
        console.error(formatted, context || '');
        break;
    }
  }
}

export const logger = new Logger();
