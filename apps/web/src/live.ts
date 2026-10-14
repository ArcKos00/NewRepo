import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { LiveEvent } from '@order-tracking/shared';

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/** Відкритий зараз перегляд договору (/contracts/5), а не форма. */
const viewedContract = (path: string) => Number(path.match(/^\/contracts\/(\d+)$/)?.[1]) || null;

/**
 * Списки перечитуємо одразу. Договір — лише якщо його зараз переглядають: форми (редагування,
 * поставка, недопоставка) беруть дані один раз, і підміна під час набору їм не потрібна —
 * там дані лише позначаються застарілими і перечитаються при наступному відкритті.
 */
function refresh(qc: QueryClient, path: string, contractId: number | null) {
  qc.invalidateQueries({ queryKey: ['contracts'] });
  qc.invalidateQueries({ queryKey: ['deliveries'] });
  qc.invalidateQueries({ queryKey: ['counterparties'] });
  qc.invalidateQueries({ queryKey: contractId ? ['contract', contractId] : ['contract'], refetchType: 'none' });
  const viewed = viewedContract(path);
  if (viewed && (contractId === null || contractId === viewed)) {
    qc.refetchQueries({ queryKey: ['contract', viewed], type: 'active' });
  }
}

/** Живі оновлення (SSE /api/events): нове чи змінене кимось — одразу видно в усіх вкладках. */
export function useLiveUpdates(enabled: boolean) {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let timer: number | undefined;
    let delay = RETRY_MIN_MS;
    let connectedBefore = false;

    const connect = () => {
      source = new EventSource('/api/events');
      source.onopen = () => {
        // Поки з'єднання не було, події могли пройти повз — перечитуємо все.
        if (connectedBefore) refresh(qc, path.current, null);
        connectedBefore = true;
        delay = RETRY_MIN_MS;
      };
      source.onmessage = (e) => {
        let event: LiveEvent;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }
        refresh(qc, path.current, event.type === 'contract' ? event.contractId : null);
      };
      source.onerror = () => {
        // Обрив мережі браузер перепідключає сам; закрите з'єднання (401, 502...) — ми, з паузою.
        if (source?.readyState !== EventSource.CLOSED) return;
        source.close();
        timer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, RETRY_MAX_MS);
      };
    };
    connect();
    return () => {
      window.clearTimeout(timer);
      source?.close();
    };
  }, [enabled, qc]);
}
