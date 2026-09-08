import process from 'node:process';

/** @type {import('tailwindcss').Config} */

// White-label accent: VITE_APP_ACCENT (hex, e.g. #1877F2) at build time
// recolors every `amber-*` utility in one shot — no component edits needed.
// Defaults to the shared amber accent.
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
// ponytail: plain white/black mixing (not OKLCH) — perceptual drift at extreme
// shades is acceptable for a brand accent; move to culori if a client complains.
function shade(rgb, amount) {
  const mix = (channel) => (amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount));
  return rgbToHex(rgb.map(mix));
}

const accentHex = (process.env.VITE_APP_ACCENT || '#B45309').toLowerCase();
const accentRgb = hexToRgb(accentHex);

// 11-step ramp mirroring Tailwind's amber spacing (0=lightest, 1000=darkest)
const accent = {
  50: shade(accentRgb, 0.93),
  100: shade(accentRgb, 0.85),
  200: shade(accentRgb, 0.72),
  300: shade(accentRgb, 0.55),
  400: shade(accentRgb, 0.35),
  500: shade(accentRgb, 0.15),
  600: accentHex,
  700: shade(accentRgb, -0.15),
  800: shade(accentRgb, -0.3),
  900: shade(accentRgb, -0.45),
  950: shade(accentRgb, -0.6),
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: { amber: accent, ...Object.fromEntries(
        [
          'canvas',
          'panel',
          'elevated',
          'subtle',
          'inset',
          'soft',
          'foreground',
          'secondary',
          'muted',
          'faint',
          'line',
          'line-soft',
          'line-strong',
          'brand',
          'brand-hover',
          'brand-ink',
          'brand-soft',
          'brand-line',
          'success',
          'success-soft',
          'success-line',
          'danger',
          'danger-soft',
          'danger-line',
          'info',
          'info-soft',
          'info-line',
          'highlight',
          'highlight-soft',
          'highlight-line',
          'warning',
          'warning-soft',
          'warning-line',
        ].map((name) => [name, `rgb(var(--studio-${name}) / <alpha-value>)`]),
      ) },
      boxShadow: {
        sm: '0 1px 2px rgb(15 20 12 / 0.03)',
        lg: '0 10px 30px rgb(15 20 12 / 0.1)',
        xl: '0 16px 48px rgb(15 20 12 / 0.14)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [({ addBase }) => {
    if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(process.env.VITE_APP_ACCENT || '')) return;
    const channels = (amount) => hexToRgb(shade(accentRgb, amount)).join(' ');
    addBase({
      ':root': {
        '--studio-brand': channels(0), '--studio-brand-hover': channels(-0.15),
        '--studio-brand-ink': channels(-0.25), '--studio-brand-soft': channels(0.92),
        '--studio-brand-line': channels(0.65),
      },
      ':root[data-theme="dark"]': {
        '--studio-brand': channels(0), '--studio-brand-hover': channels(0.1),
        '--studio-brand-ink': channels(0.55), '--studio-brand-soft': channels(-0.65),
        '--studio-brand-line': channels(-0.25),
      },
    });
  }],
};
