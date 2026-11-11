'use client';

import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="cursor-pointer border border-line bg-transparent px-[14px] py-[13px] font-inter text-[12px] font-medium text-ink md:py-[10px]"
    >
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}
