'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

export const THEME_COLORS = {
  light: {
    sip: '#78BE20',
    otc: '#38764C',
    ok: '#509E2F',
    warn: '#B5BD00',
    err: '#C0392B',
    ink: '#38764C',
    mut: '#97999B',
    series: [
      '#78BE20', '#38764C', '#B5BD00', '#97999B',
      '#78BE20', '#38764C', '#B5BD00', '#97999B'
    ]
  },
  dark: {
    sip: '#3B8AD9',
    otc: '#2BD98C',
    ok: '#2BD98C',
    warn: '#F0C040',
    err: '#FF5A5F',
    ink: '#F2F7FF',
    mut: '#85A3C4',
    series: [
      '#3B8AD9', '#2BD98C', '#4A9EE8', '#85A3C4',
      '#3B8AD9', '#2BD98C', '#4A9EE8', '#85A3C4'
    ]
  }
};

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  colors: typeof THEME_COLORS['light'];
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
  colors: THEME_COLORS.light,
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = localStorage.getItem('ises_theme') as Theme | null;
    if (saved && (saved === 'light' || saved === 'dark')) {
      setTheme(saved);
    } else {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
      }
    }
  }, []);

  useEffect(() => {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem('ises_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors: THEME_COLORS[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
}
