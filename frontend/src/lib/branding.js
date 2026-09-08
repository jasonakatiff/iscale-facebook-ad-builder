// White-label branding: one build, many clients. Values are baked at build time
// via Vite env vars, with BreadWinner defaults.
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'BreadWinner';
export const APP_LOGO =
    import.meta.env.VITE_APP_LOGO || '/breadwinner_logo.png';
export const APP_TAGLINE =
    import.meta.env.VITE_APP_TAGLINE || 'by theLeadRouter.com';
export const APP_OPERATOR =
    import.meta.env.VITE_APP_OPERATOR || 'theLeadRouter.com';
export const APP_OPERATOR_URL =
    import.meta.env.VITE_APP_OPERATOR_URL || 'https://theleadrouter.com';
export const APP_ACCENT = import.meta.env.VITE_APP_ACCENT || '#295AD4';

export const APP_TITLE = `${APP_NAME} by ${APP_OPERATOR}`;
