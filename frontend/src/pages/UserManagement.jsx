import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Users, Shield, Trash2, Plus, X, Check, UserCheck, UserX, Pencil } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [selectedRoles, setSelectedRoles] = useState([]);
    const [userToDelete, setUserToDelete] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role_ids: [] });
    const [addingUser, setAddingUser] = useState(false);
    const [showEditUserModal, setShowEditUserModal] = useState(false);
    const [editUserFormData, setEditUserFormData] = useState({ id: '', name: '', email: '', password: '' });
    const [updatingUser, setUpdatingUser] = useState(false);

    const { authFetch, user: currentUser } = useAuth();
    const { showSuccess, showError } = useToast();

    useEffect(() => {
        fetchUsers();
        fetchRoles();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await authFetch(`${API_URL}/users/`);
            if (response.ok) {
                const data = await response.json();
                setUsers(data);
            }
        } catch (err) {
            showError('Failed to fetch users');
        } finally {
            setLoading(false);
        }
    };

    const fetchRoles = async () => {
        try {
            const response = await authFetch(`${API_URL}/users/roles/`);
            if (response.ok) {
                const data = await response.json();
                setRoles(data);
            }
        } catch (err) {
            console.error('Failed to fetch roles:', err);
        }
    };

    const handleEditRoles = (user) => {
        setEditingUser(user);
        setSelectedRoles(user.roles.map(r => r.id));
    };

    const handleSaveRoles = async () => {
        try {
            const response = await authFetch(`${API_URL}/users/${editingUser.id}/roles`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_ids: selectedRoles }),
            });

            if (response.ok) {
                showSuccess('User roles updated');
                setEditingUser(null);
                fetchUsers();
            } else {
                const data = await response.json();
                showError(data.detail || 'Failed to update roles');
            }
        } catch (err) {
            showError('Failed to update roles');
        }
    };

    const handleToggleActive = async (user) => {
        try {
            const response = await authFetch(`${API_URL}/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !user.is_active }),
            });

            if (response.ok) {
                showSuccess(`User ${user.is_active ? 'deactivated' : 'activated'}`);
                fetchUsers();
            } else {
                const data = await response.json();
                showError(data.detail || 'Failed to update user');
            }
        } catch (err) {
            showError('Failed to update user');
        }
    };

    const handleDeleteClick = (user) => {
        setUserToDelete(user);
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete) return;

        try {
            const response = await authFetch(`${API_URL}/users/${userToDelete.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                showSuccess('User deleted');
                setUserToDelete(null);
                fetchUsers();
            } else {
                const data = await response.json();
                showError(data.detail || 'Failed to delete user');
            }
        } catch (err) {
            showError('Failed to delete user');
        }
    };

    const toggleRole = (roleId) => {
        setSelectedRoles(prev =>
            prev.includes(roleId)
                ? prev.filter(id => id !== roleId)
                : [...prev, roleId]
        );
    };

    const toggleNewUserRole = (roleId) => {
        setNewUser(prev => ({
            ...prev,
            role_ids: prev.role_ids.includes(roleId)
                ? prev.role_ids.filter(id => id !== roleId)
                : [...prev.role_ids, roleId]
        }));
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        if (!newUser.email || !newUser.password) {
            showError('Email and password are required');
            return;
        }

        setAddingUser(true);
        try {
            // First register the user
            const registerResponse = await authFetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: newUser.email,
                    password: newUser.password,
                    name: newUser.name || null
                }),
            });

            if (!registerResponse.ok) {
                const data = await registerResponse.json();
                showError(data.detail || 'Failed to create user');
                return;
            }

            const createdUser = await registerResponse.json();

            // Then assign roles if any selected
            if (newUser.role_ids.length > 0) {
                await authFetch(`${API_URL}/users/${createdUser.id}/roles`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role_ids: newUser.role_ids }),
                });
            }

            showSuccess('User created successfully');
            setShowAddModal(false);
            setNewUser({ name: '', email: '', password: '', role_ids: [] });
            fetchUsers();
        } catch (err) {
            showError('Failed to create user');
        } finally {
            setAddingUser(false);
        }
    };

    const handleEditUserClick = (user) => {
        setEditUserFormData({
            id: user.id,
            name: user.name || '',
            email: user.email,
            password: '' // Empty by default
        });
        setShowEditUserModal(true);
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        setUpdatingUser(true);
        
        try {
            const body = {
                name: editUserFormData.name,
                email: editUserFormData.email
            };
            
            if (editUserFormData.password) {
                body.password = editUserFormData.password;
            }

            const response = await authFetch(`${API_URL}/users/${editUserFormData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                showSuccess('User updated successfully');
                setShowEditUserModal(false);
                fetchUsers();
            } else {
                const data = await response.json();
                showError(data.detail || 'Failed to update user');
            }
        } catch (err) {
            showError('Failed to update user');
        } finally {
            setUpdatingUser(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <svg className="animate-spin h-10 w-10 text-brand-ink" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <Users size={32} className="text-brand-ink" />
                        User Management
                    </h1>
                    <p className="text-secondary mt-2">Manage users, roles, and permissions.</p>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-muted">
                        {users.length} user{users.length !== 1 ? 's' : ''}
                    </span>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors font-medium shadow-sm"
                    >
                        <Plus size={20} />
                        Add User
                    </button>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-panel rounded-xl shadow-sm border border-line overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-subtle border-b border-line">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">User</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Roles</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Created</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-brand-soft transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-brand-soft flex items-center justify-center text-brand-ink font-bold text-sm">
                                            {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-medium text-foreground flex items-center gap-2">
                                                {user.name || 'No name'}
                                                {user.is_superuser && (
                                                    <span className="px-2 py-0.5 text-xs bg-highlight-soft text-highlight rounded-full font-medium">
                                                        Superuser
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-muted">{user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.is_active ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
                                        {user.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-wrap gap-1">
                                        {user.roles.map((role) => (
                                            <span key={role.id} className="px-2 py-0.5 text-xs bg-inset text-secondary rounded-full">
                                                {role.name}
                                            </span>
                                        ))}
                                        {user.roles.length === 0 && (
                                            <span className="text-faint text-sm italic">No roles</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-muted">
                                    {new Date(user.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-end gap-1">
                                        <button
                                            onClick={() => handleEditUserClick(user)}
                                            className="p-2 text-muted hover:text-info hover:bg-info-soft rounded-lg transition-colors"
                                            title="Edit user details"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleEditRoles(user)}
                                            className="p-2 text-muted hover:text-brand-ink hover:bg-brand-soft rounded-lg transition-colors"
                                            title="Edit roles"
                                        >
                                            <Shield size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleToggleActive(user)}
                                            className={`p-2 rounded-lg transition-colors ${user.is_active ? 'text-muted hover:text-warning hover:bg-warning-soft' : 'text-muted hover:text-success hover:bg-success-soft'}`}
                                            title={user.is_active ? 'Deactivate' : 'Activate'}
                                            disabled={user.id === currentUser?.id}
                                        >
                                            {user.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteClick(user)}
                                            className="p-2 text-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-colors"
                                            title="Delete user"
                                            disabled={user.id === currentUser?.id}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Roles Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingUser(null)}>
                    <div className="bg-panel rounded-xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-brand-soft flex items-center justify-center">
                                    <Shield className="text-brand-ink" size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">Edit Roles</h3>
                                    <p className="text-sm text-muted">{editingUser.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingUser(null)}
                                className="text-faint hover:text-muted"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-2 mb-6">
                            {roles.map((role) => (
                                <label
                                    key={role.id}
                                    className="flex items-center gap-3 p-3 bg-subtle rounded-lg cursor-pointer hover:bg-inset transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedRoles.includes(role.id)}
                                        onChange={() => toggleRole(role.id)}
                                        className="w-4 h-4 text-brand-ink bg-panel border-line-strong rounded focus:ring-amber-500"
                                    />
                                    <div>
                                        <div className="font-medium text-foreground">{role.name}</div>
                                        {role.description && (
                                            <div className="text-xs text-muted">{role.description}</div>
                                        )}
                                    </div>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="px-4 py-2 text-secondary hover:bg-inset rounded-lg transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveRoles}
                                className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-lg transition-colors font-medium shadow-sm flex items-center gap-2"
                            >
                                <Check size={16} />
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add User Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
                    <div className="bg-panel rounded-xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-brand-soft flex items-center justify-center">
                                    <Plus className="text-brand-ink" size={20} />
                                </div>
                                <h3 className="text-lg font-bold text-foreground">Add New User</h3>
                            </div>
                            <button
                                onClick={() => {
                                    setShowAddModal(false);
                                    setNewUser({ name: '', email: '', password: '', role_ids: [] });
                                }}
                                className="text-faint hover:text-muted"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={newUser.name}
                                    onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    placeholder="John Doe"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    Email <span className="text-danger">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={newUser.email}
                                    onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    placeholder="user@example.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    Password <span className="text-danger">*</span>
                                </label>
                                <input
                                    type="password"
                                    value={newUser.password}
                                    onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-secondary mb-2">
                                    Roles
                                </label>
                                <div className="space-y-2">
                                    {roles.map((role) => (
                                        <label
                                            key={role.id}
                                            className="flex items-center gap-3 p-3 bg-subtle rounded-lg cursor-pointer hover:bg-inset transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={newUser.role_ids.includes(role.id)}
                                                onChange={() => toggleNewUserRole(role.id)}
                                                className="w-4 h-4 text-brand-ink bg-panel border-line-strong rounded focus:ring-amber-500"
                                            />
                                            <div>
                                                <div className="font-medium text-foreground">{role.name}</div>
                                                {role.description && (
                                                    <div className="text-xs text-muted">{role.description}</div>
                                                )}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setNewUser({ name: '', email: '', password: '', role_ids: [] });
                                    }}
                                    className="px-4 py-2 text-secondary hover:bg-inset rounded-lg transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addingUser}
                                    className="px-4 py-2 bg-brand hover:bg-brand-hover disabled:bg-amber-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium shadow-sm flex items-center gap-2"
                                >
                                    {addingUser ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <Check size={16} />
                                            Create User
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {showEditUserModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEditUserModal(false)}>
                    <div className="bg-panel rounded-xl max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-info-soft flex items-center justify-center">
                                    <Pencil className="text-info" size={20} />
                                </div>
                                <h3 className="text-lg font-bold text-foreground">Edit User</h3>
                            </div>
                            <button
                                onClick={() => setShowEditUserModal(false)}
                                className="text-faint hover:text-muted"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={editUserFormData.name}
                                    onChange={(e) => setEditUserFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="John Doe"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    Email <span className="text-danger">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={editUserFormData.email}
                                    onChange={(e) => setEditUserFormData(prev => ({ ...prev, email: e.target.value }))}
                                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="user@example.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1">
                                    New Password <span className="text-faint font-normal">(optional)</span>
                                </label>
                                <input
                                    type="password"
                                    value={editUserFormData.password}
                                    onChange={(e) => setEditUserFormData(prev => ({ ...prev, password: e.target.value }))}
                                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Leave blank to keep current"
                                    minLength={6}
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowEditUserModal(false)}
                                    className="px-4 py-2 text-secondary hover:bg-inset rounded-lg transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={updatingUser}
                                    className="px-4 py-2 bg-brand hover:bg-brand-hover disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium shadow-sm flex items-center gap-2"
                                >
                                    {updatingUser ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Check size={16} />
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!userToDelete}
                onClose={() => setUserToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Delete User"
                message={`Are you sure you want to delete ${userToDelete?.email}? This action cannot be undone.`}
                confirmText="Delete"
                isDestructive={true}
            />
        </div>
    );
};

export default UserManagement;
