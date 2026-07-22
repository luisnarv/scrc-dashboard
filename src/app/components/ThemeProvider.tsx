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
    // 10 slots: con 10 tipos de brigada el ciclo idx % length repetía el gris
    // en las posiciones 4 y 9. Ambas pasan a verde.
    series: ['#B5BD00', '#78BE20', '#509E2F', '#38764C', '#BCD08A',
             '#B5BD00', '#78BE20', '#509E2F', '#38764C', '#9CB86E']
  },
  dark: {
    sip: '#8FD14F',
    otc: '#509E2F',
    ok: '#509E2F',
    warn: '#B5BD00',
    err: '#C0392B',
    ink: '#EAF3E2',
    mut: '#9FB0A4',
    series: ['#B5BD00', '#78BE20', '#509E2F', '#38764C', '#BCD08A',
             '#B5BD00', '#78BE20', '#509E2F', '#38764C', '#9CB86E']
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
