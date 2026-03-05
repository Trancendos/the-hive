import pino from 'pino';
export const logger = pino({
  name: 'the-hive',
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  base: { service: 'the-hive' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
export default logger;