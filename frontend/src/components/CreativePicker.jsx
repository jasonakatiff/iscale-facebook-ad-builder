import { useCallback, useEffect, useState, useRef } from 'react';
import { Upload, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConfirmationModal from './ConfirmationModal';
import { creativeRequest, campaignCreative, sourceLabel, CREATIVE_FIELDS } from '../lib/creatives';

const fieldClass = 'w-full border border-line-strong rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500';

export function CreativePicker({ selected, onChange, onBusyChange }) {
    const { user } = useAuth();
    const { showError, showSuccess } = useToast();
    const [search, setSearch] = useState('');
    const [source, setSource] = useState('');
    const [mine, setMine] = useState(false);
    const [offset, setOffset] = useState(0);
    const [library, setLibrary] = useState(null);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    const [busy, setBusy] = useState('');
    const [editing, setEditing] = useState(null);
    const metadataDialog = useRef(null);
    const metadataOpen = !!editing;
    useEffect(() => {
        if (!metadataOpen) return;
        const dialog = metadataDialog.current;
        const previous = document.activeElement;
        dialog.showModal();
        return () => { if (dialog.open) dialog.close(); previous?.focus(); };
    }, [metadataOpen]);
    const [draft, setDraft] = useState(null);
    const [archive, setArchive] = useState(null);
    const [saving, setSaving] = useState(false);
    const [history, setHistory] = useState([]);
    const [historyError, setHistoryError] = useState('');
    useEffect(() => { onBusyChange?.(!!busy); }, [busy, onBusyChange]);
    useEffect(() => {
        if (!editing) return;
        const controller = new AbortController();
        const load = async () => {
            try {
                const result = await creativeRequest(`/${editing.id}/events`, { signal: controller.signal });
                if (!controller.signal.aborted) { setHistory(result.data || []); setHistoryError(''); }
            } catch (failure) {
                if (!controller.signal.aborted) setHistoryError(failure.message);
            }
        };
        load();
        return () => controller.abort();
    }, [editing]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setLibrary(null);
            try {
                const query = new URLSearchParams({ search, limit: '12', offset: String(offset) });
                if (source) query.set('source_type', source);
                if (mine && user?.id) query.set('created_by_id', user.id);
                const data = await creativeRequest(`?${query}`, { signal: controller.signal });
                if (!controller.signal.aborted) { setLibrary(data); setError(''); }
            } catch (failure) {
                if (!controller.signal.aborted) setError(failure.message);
            }
        }, 200);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [search, source, mine, offset, user?.id, refresh]);

    const replaceSelected = useCallback(asset => {
        onChange(previous => {
            const item = campaignCreative(asset);
            return previous.some(value => value.id === asset.id)
                ? previous.map(value => value.id === asset.id ? item : value)
                : [...previous, item];
        });
    }, [onChange]);

    const analyze = async asset => {
        replaceSelected(asset);
        if (asset.analysis_status !== 'ready') {
            try {
                const ready = await creativeRequest(`/${asset.id}/analyze`, { method: 'POST' });
                replaceSelected(ready);
            } catch (failure) {
                replaceSelected({ ...asset, analysis_status: 'failed', analysis_error: failure.message });
                throw failure;
            }
        }
    };

    const selectAsset = async asset => {
        setBusy(asset.id);
        try { await analyze(asset); }
        catch (failure) { showError(failure.message); }
        finally { setBusy(''); setRefresh(value => value + 1); }
    };

    const upload = async files => {
        setBusy('upload');
        for (const file of files) {
            try {
                const form = new FormData();
                form.append('file', file);
                const asset = await creativeRequest('/uploads', { method: 'POST', body: form });
                await analyze(asset);
            } catch (failure) { showError(`${file.name}: ${failure.message}`); }
        }
        setBusy('');
        setRefresh(value => value + 1);
    };

    const saveMetadata = async () => {
        setSaving(true);
        try {
            const updated = await creativeRequest(`/${editing.id}`, { method: 'PATCH', body: { expected_revision: editing.metadata_revision, metadata: draft } });
            replaceSelected(updated);
            setEditing(updated);
            setDraft(updated.metadata);
            setRefresh(value => value + 1);
            showSuccess('Metadata saved with your user attribution');
        } catch (failure) { showError(failure.message); }
        finally { setSaving(false); }
    };

    const archiveAsset = async () => {
        setSaving(true);
        try {
            await creativeRequest(`/${archive.id}`, { method: 'DELETE' });
            onChange(previous => previous.filter(item => item.id !== archive.id));
            setArchive(null); setEditing(null); setRefresh(value => value + 1);
            showSuccess('Creative archived; launch history is retained');
        } catch (failure) { showError(failure.message); }
        finally { setSaving(false); }
    };

    return <section className="space-y-4" aria-label="Creative library">
        <div><h3 className="font-semibold text-primary">Choose creative</h3><p className="text-sm text-secondary">Use an ad made in the system or upload an external image or video. Metadata is analyzed before launch. Creator and launching user are tracked separately.</p></div>
        <label onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && event.dataTransfer.files.length) upload(Array.from(event.dataTransfer.files)); }} className={`flex items-center justify-center gap-3 border-2 border-dashed rounded-xl p-5 ${busy ? 'bg-surface-alt' : 'cursor-pointer hover:bg-brand-soft border-brand'}`}>
            <Upload size={22} className="text-brand-ink" /><span>Upload external creative <span className="block text-xs text-muted">Images up to 10 MB · Videos up to 500 MB</span></span>
            <input aria-label="Upload external creative" type="file" multiple disabled={!!busy} accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi,.webm" className="sr-only" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) upload(files); }} />
        </label>
        {busy && <p role="status" className="flex items-center gap-2 text-brand-ink"><Loader size={16} className="animate-spin" />Saving and analyzing creative… Videos can take several minutes.</p>}
        <div className="flex flex-wrap items-center gap-3">
            <input aria-label="Search creative" placeholder="Search creative by name" className={`${fieldClass} sm:max-w-xs`} value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} />
            <select aria-label="Creative source" className={`${fieldClass} sm:max-w-48`} value={source} onChange={event => { setSource(event.target.value); setOffset(0); }}><option value="">All sources</option><option value="system_generated">Made in system</option><option value="external_upload">External uploads</option></select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={event => { setMine(event.target.checked); setOffset(0); }} />Created / uploaded by me</label>
        </div>
        {error && <p role="alert" className="text-danger">{error} <button className="underline" onClick={() => setRefresh(value => value + 1)}>Retry library</button></p>}
        {!library && !error && <p role="status">Loading creative library…</p>}
        {library?.data.length === 0 && <p className="text-sm text-muted">No creative matches. Upload a file or save an ad from the image builder.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {library?.data.map(asset => {
                const chosen = selected.some(item => item.id === asset.id);
                return <button key={asset.id} type="button" disabled={!!busy || chosen} onClick={() => selectAsset(asset)} className={`text-left rounded-xl border overflow-hidden disabled:cursor-default ${chosen ? 'border-amber-600 ring-1 ring-amber-600' : 'border-line hover:border-amber-500'}`} aria-label={`${chosen ? 'Selected' : 'Select'} ${asset.name}`}>
                    {asset.media_type === 'video' ? <video src={asset.media_url} poster={asset.thumbnail_url || undefined} muted playsInline preload="metadata" className="w-full aspect-video object-cover bg-surface-alt" /> : <img src={asset.media_url} alt="" className="w-full aspect-video object-cover bg-surface-alt" loading="lazy" />}
                    <div className="p-3 space-y-1"><p className="text-sm font-medium truncate">{asset.name}</p><p className="text-xs text-brand-ink">{sourceLabel(asset.source_type)}</p><p className="text-xs text-muted truncate">{asset.created_by_name || 'Creator unknown'} · {asset.analysis_status === 'ready' ? 'Analyzed' : 'Needs analysis'}</p></div>
                </button>;
            })}
        </div>
        {library && <div className="flex justify-between text-sm"><button disabled={!offset} className="underline disabled:opacity-40" onClick={() => setOffset(value => Math.max(0, value - 12))}>Previous creative</button><span>{library.pagination.total} saved creatives</span><button disabled={!library.pagination.hasMore} className="underline disabled:opacity-40" onClick={() => setOffset(value => value + 12)}>Next creative</button></div>}
        {selected.length > 0 && <div className="border-t pt-4 space-y-3"><h4 className="font-medium">Selected creative ({selected.length})</h4>{selected.map(item => {
            const asset = item.asset;
            return <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-canvas border p-3">
                {item.mediaType === 'video' ? <video aria-label={item.name} src={item.previewUrl || item.videoUrl} controls preload="metadata" className="w-24 h-16 object-cover rounded" /> : <img src={item.previewUrl || item.imageUrl} alt={item.name} className="w-24 h-16 object-cover rounded" />}
                <div className="flex-1 min-w-40"><p className="font-medium text-sm">{item.name}</p><p className="text-xs text-secondary">{sourceLabel(asset?.source_type)} · {asset?.source_type === 'external_upload' ? 'Uploaded by' : 'Created by'} {asset?.created_by_name || 'unknown'} · {asset?.analysis_status === 'ready' ? `Analyzed · revision ${asset.metadata_revision}` : 'Analysis required'}</p>{asset?.analysis_error && <p role="alert" className="text-xs text-danger">{asset.analysis_error}</p>}</div>
                {asset?.analysis_status === 'ready' ? <button className="text-sm underline text-brand-ink" onClick={() => { setEditing(asset); setDraft(asset.metadata); }}>Metadata for {item.name}</button> : <button disabled={!!busy || !asset} className="text-sm underline disabled:opacity-40" onClick={() => selectAsset(asset)}>Retry analysis</button>}
                <button disabled={!!busy} aria-label={`Remove ${item.name}`} className="text-sm text-danger underline disabled:opacity-40" onClick={() => onChange(previous => previous.filter(value => value.id !== item.id))}>Remove</button>
            </div>;
        })}</div>}
        {editing && <dialog ref={metadataDialog} onCancel={event => { if (saving) event.preventDefault(); else setEditing(null); }} aria-label="Creative metadata" className="bg-surface text-primary rounded-xl shadow-xl p-6 w-[calc(100%_-_2rem)] max-w-2xl max-h-[90vh] overflow-y-auto space-y-4 backdrop:bg-black/40 backdrop:backdrop-blur-sm">
            <h3 className="text-xl font-semibold">Creative metadata</h3><p className="text-sm text-secondary">{editing.name} · {sourceLabel(editing.source_type)} · {editing.created_by_name || 'Creator unknown'}</p>
            <p className="text-xs text-muted">AI observations can be corrected. Changes are attributed to you; existing launches retain their saved revision.</p>
            <fieldset disabled={!editing.can_edit || saving} className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm">Talent format<select className={fieldClass} value={draft.talent_type || 'unknown'} onChange={event => setDraft({ ...draft, talent_type: event.target.value })}>{['unknown', 'none', 'single_presenter', 'multiple_presenters', 'voiceover', 'animated'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
                <label className="text-sm">Talent gender (supplied by you)<select className={fieldClass} value={draft.talent_gender || ''} onChange={event => setDraft({ ...draft, talent_gender: event.target.value || null })}><option value="">Unknown / not supplied</option>{['male', 'female', 'mixed', 'nonbinary'].map(value => <option key={value}>{value}</option>)}</select></label>
                {CREATIVE_FIELDS.map(([key, label]) => <label key={key} className="text-sm">{label}<input className={fieldClass} value={draft[key] || ''} maxLength={key === 'messaging_angle' ? 500 : 300} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
            </fieldset>
            {editing.generation_context?.template_id && <p className="text-xs text-muted">Source template is preserved with this creative.</p>}
            {!editing.can_edit && <p className="text-sm text-secondary">Only the creator or an admin can edit this metadata.</p>}
            <div className="border-t pt-3"><h4 className="text-sm font-medium">User history</h4>{historyError && <p role="alert" className="text-sm text-danger">{historyError}</p>}<ul className="text-xs text-secondary space-y-1 mt-2">{history.map(entry => <li key={entry.id}>{entry.action.replaceAll('_', ' ')} · {entry.actor_name || 'Unknown user'} · {new Date(entry.created_at).toLocaleString()}</li>)}</ul></div>
            <div className="flex flex-wrap justify-between gap-3">{editing.can_edit && <button disabled={saving} onClick={() => setArchive(editing)} className="text-danger underline text-sm">Archive creative</button>}<div className="flex gap-3 ml-auto"><button disabled={saving} onClick={() => setEditing(null)} className="px-4 py-2 border rounded-lg">Close metadata</button>{editing.can_edit && <button disabled={saving} onClick={saveMetadata} className="px-4 py-2 bg-brand text-white rounded-lg disabled:opacity-40">Save metadata</button>}</div></div>
        </dialog>}
        <ConfirmationModal isOpen={!!archive} title="Archive creative?" message={`${archive?.name || 'This creative'} will leave the library. Existing launches and attribution stay available.`} confirmText="Confirm archive" cancelText="Keep creative" onClose={() => setArchive(null)} onConfirm={archiveAsset} />
    </section>;
}
