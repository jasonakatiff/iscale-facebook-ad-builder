import React, { createContext, useContext, useState, useCallback } from 'react';
import Toast from '../components/Toast';
import { reportBrowserEvent } from '../lib/telemetry';

const ToastContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback(
        (message, type = 'info', duration = 5000) => {
            const id = Date.now() + Math.random();
            setToasts((prev) => [...prev, { id, message, type }]);

            if (duration > 0) {
                setTimeout(() => {
                    removeToast(id);
                }, duration);
            }

            return id;
        },
        [removeToast],
    );

    const showSuccess = useCallback(
        (message, duration) => {
            return showToast(message, 'success', duration);
        },
        [showToast],
    );

    const showError = useCallback(
        (message, duration) => {
            const reference = reportBrowserEvent('browser.toast', { level: 'error', message: String(message) });
            return showToast(`${message} (Reference: ${reference})`, 'error', duration);
        },
        [showToast],
    );

    const showWarning = useCallback(
        (message, duration) => {
            return showToast(message, 'warning', duration);
        },
        [showToast],
    );

    const showInfo = useCallback(
        (message, duration) => {
            return showToast(message, 'info', duration);
        },
        [showToast],
    );

    const value = {
        showToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        removeToast,
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            {/* Toast Container */}
            <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none [&>*]:pointer-events-auto">
                {toasts.map((toast) => (
                    <Toast
                        key={toast.id}
                        id={toast.id}
                        type={toast.type}
                        message={toast.message}
                        onClose={removeToast}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
};
