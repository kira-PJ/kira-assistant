import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light';

/**
 * useTheme - Manages light/dark theme toggle.
 * Persists preference via ghostAPI config and applies data-theme attribute to <html>.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    // Load saved preference
    window.ghostAPI?.getConfig?.('theme').then((saved) => {
      const t = (saved as Theme) ?? 'dark';
      setThemeState(t);
      document.documentElement.setAttribute('data-theme', t);
    }).catch(() => {
      // Default dark
      document.documentElement.setAttribute('data-theme', 'dark');
    });
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    window.ghostAPI?.setConfig?.('theme', t);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
