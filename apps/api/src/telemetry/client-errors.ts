/**
 * Exceptions that are an ANSWER to the caller, not a failure of the service. Nest's instrumentation
 * records every exception a handler throws, and Elastic makes an error document of each: in
 * production 597 «no session» and 148 «no such report» a day stood in the list of errors beside
 * the few that were real. The request itself keeps its status code (the transaction says 401 /
 * 404), so nothing is lost for whoever counts them — they just stop posing as breakage.
 *
 * By name, not by status: the exception event carries no status. `HttpException` itself is not
 * here — it is thrown with any status, a 502 among them.
 */
const CLIENT_ERRORS = new Set([
  'BadRequestException',
  'UnauthorizedException',
  'ForbiddenException',
  'NotFoundException',
  'MethodNotAllowedException',
  'NotAcceptableException',
  'RequestTimeoutException',
  'ConflictException',
  'GoneException',
  'PreconditionFailedException',
  'PayloadTooLargeException',
  'UnsupportedMediaTypeException',
  'UnprocessableEntityException',
]);

interface SpanEvent {
  name: string;
  attributes?: Record<string, unknown>;
}

/** An `exception` event of a span that records an answer of the 4xx kind. */
export function isClientError(event: SpanEvent): boolean {
  if (event.name !== 'exception') return false;
  const type = event.attributes?.['exception.type'];
  return typeof type === 'string' && CLIENT_ERRORS.has(type);
}

/**
 * Takes such events off a finished span, in place (the exporter reads the same array later).
 * Returns how many went. Never throws: telemetry must not break on a span of an odd shape.
 */
export function dropClientErrors(span: { events?: SpanEvent[] }): number {
  try {
    const events = span.events;
    if (!Array.isArray(events) || events.length === 0) return 0;
    let dropped = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      if (isClientError(events[i] as SpanEvent)) {
        events.splice(i, 1);
        dropped++;
      }
    }
    return dropped;
  } catch {
    return 0;
  }
}
