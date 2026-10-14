import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError, from, mergeMap, Observable, throwError } from 'rxjs';
import type { SessionRequest } from '../auth/session';
import { auditContext } from './audit-context';
import { AuditService } from './audit.service';

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BODY_MAX = 8 * 1024;

/** contracts/5/..., deliveries/7 → що це за сутність і до якого договору */
export function entityOfPath(path: string) {
  const contract = path.match(/\/contracts\/(\d+)/);
  const delivery = path.match(/\/deliveries\/(\d+)/);
  return {
    contractId: contract ? Number(contract[1]) : null,
    entityType: delivery ? 'delivery' : contract ? 'contract' : null,
    entityId: delivery ? Number(delivery[1]) : contract ? Number(contract[1]) : null,
  };
}

/** Тіло запиту для журналу: JSON — як є (з обмеженням розміру), файл — лише ім'я і розмір. */
function bodyOf(req: SessionRequest & { file?: Express.Multer.File }) {
  const file = req.file ? { name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), size: req.file.size } : undefined;
  let body: unknown = req.body;
  const text = body === undefined ? '' : JSON.stringify(body);
  if (text.length > BODY_MAX) body = { truncated: true, start: text.slice(0, BODY_MAX) };
  return { body, file };
}

/**
 * Невдалі спроби змінити дані (422, 404, 409, 500...) — теж у журнал: видно, хто намагався
 * видалити чи змінити і що саме відповів сервер. Успішні зміни пишуть самі сервіси (з описом і знімками).
 */
@Injectable()
export class AuditFailuresInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<SessionRequest>();
    // Лише API даних: /auth/* не пишемо (у тілі входу — пароль), /api/audit/* — щоб журнал не писав сам себе.
    if (!WRITE.has(req.method) || !req.path.startsWith('/api/') || req.path.startsWith('/api/audit/')) return next.handle();
    return next.handle().pipe(
      catchError((err: unknown) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        const response = err instanceof HttpException ? err.getResponse() : undefined;
        const message =
          (typeof response === 'object' && response && 'message' in response && typeof response.message === 'string'
            ? response.message
            : (err as Error)?.message) ?? 'помилка';
        const errors = typeof response === 'object' && response && 'errors' in response ? response.errors : undefined;
        const record = this.audit.recordSafe(auditContext(req), {
          action: 'request.failed',
          success: false,
          ...entityOfPath(req.path),
          summary: `Невдала спроба ${req.method} ${req.path} → ${status}: ${message}`,
          details: { method: req.method, path: req.originalUrl, status, message, errors, ...bodyOf(req) },
        });
        // відповідь із помилкою — лише після запису в журнал
        return from(record).pipe(mergeMap(() => throwError(() => err)));
      }),
    );
  }
}
