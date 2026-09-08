const DATABASE = 'breadwinner-campaign-drafts';
const STORE = 'drafts';

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function transaction(key, mode, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request =
            mode === 'readonly'
                ? store.get(key)
                : value === null
                  ? store.delete(key)
                  : store.put(value, key);
        tx.oncomplete = () => {
            db.close();
            resolve(request.result);
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
        tx.onabort = () => {
            db.close();
            reject(tx.error || new Error('Draft storage was interrupted.'));
        };
    });
}

export function draftMetadata(state) {
    return {
        ...state,
        creativeData: {
            ...state.creativeData,
            creatives: state.creativeData.creatives.map((media) => {
                const { file: _file, previewUrl, ...creative } = media;
                return {
                    ...creative,
                    previewUrl: previewUrl?.startsWith('blob:') ? null : previewUrl,
                };
            }),
        },
    };
}

export async function saveCampaignDraft(key, state) {
    localStorage.setItem(key, JSON.stringify(draftMetadata(state)));
    await transaction(key, 'readwrite', state);
}

export async function loadCampaignDraft(key) {
    const metadata = localStorage.getItem(key);
    const stored = await transaction(key, 'readonly');
    const draft = metadata ? JSON.parse(metadata) : stored;
    if (!draft) return null;
    draft.creativeData.creatives = draft.creativeData.creatives.map((creative) => {
        const file = stored?.creativeData.creatives.find((item) => item.id === creative.id)?.file;
        return {
            ...creative,
            file: file || null,
            previewUrl: file ? URL.createObjectURL(file) : creative.previewUrl,
            needsUpload: !file && !creative.previewUrl && !creative.imageUrl && !creative.videoUrl,
        };
    });
    return draft;
}

export async function clearCampaignDraft(key) {
    localStorage.removeItem(key);
    await transaction(key, 'readwrite', null);
}
