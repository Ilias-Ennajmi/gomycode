'use client';

import { useCallback, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY, type Theme } from '@/core/theme';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === 'dark' || current === 'light') setThemeState(current);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // localStorage unavailable (private mode, etc.) - theme just won't persist.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
