import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace(/\/api\/v1\/?$/, '/api/v2');
export const WORKSPACE_STATUS_POLL_MS = 30000;
export const WORKSPACE_JOB_POLL_MS = 2000;

export async function workspaceRequest(authFetch, path, options = {}, baseUrl = API_URL) {
    const response = await authFetch(`${baseUrl}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!response.ok) {
        let message = response.status === 403 || response.status === 404
            ? 'Access is unavailable. Check your workspace and account permissions.'
            : 'Unable to complete this request. Try again.';
        let details = null;
        let code = null;
        if (response.text && response.status !== 403 && response.status !== 404) {
            try {
                const body = JSON.parse(await response.text());
                if (typeof body.error?.message === 'string') message = body.error.message;
                details = body.error?.details || null;
                code = body.error?.code || null;
            } catch {
                message = 'Unable to complete this request. Try again.';
            }
        }
        const error = new Error(message);
        error.details = details;
        error.code = code;
        error.status = response.status;
        throw error;
    }
    return response.json();
}

export async function listWorkspaceRows(api, path, options) {
    const rows = [];
    for (let offset = 0; ; offset += 100) {
        const result = await api(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`, options);
        rows.push(...result.data);
        if (!result.pagination.hasMore) return rows;
        if (!result.data.length) throw new Error('The list changed while loading. Try again.');
    }
}

export function useWorkspaceApi(baseUrl = API_URL) {
    const { authFetch } = useAuth();
    const fetchRef = useRef(authFetch);
    useEffect(() => { fetchRef.current = authFetch; }, [authFetch]);
    return useCallback((path, options) => workspaceRequest(fetchRef.current, path, options, baseUrl), [baseUrl]);
}

export function useWorkspaceData(api, path, { all = false, poll = true } = {}) {
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState({ path: null, data: null, error: '', loading: true });
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        if (!path) return;
        const controller = new AbortController();
        let timer;
        const read = async () => {
            let delay = WORKSPACE_STATUS_POLL_MS;
            try {
                const options = { signal: controller.signal };
                const data = all ? await listWorkspaceRows(api, path, options) : await api(path, options);
                if (controller.signal.aborted) return;
                setState({ path, revision, data, error: '', loading: false });
                if (['queued', 'running'].includes(data.sync?.status)) delay = WORKSPACE_JOB_POLL_MS;
            } catch (error) {
                if (controller.signal.aborted) return;
                setState({ path, revision, data: null, error: error.message || 'Unable to load data.', loading: false });
            }
            if (poll && !controller.signal.aborted) timer = setTimeout(read, delay);
        };
        read();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [api, path, all, poll, revision]);
    const current = !path ? { data: null, error: '', loading: false }
        : state.path === path ? { ...state, loading: state.revision !== revision } : { data: null, error: '', loading: true };
    return { ...current, reload };
}
