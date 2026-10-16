import { useEffect, useState } from 'react';

/** Теми k2-styles, які пропонуємо. `system` — світла чи темна за налаштуванням системи. */
export const THEMES = [
  { id: 'system', name: 'Як у системі' },
  { id: 'light', name: 'Світла' },
  { id: 'dark', name: 'Темна' },
  { id: 'sand', name: 'Койот' },
] as const;
export type ThemeChoice = (typeof THEMES)[number]['id'];

// Той самий ключ і логіка — в inline-скрипті index.html (тема ставиться ще до першого кадру).
const KEY = 'theme';
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    if (THEMES.some((t) => t.id === saved)) return saved as ThemeChoice;
  } catch {
    // сховище недоступне (приватний режим) — тема лише на цей сеанс
  }
  return 'system';
}

function apply(choice: ThemeChoice) {
  document.documentElement.dataset.theme = choice === 'system' ? (dark().matches ? 'dark' : 'light') : choice;
}

/** Обрана тема (запам'ятовується в браузері); `system` стежить за зміною теми системи. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);
  useEffect(() => {
    apply(choice);
    if (choice !== 'system') return;
    const media = dark();
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  const choose = (next: ThemeChoice) => {
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // не запам'ятається — не страшно
    }
    setChoice(next);
  };
  return [choice, choose] as const;
}
