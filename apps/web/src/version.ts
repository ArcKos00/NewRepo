import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';

/** Збірка цієї вкладки (vite.config.ts); 'dev' — vite dev server. */
declare const __BUILD_ID__: string;

let outdated = false;
const listeners = new Set<() => void>();

/** Сервер віддає свою збірку в X-App-Build; інша — вкладка застаріла (після викатки). */
export function checkBuild(res: Response) {
  const server = res.headers.get('X-App-Build');
  if (outdated || !server || __BUILD_ID__ === 'dev' || server === __BUILD_ID__) return;
  outdated = true;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Вийшла нова збірка: true, і при наступному переході між сторінками вкладка перезавантажується
 * (вже на новій адресі) — так недозаповнена форма не пропаде посеред набору.
 */
export function useOutdated() {
  const isOutdated = useSyncExternalStore(subscribe, () => outdated);
  const { pathname } = useLocation();
  const first = useRef(pathname);
  useEffect(() => {
    if (isOutdated && pathname !== first.current) window.location.reload();
    first.current = pathname;
  }, [isOutdated, pathname]);
  return isOutdated;
}
