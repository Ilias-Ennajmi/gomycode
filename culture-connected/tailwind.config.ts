import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        red: 'var(--red)',
        chip: 'var(--chip)',
        inv: 'var(--inv)',
        onInv: 'var(--onInv)',
        ph1: 'var(--ph1)',
        ph2: 'var(--ph2)',
      },
      fontFamily: {
        sora: ['var(--font-sora)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'monospace'],
        display: ['var(--font-display)', 'var(--font-sora)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        marq: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'marq-32': 'marq 32s linear infinite',
        'marq-30': 'marq 30s linear infinite',
      },
      borderRadius: {
        '2xl': '10px',
        '3xl': '14px',
      },
    },
  },
  plugins: [],
};

export default config;
