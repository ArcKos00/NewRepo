/** Перенесено з litopys (packages/telemetry): OpenTelemetry → Elastic APM (OTLP/HTTP, protobuf). */
import type { ClientRequest, IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import { type Attributes, diag, type Span } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { dropClientErrors } from './client-errors';
import { type TelemetryConfig, type TelemetryOptions, telemetryConfig } from './config';

export {
  DEFAULT_CAPTURE_BODY_MAX,
  parseHeaders,
  type TelemetryConfig,
  type TelemetryOptions,
  telemetryConfig,
  traceSampleRatio,
} from './config';

/** Elastic APM reads the service environment from this (older) attribute name; the SDK's constant is the newer one. */
const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment';

/** How long a shutdown may spend flushing what is still buffered. */
const SHUTDOWN_TIMEOUT_MS = 5_000;

let sdk: NodeSDK | null = null;
let started: TelemetryConfig | null = null;

/** See `client-errors.ts`: a 401 / 404 thrown by a handler is an answer, not an error document. */
const clientErrorFilter: tracing.SpanProcessor = {
  onStart: () => undefined,
  onEnd: (span) => void dropClientErrors(span as unknown as { events?: { name: string }[] }),
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

/**
 * Starts OpenTelemetry for this process: traces and metrics over OTLP/HTTP (protobuf) to whatever
 * `OTEL_EXPORTER_OTLP_ENDPOINT` / `ELASTIC_APM_SERVER_URL` names — Elastic APM Server speaks it
 * natively (see `telemetryConfig` for the environment). Instrumented out of the box: incoming HTTP
 * (server spans), outgoing `http`/`https` and `fetch`/undici (client spans, `traceparent` carried
 * along — so the BFF's proxy call and the API's handling are one trace), Express middleware and
 * routes, Nest controllers/handlers, and every `pg` query.
 *
 * Call it before anything else is imported (the instrumentations patch modules as they load), once
 * per process; a second call is a no-op. Without an endpoint nothing is started and the app runs as
 * if the package were not there. Returns the resolved config, `null` when off.
 */
export function startTelemetry(
  opts: TelemetryOptions,
  env: NodeJS.ProcessEnv = process.env,
): TelemetryConfig | null {
  if (started) return started;
  const cfg = telemetryConfig(env, opts);
  if (!cfg.enabled) return null;

  const resource = defaultResource().merge(
    resourceFromAttributes({
      ...cfg.globalLabels,
      [ATTR_SERVICE_NAME]: cfg.serviceName,
      ...(cfg.serviceVersion ? { [ATTR_SERVICE_VERSION]: cfg.serviceVersion } : {}),
      [ATTR_SERVICE_INSTANCE_ID]: hostname(),
      [ATTR_DEPLOYMENT_ENVIRONMENT]: cfg.environment,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: cfg.environment,
    }),
  );
  const under = (url: string, p: string) => url === p || url.startsWith(`${p}?`) || url.startsWith(`${p}/`);
  const ignored = (url: string | undefined): boolean =>
    !!url && (cfg.ignorePaths.some((p) => under(url, p)) || (!!cfg.tracePaths && !cfg.tracePaths.some((p) => under(url, p))));

  const captureBody = captureRequestBody(cfg.captureBodyMax);
  sdk = new NodeSDK({
    resource,
    // `null`: another `OTEL_TRACES_SAMPLER` — the SDK builds it from the environment
    ...(cfg.traceSampleRatio !== null ? { sampler: traceSampler(cfg.traceSampleRatio) } : {}),
    spanProcessors: [
      // first: by the time the batch is exported the answers of the 4xx kind are off the span
      clientErrorFilter,
      new tracing.BatchSpanProcessor(new OTLPTraceExporter({ url: cfg.tracesUrl, headers: cfg.headers })),
    ],
    metricReaders: [
      // export interval: `OTEL_METRIC_EXPORT_INTERVAL` (ms, default 60 s) — read by the reader itself
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: cfg.metricsUrl, headers: cfg.headers }),
      }),
    ],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => ignored(req.url),
        requestHook: (span, request) => {
          // whoever learns what the request is about labels the transaction through `labelRequest`
          rememberServerSpan(span, request);
          if (cfg.captureHeaders) {
            const headers = 'getHeaders' in request ? request.getHeaders() : request.headers;
            span.setAttributes(headerAttributes('http.request.header', headers));
          }
          // the body of a write, so a request that failed can be replayed from its trace (see `captureBody`)
          // /auth/* — ніколи: у тілі входу пароль
          if (cfg.captureBody && !('url' in request && request.url?.startsWith('/auth/'))) captureBody(span, request);
        },
        ...(cfg.captureHeaders && {
          responseHook: (span: Span, response: IncomingMessage | ServerResponse) => {
            // для вхідних запитів хук викликається на старті, коли заголовків відповіді ще немає
            if ('getHeaders' in response)
              response.once('finish', () =>
                span.setAttributes(headerAttributes('http.response.header', response.getHeaders())),
              );
            else span.setAttributes(headerAttributes('http.response.header', response.headers));
          },
        }),
        // the exporter's own POSTs must not become spans, or every export would export itself
        ignoreOutgoingRequestHook: (req) => {
          const path = typeof req.path === 'string' ? req.path : '';
          return path.endsWith('/v1/traces') || path.endsWith('/v1/metrics');
        },
      }),
      // one span per route handler is plenty; every `expressInit` / `query` middleware is noise
      new ExpressInstrumentation({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE] }),
      new NestInstrumentation(),
      // no query parameters in spans: rows carry personal data, the SQL text alone is enough
      new PgInstrumentation({ enhancedDatabaseReporting: false, requireParentSpan: true }),
      // trace_id / span_id у кожному рядку логу (nestjs-pino)
      new PinoInstrumentation(),
      // event loop, GC, heap — метрики процесу
      new RuntimeNodeInstrumentation(),
      new UndiciInstrumentation({
        ignoreRequestHook: (req) => req.path.endsWith('/v1/traces') || req.path.endsWith('/v1/metrics'),
      }),
    ],
  });
  sdk.start();
  started = cfg;
  diag.info(
    `telemetry: ${cfg.serviceName} (${cfg.environment}) → ${cfg.tracesUrl}` +
      (cfg.traceSampleRatio !== null ? `, traces sampled at ${cfg.traceSampleRatio}` : ''),
  );
  return cfg;
}

const SECRET_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization']);

/** Заголовки → атрибути спану; сесійна cookie і авторизація маскуються. */
function headerAttributes(prefix: string, headers: IncomingHttpHeaders | OutgoingHttpHeaders): Attributes {
  const attrs: Attributes = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const key = name.toLowerCase();
    attrs[`${prefix}.${key}`] = SECRET_HEADERS.has(key) ? '***' : Array.isArray(value) ? value.map(String) : String(value);
  }
  return attrs;
}

/**
 * `ParentBased(TraceIdRatio(ratio))`: a root span is kept with the given probability; a request that
 * carries a `traceparent` follows it (the browser's own sampler, the BFF → API hop), so a trace is
 * kept or dropped whole.
 */
export function traceSampler(ratio: number): tracing.Sampler {
  return new tracing.ParentBasedSampler({ root: new tracing.TraceIdRatioBasedSampler(ratio) });
}

/**
 * The SERVER span of an incoming request — the document Elastic calls a transaction. Kept per
 * request so that code which knows what the request was ABOUT (which journal row, which report) can
 * put that on the transaction, and not on whatever child span happens to be active where it is
 * known. A label on a child span lands on a `span` document; «find the transactions that touched
 * this row» searches `transaction` documents.
 *
 * A `WeakMap` on the request object: nothing to clean up, and no way to leak into another request.
 */
const serverSpans = new WeakMap<object, Span>();

/** Called by the HTTP instrumentation for every incoming request; outgoing ones are not remembered. */
function rememberServerSpan(span: Span, request: IncomingMessage | ClientRequest): void {
  if ('headers' in request && 'method' in request && typeof (request as IncomingMessage).on === 'function')
    serverSpans.set(request as unknown as object, span);
}

/**
 * Puts labels on the transaction of this request — Elastic turns span attributes into `labels.*`,
 * replacing dots in the key, so `row.id` is searched as `labels.row_id`. `undefined` / `null`
 * values are skipped, and so is everything when telemetry is off or the request is not one of ours.
 */
export function labelRequest(
  request: unknown,
  labels: Record<string, string | number | boolean | null | undefined>,
): void {
  const span = request && typeof request === 'object' ? serverSpans.get(request as object) : undefined;
  if (!span) return;
  for (const [key, value] of Object.entries(labels))
    if (value !== null && value !== undefined && value !== '') span.setAttribute(key, value);
}

/** Writes, and only JSON / form / text bodies: a file upload or a protobuf export is not worth keeping. */
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BODY_TYPES = /^(application\/(json|x-www-form-urlencoded)|text\/)/i;
/**
 * What Elastic keeps of a string attribute: APM Server turns span attributes into `labels.*` and cuts
 * every value at 1024 characters (seen on prod: `POST /reports` bodies stopped at 1024–1028 whatever
 * the limit here). The label is only for finding a request by the start of its body.
 */
export const BODY_LABEL_CHARS = 1024;
/** Name of the attribute that marks the span event carrying the whole body. */
export const BODY_EVENT_KIND = 'http.request.body';

/**
 * `requestHook` of the HTTP instrumentation: listens to the incoming request's `data` events
 * (a listener only — the body parser downstream still gets every chunk) and, once the request ends,
 * puts the body on the span twice:
 *  - the WHOLE body as a span event — its name is the body text. APM Server stores span events as log
 *    documents (`logs-apm.app.<service>-*`, the name → `message`, a text field with no length cap),
 *    linked to the trace by `trace.id` / `span.id`, with `labels.body_kind = http.request.body`;
 *  - its first `BODY_LABEL_CHARS` characters as `http.request.body` (→ `labels.http_request_body`), to
 *    search for a request by the start of its body in the trace indices.
 * `max` bytes > 0 caps what is kept (`http.request.body_truncated`); 0 = the whole body, however long.
 * Server side only: the hook also fires for outgoing requests (ClientRequest), which have no `data`.
 *
 * The body is TAPPED, not read: the hook wraps the request's `emit` and copies the `data` chunks
 * whoever consumes the body is handed. A `data` listener would switch the stream to flowing mode at
 * once — fine while a body parser read every body straight away, but a body the BFF proxies through
 * unparsed is piped only after the session lookup (async), and chunks flowing before that would be
 * lost to the API. A body nobody reads is never captured (nor buffered).
 */
export function captureRequestBody(max = 0) {
  return (span: Span, request: IncomingMessage | ClientRequest): void => {
    if (
      !('method' in request) ||
      !('headers' in request) ||
      typeof (request as IncomingMessage).on !== 'function'
    )
      return;
    const req = request as IncomingMessage;
    if (!BODY_METHODS.has((req.method ?? '').toUpperCase())) return;
    const type = req.headers['content-type'] ?? '';
    if (!BODY_TYPES.test(type)) return;
    const limited = max > 0;
    const parts: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let done = false;
    const onData = (chunk: unknown) => {
      if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!limited) {
        parts.push(buf);
        size += buf.length;
        return;
      }
      if (size >= max) {
        if (buf.length > 0) truncated = true;
        return;
      }
      const room = max - size;
      if (buf.length > room) truncated = true;
      // a copy: the cut-off part of a large chunk must not keep the whole chunk alive
      parts.push(Buffer.from(buf.subarray(0, room)));
      size += Math.min(buf.length, room);
    };
    const onEnd = () => {
      if (size === 0) return;
      const body = Buffer.concat(parts, size).toString('utf8');
      parts.length = 0;
      // code points, not UTF-16 units; only the start is spread (the body may be megabytes when uncapped)
      const label = [...body.slice(0, BODY_LABEL_CHARS * 2)].slice(0, BODY_LABEL_CHARS).join('');
      span.setAttribute('http.request.body', label);
      span.setAttribute('http.request.body_size', size);
      if (truncated) span.setAttribute('http.request.body_truncated', true);
      span.addEvent(body, { 'body.kind': BODY_EVENT_KIND, 'body.size': size, 'body.truncated': truncated });
    };
    const emit = req.emit;
    req.emit = function tapBody(this: IncomingMessage, event: string | symbol, ...args: unknown[]): boolean {
      if (!done) {
        if (event === 'data') onData(args[0]);
        else if (event === 'end' || event === 'close' || event === 'error') {
          done = true;
          if (event === 'end') onEnd();
          else parts.length = 0;
        }
      }
      return (emit as (this: IncomingMessage, e: string | symbol, ...a: unknown[]) => boolean).call(
        this,
        event,
        ...args,
      );
    } as typeof req.emit;
  };
}

/** Flushes and stops the SDK; safe to call when nothing was started. Bounded by `SHUTDOWN_TIMEOUT_MS`. */
export async function stopTelemetry(): Promise<void> {
  const current = sdk;
  if (!current) return;
  sdk = null;
  started = null;
  await Promise.race([
    current.shutdown().catch((e: unknown) => diag.warn(`telemetry shutdown: ${(e as Error).message}`)),
    new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS).unref()),
  ]);
}

/** The config the running SDK was started with; `null` when telemetry is off. */
export function telemetryStatus(): TelemetryConfig | null {
  return started;
}
