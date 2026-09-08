import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SearchableSelect } from '../components/SearchableSelect';
import { WorkspaceAccountView, WorkspaceLoadState } from '../components/WorkspaceConnections';
import { useWorkspaceApi, useWorkspaceData } from '../lib/workspaceApi';

export default function Connections() {
    const { user, hasRole } = useAuth();
    const { showError, showSuccess } = useToast();
    const api = useWorkspaceApi();
    const workspaces = useWorkspaceData(api, '/workspaces', { all: true });
    const [selected, setSelected] = useState('');
    const [name, setName] = useState('');
    const [pending, setPending] = useState(false);
    const workspace = workspaces.data?.find(row => row.id === selected);
    const create = async event => {
        event.preventDefault();
        if (!name.trim() || pending) return;
        setPending(true);
        try {
            const created = await api('/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
            setSelected(created.id); setName(''); workspaces.reload(); showSuccess('Workspace created.');
        } catch (error) { showError(error.message); }
        finally { setPending(false); }
    };
    return <div className="space-y-6">
        <header className="studio-page-header"><div><h1 className="studio-heading">Connections</h1><p className="studio-description">Choose the accounts your team uses and control who can refresh them.</p></div></header>
        <section className="studio-panel p-5 flex flex-wrap justify-between items-center gap-3" aria-label="Native LeadRouter integration">
            <div><h2 className="font-semibold">LeadRouter · Built in</h2><p className="text-sm text-muted mt-1">Connect your account and select campaigns across BreadWinner.</p></div>
            <Link className="studio-button primary" to="/settings/leadrouter">Configure LeadRouter</Link>
        </section>
        <div className="studio-panel p-5 bg-subtle text-sm space-y-2">
            <p className="font-semibold">Manual refresh · one selected account at a time</p>
            <p className="text-muted">These snapshots contact Facebook only when you request a refresh. Snapshots become stale after 1 hour; that label does not schedule a pull. Changing selections and checking status read saved data.</p>
        </div>
        <section className="studio-panel p-5 space-y-4" aria-label="Workspace selection">
            <WorkspaceLoadState resource={workspaces} />
            {workspaces.data && <>
                <SearchableSelect label="Workspace" value={workspace?.id || ''} options={workspaces.data} onChange={setSelected} />
                {!workspaces.data.length && <p className="text-sm text-muted">No workspace membership yet. An administrator can create a workspace and add teammates.</p>}
            </>}
            {hasRole('admin') && <details className="border-t border-line pt-4"><summary className="text-sm font-medium cursor-pointer">Create workspace</summary>
                <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-0"><label htmlFor="workspace-name" className="block text-sm mb-2">Workspace name</label>
                        <input id="workspace-name" className="w-full rounded-lg border border-line-strong px-3 py-2" required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></div>
                    <button className="studio-button primary" disabled={!name.trim() || pending}>Create workspace</button>
                </form>
            </details>}
        </section>
        {workspace && <WorkspaceAccountView key={workspace.id} api={api} workspace={workspace} isSuperuser={user.is_superuser} onWorkspaceChange={workspaces.reload} />}
    </div>;
}
