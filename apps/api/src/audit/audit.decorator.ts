import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION = 'auditAction';

/**
 * Назва дії в журналі (audit_log.action), напр. "contract.create".
 * `false` — не записувати (службові запити на кшталт /auth/me).
 * Без декоратора дія називається "<Controller>.<method>".
 */
export const Audit = (action: string | false) => SetMetadata(AUDIT_ACTION, action);
