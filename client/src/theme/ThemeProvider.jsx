import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ThemeCtx = createContext({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }) {
  const getInitial = () => {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  };

  const [theme, setTheme] = useState(getInitial);

  // Apply theme to <html data-theme="...">
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Respond to OS setting if user hasn’t chosen explicitly
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e) => {
      const stored = localStorage.getItem('theme');
      if (!stored) setTheme(e.matches ? 'light' : 'dark');
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  const toggle = useCallback(() => setTheme(t => (t === 'light' ? 'dark' : 'light')), []);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
