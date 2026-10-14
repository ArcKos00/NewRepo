import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Поточний користувач (запит спільний з App — повторно не ходить на сервер). */
export const meQuery = { queryKey: ['me'], queryFn: api.me, retry: false, staleTime: Infinity } as const;

export function useMe() {
  return useQuery(meQuery).data;
}
