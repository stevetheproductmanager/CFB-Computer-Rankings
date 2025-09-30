import React from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';

export default function ThemeToggle({ className, style }) {
  const { theme, toggle } = useTheme();
  return (
    <button className={`btn ${className||''}`} style={style} onClick={toggle} title="Toggle theme">
      {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
    </button>
  );
}
