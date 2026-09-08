import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ShieldCheck, Link2 } from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../context/ToastContext';
import { useWorkspaceData } from '../lib/workspaceApi';

const ROLE_OPTIONS = [
    { id: 'viewer', name: 'Viewer' }, { id: 'creative_editor', name: 'Creative editor' },
    { id: 'buyer', name: 'Buyer' }, { id: 'publisher', name: 'Publisher' }, { id: 'admin', name: 'Admin' },
];
const SYNC_ROLES = ['buyer', 'publisher', 'admin'];
const accountOptions = rows => (rows || []).map(row => ({ id: row.id, name: `${row.account_name || 'Meta account'} · ${row.external_account_id}` }));
const personOptions = rows => (rows || []).map(row => ({ id: row.user_id, name: `${row.name || row.email}${row.name ? ` · ${row.email}` : ''}` }));
const timestamp = value => value ? new Date(value).toLocaleString() : 'Never';

export function WorkspaceLoadState({ resource }) {
    if (resource.loading) return <p role="status" className="text-sm text-muted py-3">Loading…</p>;
    if (!resource.error) return null;
    return <div role="alert" className="p-4 rounded-lg bg-danger-soft text-danger text-sm">
        <p>{resource.error}</p>
        <button className="studio-button mt-3" onClick={resource.reload}>Retry</button>
    </div>;
}

export function AccountSnapshotPanel({ api, account }) {
    const [offset, setOffset] = useState({ accountId: account.id, value: 0 });
    const pageOffset = offset.accountId === account.id ? offset.value : 0;
    const resource = useWorkspaceData(api, `/accounts/${account.id}/snapshot?limit=50&offset=${pageOffset}`);
    const [pending, setPending] = useState(false);
    const { showError, showSuccess } = useToast();
    const sync = resource.data?.sync;
    const busy = ['queued', 'running'].includes(sync?.status);
    const refresh = async () => {
        if (pending || busy) return;
        setPending(true);
        try {
            await api(`/accounts/${account.id}/sync`, { method: 'POST', body: JSON.stringify({ resource: 'campaigns' }) });
            showSuccess('Refresh requested for this account.');
            resource.reload();
        } catch (error) { showError(error.message); resource.reload(); }
        finally { setPending(false); }
    };
    return <section className="studio-panel p-5 space-y-5" aria-label="Account snapshot">
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="font-semibold">Campaign snapshot</h2>
                <p className="text-sm text-muted mt-1">Names, delivery status and objectives. Performance metrics are not included yet.</p></div>
            <div className="flex flex-wrap gap-2">
                <button className="studio-button" onClick={resource.reload} disabled={resource.loading}>Check status</button>
                {account.can_sync && <button className="studio-button primary" onClick={refresh}
                    disabled={pending || busy || resource.loading || !!resource.error || account.state !== 'connected'}>
                    <RefreshCw size={15} className={pending || busy ? 'animate-spin' : ''} />
                    {pending || busy ? 'Refresh in progress' : 'Refresh this account'}
                </button>}
            </div>
        </div>
        {!account.can_sync && <p className="text-sm text-muted">Read-only access. A buyer, publisher or admin with a refresh grant can update this account.</p>}
        {account.state !== 'connected' && <p role="status" className="text-sm text-warning">Meta access is unavailable. The connection owner must reconnect before refreshing. The last complete snapshot remains available.</p>}
        <WorkspaceLoadState resource={resource} />
        {sync && <>
            <dl className="grid sm:grid-cols-3 gap-4 text-sm border-y border-line py-4">
                <div><dt className="text-muted">Last successful refresh</dt><dd className="mt-1">{timestamp(sync.last_success_at)}</dd></div>
                <div><dt className="text-muted">Last attempt</dt><dd className="mt-1">{timestamp(sync.last_attempt_at)}</dd></div>
                <div><dt className="text-muted">Freshness</dt><dd className="mt-1">{sync.coverage === 'none' ? 'No snapshot yet' : sync.stale ? 'Stale · refresh needed' : 'Current · refreshed within 1 hour'}</dd></div>
            </dl>
            <div aria-live="polite" className="text-sm">
                {sync.status === 'queued' && <p>Waiting to start. You can leave this page; your refresh request is saved.</p>}
                {sync.status === 'running' && <p>Refreshing this account… The previous complete snapshot stays visible until the refresh finishes.</p>}
                {['failed', 'blocked'].includes(sync.status) && <p className="text-danger">Refresh {sync.status}. {sync.error?.message || 'Check account access and try again.'} The last complete snapshot has been preserved.</p>}
            </div>
            {!resource.data.data.length ? <p className="text-sm text-muted py-4">{sync.coverage === 'complete' ? 'No campaigns in the last complete refresh.' : 'No snapshot yet.'}</p> :
                <div className="overflow-x-auto"><table className="w-full text-sm text-left">
                    <caption className="sr-only">Campaigns for {account.account_name || account.external_account_id}</caption>
                    <thead className="text-muted border-b border-line"><tr>{['Campaign', 'Status', 'Delivery', 'Objective'].map(label => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}</tr></thead>
                    <tbody>{resource.data.data.map(row => <tr key={row.id} className="border-b border-line-soft">
                        <td className="p-3"><strong className="font-medium">{row.name || 'Unnamed campaign'}</strong><span className="block text-xs text-muted mt-1">{row.id}</span></td>
                        <td className="p-3">{row.status || '—'}</td><td className="p-3">{row.effective_status || '—'}</td><td className="p-3">{row.objective || '—'}</td>
                    </tr>)}</tbody>
                </table></div>}
            {(pageOffset > 0 || resource.data.pagination.hasMore) && <div className="flex items-center justify-end gap-3">
                <button className="studio-button" disabled={!pageOffset} onClick={() => setOffset({ accountId: account.id, value: Math.max(0, pageOffset - 50) })}>Previous campaigns</button>
                <span className="text-sm text-muted">Page {pageOffset / 50 + 1}</span>
                <button className="studio-button" disabled={!resource.data.pagination.hasMore} onClick={() => setOffset({ accountId: account.id, value: pageOffset + 50 })}>Next campaigns</button>
            </div>}
        </>}
    </section>;
}

function AccountGrants({ api, workspaceId, accountId, onChange }) {
    const resource = useWorkspaceData(api, `/workspaces/${workspaceId}/accounts/${accountId}/grants`, { all: true });
    const [selected, setSelected] = useState('');
    const [level, setLevel] = useState('read');
    const [pending, setPending] = useState(false);
    const [revoke, setRevoke] = useState(false);
    const { showError, showSuccess } = useToast();
    const target = resource.data?.find(row => row.user_id === selected);
    const save = async (active) => {
        if (!target || pending) return;
        setPending(true);
        try {
            await api(`/workspaces/${workspaceId}/accounts/${accountId}/grants/${selected}`, {
                method: 'PUT', body: JSON.stringify({ is_active: active, can_sync: active && level === 'sync' && SYNC_ROLES.includes(target.role) }),
            });
            showSuccess(active ? 'Account access saved.' : 'Account access revoked.');
            resource.reload(); onChange();
        } catch (error) { if (!active) throw error; showError(error.message); }
        finally { setPending(false); }
    };
    return <div className="space-y-4">
        <WorkspaceLoadState resource={resource} />
        {resource.data && <>
            <SearchableSelect label="Teammate account access" value={selected} options={personOptions(resource.data)} onChange={id => { setSelected(id); setLevel(resource.data.find(row => row.user_id === id)?.can_sync ? 'sync' : 'read'); }} />
            {target && <>
                <p className="text-sm text-muted">Current access: {target.is_active && target.member_active && target.user_active ? target.can_sync && SYNC_ROLES.includes(target.role) ? 'Read and refresh' : 'Read only' : 'No access'} · {ROLE_OPTIONS.find(row => row.id === target.role)?.name}</p>
                {target.member_active && target.user_active ? <>
                    <SearchableSelect label="Account permission" value={level} onChange={setLevel} options={[
                        { id: 'read', name: 'Read snapshots' }, ...(SYNC_ROLES.includes(target.role) ? [{ id: 'sync', name: 'Read and refresh snapshots' }] : []),
                    ]} />
                    <div className="flex flex-wrap gap-2"><button className="studio-button primary" disabled={pending || !level} onClick={() => save(true)}>Save account access</button>
                        {target.is_active && <button className="studio-button text-danger" disabled={pending} onClick={() => setRevoke(true)}>Revoke account access</button>}</div>
                </> : <p className="text-sm text-muted">Restore active workspace membership before granting account access.</p>}
            </>}
        </>}
        <ConfirmationModal isOpen={revoke} onClose={() => setRevoke(false)} onConfirm={() => save(false)} title="Revoke account access?" message="This teammate will lose snapshot access for this account. Their queued refreshes will be blocked." confirmText="Revoke access" />
    </div>;
}

function WorkspaceMembers({ api, workspaceId, isSuperuser, onChange }) {
    const members = useWorkspaceData(api, `/workspaces/${workspaceId}/members`, { all: true });
    const candidates = useWorkspaceData(api, isSuperuser ? `/workspaces/${workspaceId}/member-candidates` : null, { all: true });
    const [selected, setSelected] = useState('');
    const [role, setRole] = useState('viewer');
    const [pending, setPending] = useState(false);
    const [remove, setRemove] = useState(false);
    const { showError, showSuccess } = useToast();
    const rows = [...new Map([...(candidates.data || []), ...(members.data || [])].map(row => [row.user_id, row])).values()];
    const target = members.data?.find(row => row.user_id === selected);
    const lastAdmin = target?.is_active && target.role === 'admin' && members.data?.filter(row => row.is_active && row.role === 'admin').length === 1;
    const save = async active => {
        if (!selected || pending) return;
        setPending(true);
        try {
            await api(`/workspaces/${workspaceId}/members/${selected}`, { method: 'PUT', body: JSON.stringify({ role: active ? role : target.role, is_active: active }) });
            showSuccess(active ? 'Workspace membership saved.' : 'Workspace membership removed.');
            members.reload(); onChange();
        } catch (error) { if (!active) throw error; showError(error.message); }
        finally { setPending(false); }
    };
    return <section className="space-y-4" aria-label="Workspace members">
        <h3 className="font-medium">Workspace members</h3>
        <p className="text-sm text-muted">Membership sets the role. Account access is granted separately. Removing a connection owner also stops refreshes that use their Meta connection.</p>
        <WorkspaceLoadState resource={members} /><WorkspaceLoadState resource={candidates} />
        {!isSuperuser && <p className="text-sm text-muted">Manage existing teammates here. An application superuser can add other registered users.</p>}
        {members.data && <>
            <SearchableSelect label="Workspace teammate" value={selected} options={personOptions(rows)} onChange={id => { setSelected(id); setRole(members.data.find(row => row.user_id === id)?.role || 'viewer'); }} />
            {selected && <>
                <p className="text-sm text-muted">{target ? target.is_active ? 'Active workspace member' : 'Inactive workspace member' : 'Not yet a workspace member'}</p>
                <SearchableSelect label="Workspace role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
                {lastAdmin && <p className="text-sm text-muted">Keep at least one active workspace administrator.</p>}
                <div className="flex flex-wrap gap-2">
                    <button className="studio-button primary" disabled={pending || !role || (lastAdmin && role !== 'admin') || target?.user_active === false} onClick={() => save(true)}>Save membership</button>
                    {target?.is_active && <button className="studio-button text-danger" disabled={pending || lastAdmin} onClick={() => setRemove(true)}>Remove membership</button>}
                </div>
            </>}
        </>}
        <ConfirmationModal isOpen={remove} onClose={() => setRemove(false)} onConfirm={() => save(false)} title="Remove workspace membership?" message="This teammate will lose access to every account in this workspace. If they own a shared Meta connection, its refreshes will stop until their access is restored." confirmText="Remove membership" />
    </section>;
}

function WorkspaceAdministration({ api, workspace, isSuperuser, onChange }) {
    const personal = useWorkspaceData(api, '/meta-connections', { all: true });
    const managed = useWorkspaceData(api, `/workspaces/${workspace.id}/managed-connections`, { all: true });
    const [selected, setSelected] = useState('');
    const [managedId, setManagedId] = useState('');
    const [pending, setPending] = useState(false);
    const [revision, setRevision] = useState(0);
    const { showError, showSuccess } = useToast();
    const choices = (personal.data || []).filter(row => row.connected && !(managed.data || []).some(account => account.external_account_id === row.ad_account_id && account.state === 'connected'));
    const personalAccount = choices.find(row => row.id === selected);
    const reconnect = managed.data?.find(row => row.external_account_id === personalAccount?.ad_account_id);
    const reload = () => { managed.reload(); setRevision(value => value + 1); onChange(); };
    const register = async event => {
        event.preventDefault();
        if (!selected || pending) return;
        setPending(true);
        try {
            await api(`/workspaces/${workspace.id}/connections${reconnect ? `/${reconnect.id}` : ''}`, { method: reconnect ? 'PUT' : 'POST', body: JSON.stringify({ meta_connection_id: selected }) });
            setSelected(''); reload(); showSuccess(reconnect ? 'Workspace Meta account reconnected.' : 'Meta account shared with this workspace.');
        } catch (error) { showError(error.message); }
        finally { setPending(false); }
    };
    const managedAccount = managed.data?.find(row => row.id === managedId);
    return <section className="studio-panel p-5 space-y-6" aria-label="Workspace administration">
        <div><h2 className="font-semibold flex items-center gap-2"><ShieldCheck size={18} />Workspace administration</h2>
            <p className="text-sm text-muted mt-1">Sharing an account grants you access. Choose each additional teammate explicitly.</p></div>
        <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-4">
                <h3 className="font-medium">Share a Meta account</h3>
                <p className="text-sm text-muted">Use your personal Meta authorization. <Link className="underline text-brand-ink" to="/facebook-campaigns">Connect or reconnect Meta</Link>, then return here.</p>
                <WorkspaceLoadState resource={personal} /><WorkspaceLoadState resource={managed} />
                {personal.data && managed.data && <form onSubmit={register} className="space-y-3">
                    <SearchableSelect label="Personal Meta account" value={selected} options={choices.map(row => ({ id: row.id, name: `${row.account_name || 'Meta account'} · ${row.ad_account_id}` }))} onChange={setSelected} />
                    {!choices.length && <p className="text-sm text-muted">No additional usable personal Meta accounts. Existing shared accounts appear below.</p>}
                    <button className="studio-button" disabled={!personalAccount || pending}><Link2 size={15} />{reconnect ? 'Reconnect shared account' : 'Share account'}</button>
                </form>}
                <div className="border-t border-line pt-5 space-y-4">
                    <h3 className="font-medium">Account access</h3>
                    <p className="text-sm text-muted">All registered accounts appear here for administration. Reading their campaign snapshots still requires an account grant.</p>
                    {managed.data && <SearchableSelect label="Manage registered account" value={managedId} options={accountOptions(managed.data)} onChange={setManagedId} />}
                    {managedAccount && <AccountGrants key={`${managedId}:${revision}`} api={api} workspaceId={workspace.id} accountId={managedId} onChange={onChange} />}
                </div>
            </div>
            <WorkspaceMembers api={api} workspaceId={workspace.id} isSuperuser={isSuperuser} onChange={reload} />
        </div>
    </section>;
}

export function WorkspaceAccountView({ api, workspace, isSuperuser, onWorkspaceChange }) {
    const resource = useWorkspaceData(api, `/workspaces/${workspace.id}/connections`, { all: true });
    const [selected, setSelected] = useState('');
    const account = resource.data?.find(row => row.id === selected);
    const changed = () => { resource.reload(); onWorkspaceChange(); };
    return <div className="space-y-6">
        <section className="studio-panel p-5 space-y-4">
            <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Your shared accounts</h2><span className="text-sm text-muted">Workspace role: {ROLE_OPTIONS.find(row => row.id === workspace.role)?.name}</span></div>
            <WorkspaceLoadState resource={resource} />
            {resource.data && <>
                {resource.data.length ? <SearchableSelect label="Account to view or refresh" value={account?.id || ''} options={accountOptions(resource.data)} onChange={setSelected} /> : <p className="text-sm text-muted">No accounts are shared with you in this workspace.</p>}
                {!!resource.data.length && !account && <p className="text-sm text-muted">Select an account to view its last complete snapshot.</p>}
            </>}
        </section>
        {account && <AccountSnapshotPanel key={account.id} api={api} account={account} />}
        {workspace.role === 'admin' && <WorkspaceAdministration api={api} workspace={workspace} isSuperuser={isSuperuser} onChange={changed} />}
    </div>;
}
