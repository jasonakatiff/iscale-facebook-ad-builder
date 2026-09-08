import { useWorkspaceApi } from './workspaceApi';
export const API_BASE = (
    import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
).replace(/\/$/, '');
export const API_ORIGIN = API_BASE.replace(/\/api\/v1$/, '');
export function usePlatformApi() {
    return useWorkspaceApi(API_BASE);
}
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
