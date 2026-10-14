import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import { config } from '../config';
import { DEV_USER, SessionRequest, SessionUser } from '../auth/session';

/** Хто і звідки робить запит — пишеться в кожен запис журналу. */
export interface AuditContext {
  actorId: string | null;
  actor: string | null;
  ip: string | null;
  userAgent: string | null;
  tabId: string | null;
  traceId: string | null;
}

/** Користувач діючої сесії; null — не увійшов або вхід прострочено. */
export function currentUser(req: SessionRequest): SessionUser | null {
  if (config.authDisabled) return { ...DEV_USER, admin: config.devUserAdmin };
  const s = req.session;
  return s?.user && s.expiresAt && s.expiresAt > Date.now() ? s.user : null;
}

export const actorName = (u: SessionUser) => (u.displayName ? `${u.displayName} (${u.username})` : u.username);

const clip = (s: unknown, n: number) => (typeof s === 'string' && s ? s.slice(0, n) : null);

/** Trace id поточного запиту в APM — щоб із журналу перейти до трейсу. */
export function currentTraceId(): string | null {
  const ctx = trace.getActiveSpan()?.spanContext();
  return ctx && isSpanContextValid(ctx) ? ctx.traceId : null;
}

export function auditContext(req: SessionRequest, tabId?: unknown): AuditContext {
  const user = currentUser(req);
  return {
    actorId: user?.id ?? null,
    actor: user ? actorName(user) : null,
    // за ingress (trust proxy) — адреса клієнта з X-Forwarded-For
    ip: req.ip ?? null,
    userAgent: clip(req.get('user-agent'), 500),
    tabId: clip(tabId ?? req.get('x-tab-id'), 64),
    traceId: currentTraceId(),
  };
}

/** `@Ctx() ctx: AuditContext` у контролері. */
export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  auditContext(ctx.switchToHttp().getRequest<SessionRequest>()),
);
