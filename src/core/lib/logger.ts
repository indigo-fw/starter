type LogData = Record<string, unknown>;

interface Logger {
  debug: (msg: string, data?: LogData) => void;
  info: (msg: string, data?: LogData) => void;
  warn: (msg: string, data?: LogData) => void;
  error: (msg: string, data?: LogData) => void;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatLog(
  level: string,
  prefix: string,
  msg: string,
  data?: LogData
): string {
  if (IS_PRODUCTION) {
    return JSON.stringify({
      level,
      msg: prefix ? `[${prefix}] ${msg}` : msg,
      ts: new Date().toISOString(),
      ...data,
    });
  }
  const tag = prefix ? `[${prefix}] ` : '';
  if (data && Object.keys(data).length > 0) {
    return `${tag}${msg} ${JSON.stringify(data)}`;
  }
  return `${tag}${msg}`;
}

function createLogger(prefix = ''): Logger {
  return {
    debug(msg: string, data?: LogData) {
      if (!IS_PRODUCTION) {
        console.debug(formatLog('debug', prefix, msg, data));
      }
    },
    info(msg: string, data?: LogData) {
      console.info(formatLog('info', prefix, msg, data));
    },
    warn(msg: string, data?: LogData) {
      console.warn(formatLog('warn', prefix, msg, data));
    },
    error(msg: string, data?: LogData) {
      console.error(formatLog('error', prefix, msg, data));
    },
  };
}

const logger = createLogger();

export { createLogger, logger };
export type { Logger };
