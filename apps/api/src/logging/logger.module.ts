import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { config } from '../config';

type Req = IncomingMessage & { originalUrl?: string };

/**
 * Структуровані JSON-логи (pino) у stdout: кожен HTTP-запит, події застосунку, помилки.
 * У спані OTel кожен рядок отримує trace_id/span_id (instrumentation-pino), а при
 * увімкненому OTLP логи йдуть ще й в Elastic.
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      // Поле user, яке AuthGuard додає через PinoLogger.assign, потрапляє і в лог відповіді.
      assignResponse: true,
      pinoHttp: {
        level: config.logLevel,
        base: { service: process.env.OTEL_SERVICE_NAME ?? 'purchase' },
        transport: config.logPretty ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'], censor: '***' },
        genReqId: (req, res) => {
          const id = (req.headers['x-request-id'] as string) || randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },
        // Статика фронту і проби — без логів запитів.
        autoLogging: { ignore: (req) => { const url = (req as Req).originalUrl ?? req.url ?? ''; return url.startsWith('/api/health') || !url.startsWith('/api/'); } },
        customLogLevel: (_req, res: ServerResponse, err) =>
          err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        customSuccessMessage: (req, res: ServerResponse, time) => `${req.method} ${(req as Req).originalUrl ?? req.url} ${res.statusCode} ${Math.round(time)}ms`,
        customErrorMessage: (req, res: ServerResponse) => `${req.method} ${(req as Req).originalUrl ?? req.url} ${res.statusCode}`,
        serializers: {
          req: (req: { id: string; method: string; url: string; remoteAddress?: string; headers: Record<string, string> }) => ({
            id: req.id, method: req.method, url: req.url, ip: req.remoteAddress, userAgent: req.headers['user-agent'],
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      },
    }),
  ],
})
export class LoggerModule {}
