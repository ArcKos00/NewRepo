import { useQuery } from '@tanstack/react-query';
import type { CurrentUser } from '@order-tracking/shared';
import { api, ApiError } from './api';

/** Поточний користувач; null — не увійшов (лише перегляд). Запит спільний з App — повторно не ходить на сервер. */
export const meQuery = {
  queryKey: ['me'],
  queryFn: (): Promise<CurrentUser | null> =>
    api.me().catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }),
  retry: false,
  staleTime: Infinity,
} as const;

export function useMe() {
  return useQuery(meQuery).data;
}

/** Адреса входу з поверненням на поточну сторінку. */
export const loginHref = (back: string) => `/login?returnTo=${encodeURIComponent(back)}`;
