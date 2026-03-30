// src/config/logger.transport.ts
import pinoPretty from 'pino-pretty';

export default () =>
  pinoPretty({
    colorize: true,
    translateTime: 'SYS:HH:MM:ss',
    ignore: 'pid,hostname,env',
    messageFormat: (log, messageKey) => {
      const msg = String(log[messageKey] ?? '');
      const parts: string[] = [msg];

      if (log['responseTime'] !== undefined) parts.push(`(${log['responseTime']}ms)`);
      if (log['dbName'])                      parts.push(`db=${log['dbName']}`);
      if (log['created'] !== undefined)       parts.push(`created=${log['created']} updated=${log['updated']} total=${log['total']}`);

      return parts.join(' ');
    },
  });