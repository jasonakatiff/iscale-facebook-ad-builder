import { useEffect, useId, useRef, useState } from 'react';
import { Trash2, X, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Delete',
    cancelText = 'Cancel',
    isDestructive = true,
    icon: iconComponent = Trash2,
}) {
    const Icon = iconComponent;
    const dialog = useRef(null);
    const cancelButton = useRef(null);
    const label = useId();
    const description = useId();
    const [pending, setPending] = useState(false);
    const { showError } = useToast();
    useEffect(() => {
        if (!isOpen) return;
        const node = dialog.current;
        const previousFocus = document.activeElement;
        node.showModal();
        cancelButton.current?.focus();
        return () => {
            if (node.open) node.close();
            previousFocus?.focus();
        };
    }, [isOpen]);
    if (!isOpen) return null;
    const confirm = async () => {
        if (pending) return;
        setPending(true);
        try {
            await onConfirm();
            onClose();
        } catch (error) {
            showError(error.message || 'Unable to complete this action.');
        } finally {
            setPending(false);
        }
    };
    return (
        <dialog
            ref={dialog}
            className="studio-dialog"
            aria-labelledby={label}
            aria-describedby={description}
            onKeyDown={(event) => {
                if (event.key !== 'Tab') return;
                const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
                const first = controls[0],
                    last = controls.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }}
            onCancel={(event) => {
                event.preventDefault();
                if (!pending) onClose();
            }}
            onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                if (
                    !pending &&
                    (event.clientX < rect.left ||
                        event.clientX > rect.right ||
                        event.clientY < rect.top ||
                        event.clientY > rect.bottom)
                )
                    onClose();
            }}
        >
            <div className="flex items-start justify-between mb-5">
                <span
                    className={`w-10 h-10 rounded-xl grid place-items-center ${isDestructive ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand-ink'}`}
                >
                    <Icon size={20} />
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={pending}
                    className="icon-button"
                    aria-label="Close confirmation"
                >
                    <X size={18} />
                </button>
            </div>
            <h2 id={label} className="text-lg font-semibold">
                {title}
            </h2>
            <p id={description} className="text-sm text-muted mt-3 leading-relaxed">
                {message}
            </p>
            <div className="flex justify-end gap-3 mt-7">
                <button
                    type="button"
                    ref={cancelButton}
                    onClick={onClose}
                    disabled={pending}
                    className="studio-button"
                >
                    {cancelText}
                </button>
                <button
                    type="button"
                    disabled={pending}
                    onClick={confirm}
                    className={`studio-button ${isDestructive ? '!bg-red-700 hover:!bg-red-800 !border-transparent !text-white' : 'primary'}`}
                >
                    {pending && <Loader2 size={14} className="animate-spin" />}
                    {pending ? 'Working…' : confirmText}
                </button>
            </div>
        </dialog>
    );
}
