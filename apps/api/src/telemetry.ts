import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { startTelemetry, stopTelemetry } from './telemetry/index';

/**
 * OpenTelemetry → Elastic APM (як у litopys): трейси й метрики по OTLP/HTTP, trace_id у логах.
 * Стартує під час імпорту, і цей файл імпортується в `main.ts` одразу після `env.ts` — інструментації
 * мають пропатчити http, express, @nestjs/core, pg і pino до їх завантаження.
 * Вимкнено, доки не задано `OTEL_EXPORTER_OTLP_ENDPOINT` / `ELASTIC_APM_SERVER_URL`.
 * Спани — лише для API і входу; проби, пакети кліків і статика фронту — ні.
 */
export const telemetry = startTelemetry({
  serviceName: 'purchase',
  tracePaths: ['/api', '/auth'],
  ignorePaths: ['/api/health', '/api/audit/events'],
});

/** Дописує буфер у APM, коли процес зупиняють. */
@Injectable()
export class TelemetryShutdown implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string): Promise<void> {
    if (signal) await stopTelemetry();
  }
}
