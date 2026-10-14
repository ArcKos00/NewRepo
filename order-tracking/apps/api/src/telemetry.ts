import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { startTelemetry, stopTelemetry } from './telemetry/index';

/**
 * OpenTelemetry → Elastic APM (як у litopys). Стартує під час імпорту, і цей файл — ПЕРШИЙ імпорт
 * `main.ts`: інструментації патчать http, express, @nestjs/core і pg у момент їх завантаження.
 * Вимкнено, доки не задано `ELASTIC_APM_SERVER_URL` / `OTEL_EXPORTER_OTLP_ENDPOINT`.
 * Статика фронту й проба readiness — не ті транзакції, які варто зберігати.
 */
export const telemetry = startTelemetry({
  serviceName: 'purchase-api',
  ignorePaths: ['/assets', '/favicon.ico', '/api/audit/events'],
});

/** Дописує буфер у APM, коли процес зупиняють. */
@Injectable()
export class TelemetryShutdown implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string): Promise<void> {
    if (signal) await stopTelemetry();
  }
}
