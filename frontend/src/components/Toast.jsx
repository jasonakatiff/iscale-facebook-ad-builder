import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
export default function Toast({ id, type = 'info', message, onClose }) {
    const Icon = icons[type] || Info;
    return (
        <div
            className="studio-toast animate-slide-in"
            data-type={type}
            role={type === 'error' ? 'alert' : 'status'}
        >
            <Icon className="shrink-0 mt-0.5" size={17} />
            <p className="flex-1 min-w-0 break-words leading-relaxed">{message}</p>
            <button
                type="button"
                onClick={() => onClose(id)}
                className="shrink-0 text-muted hover:text-foreground"
                aria-label="Close notification"
            >
                <X size={15} />
            </button>
        </div>
    );
}
