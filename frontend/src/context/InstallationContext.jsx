import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { usePlatformApi } from '../lib/platformApi';

const InstallationContext = createContext(null);

export function InstallationProvider({ children }) {
    const { user, isAuthenticated } = useAuth();
    const userId = user?.id;
    const api = usePlatformApi();
    const [snapshot, setSnapshot] = useState({ owner: null, data: null, error: '' });
    const identity = useRef(userId);
    useEffect(() => { identity.current = userId; }, [userId]);
    const refresh = useCallback(async () => {
        if (!isAuthenticated || !userId) return null;
        try {
            const result = await api('/installation');
            if (identity.current === userId) setSnapshot({ owner: userId, data: result, error: '' });
            return result;
        } catch (err) {
            if (identity.current === userId) setSnapshot({ owner: userId, data: null, error: err.message });
            throw err;
        }
    }, [api, isAuthenticated, userId]);
    useEffect(() => {
        // This starts an HTTP request; state changes only after the response.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        refresh().catch(() => {
            console.error('Installation status could not be loaded; use the displayed retry control.');
        });
    }, [refresh]);
    const update = useCallback(async (step, status = 'in_progress') => {
        const result = await api('/installation', { method: 'PATCH', body: JSON.stringify({ step, status }) });
        if (identity.current === userId) setSnapshot({ owner: userId, data: result, error: '' });
        return result;
    }, [api, userId]);
    const matches = snapshot.owner === userId;
    return <InstallationContext.Provider value={{ state: matches ? snapshot.data : null,
        loading: isAuthenticated && !matches, error: matches ? snapshot.error : '', refresh, update }}>
        {children}
    </InstallationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useInstallation() {
    const context = useContext(InstallationContext);
    if (!context) throw new Error('InstallationProvider is required.');
    return context;
}
