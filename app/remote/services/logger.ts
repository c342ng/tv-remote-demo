/**
 * Logger Service
 * Simple logging interface with console output
 * Extensible for future remote/file logging
 */
import { LogEvent } from '../domain/models';

/** Log level type */
export type LogLevel = 'info' | 'warn' | 'error';

/** Log event type */
export type LogEventType = 'connection' | 'command' | 'discovery' | 'system';

/**
 * Logger configuration
 */
interface LoggerConfig {
  /** Enable/disable logging */
  enabled: boolean;
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Include timestamps in output */
  includeTimestamp: boolean;
  /** Include device/session IDs in output */
  includeIds: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  enabled: __DEV__,
  minLevel: 'info',
  includeTimestamp: true,
  includeIds: true,
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

/**
 * Logger class
 */
class Logger {
  private config: LoggerConfig = DEFAULT_CONFIG;
  private eventBuffer: LogEvent[] = [];
  private maxBufferSize = 100;

  /**
   * Configure logger
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Create a log event
   */
  private createLogEvent(
    level: LogLevel,
    type: LogEventType,
    message: string,
    payload?: Record<string, unknown>,
    deviceId?: string | null,
    sessionId?: string | null
  ): LogEvent {
    return {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      type,
      deviceId: deviceId ?? null,
      sessionId: sessionId ?? null,
      payload: {
        message,
        ...payload,
      },
    };
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Format log message for console
   */
  private formatMessage(event: LogEvent): string {
    const parts: string[] = [];

    if (this.config.includeTimestamp) {
      const time = new Date(event.timestamp).toLocaleTimeString();
      parts.push(`[${time}]`);
    }

    parts.push(`[${event.type.toUpperCase()}]`);

    if (this.config.includeIds) {
      if (event.deviceId) {
        parts.push(`[device:${event.deviceId.slice(0, 8)}]`);
      }
      if (event.sessionId) {
        parts.push(`[session:${event.sessionId.slice(0, 8)}]`);
      }
    }

    const message = event.payload.message as string;
    parts.push(message);

    return parts.join(' ');
  }

  /**
   * Output log event
   */
  private output(event: LogEvent): void {
    const message = this.formatMessage(event);
    const payload = { ...event.payload };
    delete payload.message;

    const hasPayload = Object.keys(payload).length > 0;

    switch (event.level) {
      case 'info':
        hasPayload ? console.log(message, payload) : console.log(message);
        break;
      case 'warn':
        hasPayload ? console.warn(message, payload) : console.warn(message);
        break;
      case 'error':
        hasPayload ? console.error(message, payload) : console.error(message);
        break;
    }

    // Buffer event for potential future use
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }
  }

  /**
   * Log info level message
   */
  info(
    type: LogEventType,
    message: string,
    payload?: Record<string, unknown>,
    deviceId?: string | null,
    sessionId?: string | null
  ): void {
    if (!this.shouldLog('info')) return;
    const event = this.createLogEvent('info', type, message, payload, deviceId, sessionId);
    this.output(event);
  }

  /**
   * Log warn level message
   */
  warn(
    type: LogEventType,
    message: string,
    payload?: Record<string, unknown>,
    deviceId?: string | null,
    sessionId?: string | null
  ): void {
    if (!this.shouldLog('warn')) return;
    const event = this.createLogEvent('warn', type, message, payload, deviceId, sessionId);
    this.output(event);
  }

  /**
   * Log error level message
   */
  error(
    type: LogEventType,
    message: string,
    payload?: Record<string, unknown>,
    deviceId?: string | null,
    sessionId?: string | null
  ): void {
    if (!this.shouldLog('error')) return;
    const event = this.createLogEvent('error', type, message, payload, deviceId, sessionId);
    this.output(event);
  }

  /**
   * Get buffered log events
   */
  getBufferedEvents(): LogEvent[] {
    return [...this.eventBuffer];
  }

  /**
   * Clear buffered events
   */
  clearBuffer(): void {
    this.eventBuffer = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Convenience methods for specific log types
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Log connection event
   */
  connection(
    level: LogLevel,
    message: string,
    deviceId?: string | null,
    sessionId?: string | null,
    payload?: Record<string, unknown>
  ): void {
    this[level]('connection', message, payload, deviceId, sessionId);
  }

  /**
   * Log command event
   */
  command(
    level: LogLevel,
    message: string,
    deviceId?: string | null,
    sessionId?: string | null,
    payload?: Record<string, unknown>
  ): void {
    this[level]('command', message, payload, deviceId, sessionId);
  }

  /**
   * Log discovery event
   */
  discovery(
    level: LogLevel,
    message: string,
    payload?: Record<string, unknown>
  ): void {
    this[level]('discovery', message, payload, null, null);
  }

  /**
   * Log system event
   */
  system(
    level: LogLevel,
    message: string,
    payload?: Record<string, unknown>
  ): void {
    this[level]('system', message, payload, null, null);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for testing
export { Logger };
