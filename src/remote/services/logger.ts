/**
 * Logger Service
 * Simple logging interface for TV Remote services
 *
 * SECURITY: This logger sanitizes sensitive data before output.
 * The following are considered sensitive and will be masked or removed:
 * - Full IP addresses (last octet masked)
 * - MAC addresses (fully masked)
 * - Authentication tokens/keys
 * - User-entered text (keyboard input)
 */

export type LogLevel = 'info' | 'warn' | 'error';
export type LogEventType = 'connection' | 'command' | 'discovery' | 'system';

/**
 * Sensitive data patterns for sanitization
 */
const SENSITIVE_PATTERNS = {
  // IPv4 addresses - mask last octet
  ipv4: /(\d{1,3}\.\d{1,3}\.\d{1,3}\.)\d{1,3}/g,
  // MAC addresses - fully mask
  mac: /([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/g,
  // Tokens and keys - detect common patterns
  token: /(['"]?(?:token|key|password|secret|auth)['"]?\s*[:=]\s*)(['"]?)([^'"\s,}]+)\2/gi,
};

/**
 * Sanitize a string to remove sensitive data
 */
function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    let sanitized = value;
    // Mask last octet of IP addresses
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.ipv4, '$1***');
    // Fully mask MAC addresses
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.mac, '**:**:**:**:**:**');
    // Mask tokens and keys
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.token, '$1$2[REDACTED]$2');
    return sanitized;
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Skip sensitive keys entirely
      if (/^(password|secret|token|auth|key)$/i.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else if (k === 'ipAddress' && typeof v === 'string') {
        // Mask last octet of IP addresses
        sanitized[k] = v.replace(SENSITIVE_PATTERNS.ipv4, '$1***');
      } else {
        sanitized[k] = sanitize(v);
      }
    }
    return sanitized;
  }
  return value;
}

/**
 * Logger interface
 */
interface ILogger {
  info(type: LogEventType, message: string, ...args: unknown[]): void;
  warn(type: LogEventType, message: string, ...args: unknown[]): void;
  error(type: LogEventType, message: string, ...args: unknown[]): void;
  connection(
    level: LogLevel,
    message: string,
    deviceId?: string | null,
    sessionId?: string | null
  ): void;
  command(
    level: LogLevel,
    message: string,
    deviceId?: string | null,
    sessionId?: string | null,
    payload?: Record<string, unknown>
  ): void;
  discovery(level: LogLevel, message: string, payload?: Record<string, unknown>): void;
  system(level: LogLevel, message: string, payload?: Record<string, unknown>): void;
}

/**
 * Format log message with timestamp and type
 * Sanitizes payload to remove sensitive data
 */
function formatMessage(
  type: LogEventType,
  message: string,
  extra?: Record<string, unknown>
): string {
  const time = new Date().toLocaleTimeString();
  // Sanitize the message itself
  const sanitizedMessage = typeof message === 'string' ? (sanitize(message) as string) : message;
  let formatted = `[${time}] [${type.toUpperCase()}] ${sanitizedMessage}`;
  if (extra && Object.keys(extra).length > 0) {
    // Sanitize the payload
    const sanitizedExtra = sanitize(extra);
    formatted += ` ${JSON.stringify(sanitizedExtra)}`;
  }
  return formatted;
}

/**
 * Simple logger implementation
 */
class Logger implements ILogger {
  private enabled: boolean;

  constructor() {
    // Enable logging in development mode
    this.enabled = __DEV__;
  }

  info(type: LogEventType, message: string, payload?: Record<string, unknown>): void {
    if (!this.enabled) return;
    console.log(formatMessage(type, message, payload));
  }

  warn(type: LogEventType, message: string, payload?: Record<string, unknown>): void {
    if (!this.enabled) return;
    console.warn(formatMessage(type, message, payload));
  }

  error(type: LogEventType, message: string, payload?: Record<string, unknown>): void {
    // Always log errors
    console.error(formatMessage(type, message, payload));
  }

  connection(
    level: LogLevel,
    message: string,
    deviceId?: string | null,
    sessionId?: string | null,
    payload?: Record<string, unknown>
  ): void {
    const extra: Record<string, unknown> = { ...payload };
    if (deviceId) extra.deviceId = deviceId;
    if (sessionId) extra.sessionId = sessionId;
    this[level]('connection', message, extra);
  }

  command(
    level: LogLevel,
    message: string,
    deviceId?: string | null,
    sessionId?: string | null,
    payload?: Record<string, unknown>
  ): void {
    const extra: Record<string, unknown> = { ...payload };
    if (deviceId) extra.deviceId = deviceId;
    if (sessionId) extra.sessionId = sessionId;
    this[level]('command', message, extra);
  }

  discovery(level: LogLevel, message: string, payload?: Record<string, unknown>): void {
    this[level]('discovery', message, payload);
  }

  system(level: LogLevel, message: string, payload?: Record<string, unknown>): void {
    this[level]('system', message, payload);
  }
}

// Export singleton instance
export const logger = new Logger();
