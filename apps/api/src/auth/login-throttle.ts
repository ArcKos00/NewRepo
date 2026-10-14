import { HttpException, HttpStatus } from '@nestjs/common';
import { config } from '../config';

const WINDOW_MS = 15 * 60_000;

/** Проста in-memory відсічка перебору паролів: N невдалих спроб з IP за 15 хв → 429. */
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  private recent(ip: string) {
    const now = Date.now();
    const list = (this.failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (list.length) this.failures.set(ip, list);
    else this.failures.delete(ip);
    return list;
  }

  check(ip: string) {
    if (this.recent(ip).length >= config.auth.maxFailedLogins)
      throw new HttpException('Забагато невдалих спроб. Спробуйте пізніше.', HttpStatus.TOO_MANY_REQUESTS);
  }

  fail(ip: string) {
    this.failures.set(ip, [...this.recent(ip), Date.now()]);
  }

  reset(ip: string) {
    this.failures.delete(ip);
  }
}
