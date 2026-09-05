// White-label branding: one build, many clients. Values are baked at build time
// via Vite env vars; keep Nalarin defaults so the current instance stays unchanged.
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Nalarin Ads Studio';
export const APP_LOGO = import.meta.env.VITE_APP_LOGO || '/nalarin_ads_studio_logo.png';
export const APP_TAGLINE = import.meta.env.VITE_APP_TAGLINE || 'Paid media operations';
export const APP_OPERATOR = import.meta.env.VITE_APP_OPERATOR || 'Banyumedia';
export const APP_OPERATOR_URL = import.meta.env.VITE_APP_OPERATOR_URL || 'https://banyumedia.co.id';
export const APP_ACCENT = import.meta.env.VITE_APP_ACCENT || '#B45309';
