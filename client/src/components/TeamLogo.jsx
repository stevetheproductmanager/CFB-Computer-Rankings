import React from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';

export default function TeamLogo({ src, alt, size = 24, style }) {
  const { theme } = useTheme();
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        borderRadius: 4,
        background: 'transparent',
        /* subtle contrast so color logos pop on any bg */
        filter: theme === 'dark'
          ? 'drop-shadow(0 0 1px rgba(0,0,0,0.35))'
          : 'drop-shadow(0 0 1px rgba(0,0,0,0.15))',
        ...style
      }}
    />
  );
}
