import type { UiEvent, UiEventBatch } from '@order-tracking/shared';

/**
 * Трасування дій у браузері для журналу: кліки по кнопках/посиланнях і переходи між сторінками.
 * Значення полів форм НЕ збираються — лише що натиснули і де. Події відправляються пакетами;
 * при закритті/приховуванні вкладки — через sendBeacon, щоб не губились.
 */

const URL_EVENTS = '/api/audit/events';
const FLUSH_MS = 3000;
const MAX_BATCH = 50;

/** Ідентифікатор вкладки: пов'язує кліки з діями на сервері (заголовок X-Tab-Id). */
export const tabId: string = (() => {
  const make = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 36);
  try {
    const saved = sessionStorage.getItem('tabId');
    if (saved) return saved;
    const id = make();
    sessionStorage.setItem('tabId', id);
    return id;
  } catch {
    return make();
  }
})();

let queue: UiEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let enabled = false;

const here = () => window.location.pathname + window.location.search;

function push(e: Omit<UiEvent, 'at' | 'path'> & { path?: string }) {
  if (!enabled) return;
  queue.push({ path: here(), ...e, at: new Date().toISOString() });
  if (queue.length >= MAX_BATCH) flush();
  else timer ??= setTimeout(flush, FLUSH_MS);
}

/** Відправляє накопичене. `beacon` — коли сторінка закривається. */
export function flush(beacon = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const body: UiEventBatch = { tabId, events: queue.splice(0, MAX_BATCH) };
  const json = JSON.stringify(body);
  if (beacon && navigator.sendBeacon?.(URL_EVENTS, new Blob([json], { type: 'application/json' }))) return;
  void fetch(URL_EVENTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tab-Id': tabId },
    body: json,
    keepalive: true,
  }).catch(() => undefined);
  if (queue.length) flush(beacon);
}

const CLICKABLE = 'button, a[href], summary, [role="button"], [data-audit], input[type="submit"], input[type="button"], input[type="checkbox"], input[type="radio"], tr.clickable';

const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

function labelOf(el: HTMLElement): string {
  if (el.dataset.audit) return el.dataset.audit;
  const aria = el.getAttribute('aria-label') ?? el.getAttribute('title');
  if (aria) return squash(aria);
  if (el instanceof HTMLInputElement) {
    const label = el.labels?.[0]?.textContent;
    const state = el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? ' ☐→☑' : ' ☑→☐') : '';
    return squash(label ?? el.value ?? el.name) + state;
  }
  // рядок таблиці — за першою клітинкою (№ договору)
  if (el instanceof HTMLTableRowElement) return `рядок ${squash(el.cells[0]?.textContent)}`;
  return squash(el.textContent) || el.tagName.toLowerCase();
}

function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(CLICKABLE);
  if (!el) return;
  const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') ?? undefined : undefined;
  push({ type: 'click', target: labelOf(el), href });
}

/** Вмикає трасування (після входу). Повторний виклик нічого не робить. */
export function startTracking() {
  if (enabled) return;
  enabled = true;
  // capture: бачимо клік раніше за React — підпис кнопки ще той, по якому клікнули
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush(true));
  window.addEventListener('pagehide', () => flush(true));
}

export function trackNavigation(path: string) {
  push({ type: 'navigate', path });
}
