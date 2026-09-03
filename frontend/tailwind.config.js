/** @type {import('tailwindcss').Config} */

// White-label accent: VITE_APP_ACCENT (hex, e.g. #1877F2) at build time
// recolors every `amber-*` utility in one shot — no component edits needed.
// Defaults to the Nalarin amber so the current instance is unchanged.
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
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        amber: accent,
      },
    },
  },
  plugins: [],
}
