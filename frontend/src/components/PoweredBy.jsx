import { APP_OPERATOR, APP_OPERATOR_URL } from '../lib/branding';

export function PoweredBy({ className = '' }) {
    return (
        <a
            className={`powered-by ${className}`}
            href={APP_OPERATOR_URL}
            target="_blank"
            rel="noopener noreferrer"
        >
            Powered by <strong>{APP_OPERATOR}</strong>
        </a>
    );
}
