import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useInstallation } from '../context/InstallationContext';

export function InstallationGate({ children }) {
    const { state, loading, error, refresh } = useInstallation();
    const [retryError, setRetryError] = useState('');
    const location = useLocation();
    if (loading) return <p className="p-8 text-secondary" role="status">Preparing your workspace…</p>;
    if (error && !state) return <div className="studio-panel p-6 m-6" role="alert">
        <h1 className="text-xl font-semibold mb-2">We couldn’t check your setup</h1>
        <p className="text-secondary mb-4">{retryError || error}</p>
        <button className="studio-button" onClick={async () => {
            try { await refresh(); setRetryError(''); } catch (err) { setRetryError(err.message); }
        }}>Try again</button>
    </div>;
    if (state?.setup_required && location.pathname === '/') return <Navigate to="/setup" replace />;
    return children;
}
