import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from 'react';

import {
    BUILTIN_SKINS,
    SKIN_STORAGE_KEY,
    applySkinTokens,
    validateSkin,
    themeDocument,
} from '../lib/skins';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'breadwinner:appearance';
const normalize = (value) =>
    ['light', 'dark', 'system'].includes(value) ? value : 'system';

function storedPreference() {
    try {
        return normalize(localStorage.getItem(STORAGE_KEY));
    } catch {
        return 'system';
    }
}

export function ThemeProvider({ children }) {
    const [skin, updateSkin] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(SKIN_STORAGE_KEY));
            if (saved)
                return {
                    ...validateSkin(themeDocument(saved)),
                    id: saved.id || 'custom',
                };
        } catch {
            /* Invalid local skin falls back to the default. */
        }
        return BUILTIN_SKINS[0];
    });
    const [preference, updatePreference] = useState(storedPreference);
    const [systemDark, setSystemDark] = useState(
        () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    );
    const resolvedTheme =
        preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

    useLayoutEffect(() => {
        const root = document.documentElement;
        applySkinTokens(root, skin, resolvedTheme);
        root.dataset.theme = resolvedTheme;
        root.style.colorScheme = resolvedTheme;
        root.classList.toggle('dark', resolvedTheme === 'dark');
    }, [resolvedTheme, skin]);

    useEffect(() => {
        const query = window.matchMedia('(prefers-color-scheme: dark)');
        const change = (event) => setSystemDark(event.matches);
        const storage = (event) => {
            if (event.key === STORAGE_KEY || event.key === null)
                updatePreference(normalize(event.newValue));
        };
        query.addEventListener('change', change);
        window.addEventListener('storage', storage);
        return () => {
            query.removeEventListener('change', change);
            window.removeEventListener('storage', storage);
        };
    }, []);

    const setPreference = useCallback((value) => {
        const next = normalize(value);
        updatePreference(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Appearance still works for this tab when browser storage is blocked.
        }
    }, []);
    const setSkin = useCallback((next) => {
        const document = {
            ...validateSkin(themeDocument(next)),
            id: next.id || 'custom',
        };
        updateSkin(document);
        try {
            localStorage.setItem(SKIN_STORAGE_KEY, JSON.stringify(document));
        } catch {
            /* Selection still works in this tab. */
        }
    }, []);
    const value = useMemo(
        () => ({ preference, resolvedTheme, setPreference, skin, setSkin }),
        [preference, resolvedTheme, setPreference, skin, setSkin],
    );
    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme requires ThemeProvider');
    return context;
}
