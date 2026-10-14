/** What an app tells about itself; everything else comes from the environment. */
export interface TelemetryOptions {
  /** Default `service.name` — `OTEL_SERVICE_NAME` / `ELASTIC_APM_SERVICE_NAME` win over it. */
  serviceName: string;
  /** Default `service.version` — `APP_VERSION` wins over it. */
  serviceVersion?: string;
  /**
   * Request paths (prefixes) that never become server spans: k8s probes, the SSE stream (one
   * request that lives for hours would be one span that lives for hours).
   */
  ignorePaths?: string[];
  /**
   * Якщо задано — сервер-спани лише для запитів з цими префіксами (статика фронту й SPA-маршрути — ні).
   */
  tracePaths?: string[];
  /**
   * Усі заголовки HTTP — атрибутами спанів (`http.request.header.*`, `http.response.header.*`), як
   * ELASTIC_APM_CAPTURE_HEADERS; cookie / authorization маскуються. `OTEL_CAPTURE_HEADERS=false` — вимкнути.
   */
  captureHeaders?: boolean;
  /**
   * Record the body of incoming POST / PUT / PATCH / DELETE requests on their span — whole, as a span
   * event (a log document in Elastic), plus its start as `http.request.body` — so a write that failed
   * can be replayed from the trace. Off by default; `OTEL_CAPTURE_BODY=true` (or
   * `ELASTIC_APM_CAPTURE_BODY=all|transactions`) turns it on.
   */
  captureBody?: boolean;
  /**
   * Bytes of the body kept (default `DEFAULT_CAPTURE_BODY_MAX`); 0 = the whole body, however long.
   * `OTEL_CAPTURE_BODY_MAX`.
   */
  captureBodyMax?: number;
}

/**
 * What is kept of a captured body unless `OTEL_CAPTURE_BODY_MAX` says otherwise. Uncapped, every
 * 20 MB import was buffered in memory a second time and shipped to APM as one span event.
 */
export const DEFAULT_CAPTURE_BODY_MAX = 8 * 1024;

export interface TelemetryConfig {
  /** `false` = nothing is started at all (no endpoint, or `OTEL_SDK_DISABLED=true`). */
  enabled: boolean;
  /** OTLP/HTTP URLs of the two signals, path included. */
  tracesUrl: string;
  metricsUrl: string;
  /** Sent with every export — Elastic APM's secret token / API key ends up here. */
  headers: Record<string, string>;
  serviceName: string;
  serviceVersion: string | undefined;
  /** `deployment.environment` — Elastic shows it as the service environment. */
  environment: string;
  /**
   * `ELASTIC_APM_GLOBAL_LABELS` (`key=value,key2=value2`): resource attributes of everything this
   * process exports — and of the browser's exports the BFF forwards. Elastic shows them as
   * `labels.<key>`, which is what a Kibana service group is made of (`labels.project : "purchase"`
   * = the whole service in one group).
   */
  globalLabels: Record<string, string>;
  ignorePaths: string[];
  tracePaths: string[] | null;
  captureHeaders: boolean;
  captureBody: boolean;
  captureBodyMax: number;
  /**
   * Share of root traces kept, 0…1, under `ParentBased(TraceIdRatio)` — a request that arrives with
   * a `traceparent` (the browser, the BFF's call to the API) follows its parent's decision, so a
   * trace is never half-kept. `OTEL_TRACES_SAMPLER` unset or `parentbased_traceidratio`: the ratio is
   * `OTEL_TRACES_SAMPLER_ARG` (default 1 = everything, as before). `null` = `OTEL_TRACES_SAMPLER`
   * names another sampler, which the SDK builds from the environment itself.
   */
  traceSampleRatio: number | null;
}

const truthy = (v: string | undefined): boolean => v === 'true' || v === '1';
const trimSlash = (u: string): string => u.replace(/\/+$/, '');

/**
 * Parses `OTEL_EXPORTER_OTLP_HEADERS` (`key=value,key2=value2`, values may be URL-encoded) — the
 * same format the SDK reads itself; parsed here so Elastic's token can be merged on top.
 */
export function parseHeaders(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (raw ?? '').split(',')) {
    const i = pair.indexOf('=');
    if (i <= 0) continue;
    const key = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

/**
 * The environment → what the SDK is started with. Two vocabularies are understood, the standard
 * OpenTelemetry one (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME`,
 * `OTEL_SDK_DISABLED`) and Elastic APM's (`ELASTIC_APM_SERVER_URL`, `ELASTIC_APM_SECRET_TOKEN` /
 * `ELASTIC_APM_API_KEY`, `ELASTIC_APM_SERVICE_NAME`, `ELASTIC_APM_ENVIRONMENT`) — the OpenTelemetry
 * names win where both are set. No endpoint at all = telemetry off, the app runs as before.
 * `ELASTIC_APM_GLOBAL_LABELS` has the format of the headers; `OTEL_RESOURCE_ATTRIBUTES` is read by
 * the SDK itself (this process only — it does not reach the browser's exports).
 *
 * Elastic's APM Server takes OTLP/HTTP on its usual port (`https://apm:8200`); the per-signal paths
 * (`/v1/traces`, `/v1/metrics`) are appended here because an exporter given an explicit URL uses it
 * verbatim. `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `…_METRICS_ENDPOINT`, when set, are taken as they are.
 */
export function telemetryConfig(env: NodeJS.ProcessEnv, opts: TelemetryOptions): TelemetryConfig {
  const endpoint = (env.OTEL_EXPORTER_OTLP_ENDPOINT || env.ELASTIC_APM_SERVER_URL || '').trim();
  const enabled = !truthy(env.OTEL_SDK_DISABLED) && endpoint !== '';
  const base = endpoint ? trimSlash(endpoint) : '';
  const headers = parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);
  // Elastic: `Authorization: Bearer <secret token>` or `Authorization: ApiKey <base64 key>`
  if (!headers.Authorization && !headers.authorization) {
    if (env.ELASTIC_APM_SECRET_TOKEN) headers.Authorization = `Bearer ${env.ELASTIC_APM_SECRET_TOKEN}`;
    else if (env.ELASTIC_APM_API_KEY) headers.Authorization = `ApiKey ${env.ELASTIC_APM_API_KEY}`;
  }
  return {
    enabled,
    tracesUrl: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || `${base}/v1/traces`,
    metricsUrl: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || `${base}/v1/metrics`,
    headers,
    serviceName: env.OTEL_SERVICE_NAME || env.ELASTIC_APM_SERVICE_NAME || opts.serviceName,
    serviceVersion: env.APP_VERSION || opts.serviceVersion,
    environment:
      env.OTEL_DEPLOYMENT_ENVIRONMENT || env.ELASTIC_APM_ENVIRONMENT || env.NODE_ENV || 'development',
    globalLabels: parseHeaders(env.ELASTIC_APM_GLOBAL_LABELS),
    ignorePaths: opts.ignorePaths ?? ['/health', '/ready'],
    tracePaths: opts.tracePaths ?? null,
    captureHeaders: opts.captureHeaders ?? env.OTEL_CAPTURE_HEADERS !== 'false',
    captureBody:
      opts.captureBody ??
      (truthy(env.OTEL_CAPTURE_BODY) ||
        ['all', 'transactions'].includes((env.ELASTIC_APM_CAPTURE_BODY ?? '').trim().toLowerCase())),
    captureBodyMax: opts.captureBodyMax ?? captureBodyMax(env.OTEL_CAPTURE_BODY_MAX),
    traceSampleRatio: traceSampleRatio(env),
  };
}

/** `OTEL_CAPTURE_BODY_MAX`: bytes; `0` = no cap; unset / not a number = `DEFAULT_CAPTURE_BODY_MAX`. */
function captureBodyMax(raw: string | undefined): number {
  const v = (raw ?? '').trim();
  const n = v === '' ? Number.NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_CAPTURE_BODY_MAX;
}

/** See `TelemetryConfig.traceSampleRatio`; a ratio that is not a number in 0…1 is 1 (everything). */
export function traceSampleRatio(env: NodeJS.ProcessEnv): number | null {
  const sampler = (env.OTEL_TRACES_SAMPLER ?? '').trim().toLowerCase();
  if (sampler !== '' && sampler !== 'parentbased_traceidratio') return null;
  const raw = (env.OTEL_TRACES_SAMPLER_ARG ?? '').trim();
  const n = raw === '' ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1;
}
