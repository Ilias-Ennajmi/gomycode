export const THEME_STORAGE_KEY = 'cc-theme';

export type Theme = 'light' | 'dark';

/**
 * Runs before React hydrates so the correct theme is painted first frame,
 * reading the persisted choice or falling back to prefers-color-scheme.
 * The prototype's `initPage()` only set this up after mount, causing a flash.
 */
export const themeInitScript = `(function(){try{var k='${THEME_STORAGE_KEY}';var stored=localStorage.getItem(k);var theme=(stored==='dark'||stored==='light')?stored:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme;}catch(e){}})();`;
