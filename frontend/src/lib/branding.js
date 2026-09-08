// White-label branding: one build, many clients. Values are baked at build time
// via Vite env vars, with theLeadRouter defaults.
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'theLeadRouter';
export const APP_LOGO =
    import.meta.env.VITE_APP_LOGO || '/leadrouter-mark.svg';
export const APP_TAGLINE =
    import.meta.env.VITE_APP_TAGLINE || 'Ad Builder & Manager';
export const APP_OPERATOR =
    import.meta.env.VITE_APP_OPERATOR || 'theLeadRouter.com';
export const APP_OPERATOR_URL =
    import.meta.env.VITE_APP_OPERATOR_URL || 'https://theleadrouter.com';
export const APP_ACCENT = import.meta.env.VITE_APP_ACCENT || '#295AD4';

export const APP_TITLE = `${APP_NAME} — ${APP_TAGLINE}`;
