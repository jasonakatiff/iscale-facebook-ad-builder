import { APP_NAME, APP_LOGO, APP_TAGLINE } from '../lib/branding';

export function BrandMark({ compact = false }) {
    return (
        <span className="brand-lockup">
            <span className="brand-symbol">
                {import.meta.env.VITE_APP_LOGO ? (
                    <img
                        src={APP_LOGO}
                        alt={`${APP_NAME} logo`}
                        className="w-full h-full rounded-lg object-cover"
                    />
                ) : (
                    <span className="brand-monogram" aria-hidden="true">
                        b.
                    </span>
                )}
            </span>
            {!compact && (
                <span className="brand-wordmark">
                    {APP_NAME}
                    <span className="brand-caption">{APP_TAGLINE}</span>
                </span>
            )}
        </span>
    );
}
