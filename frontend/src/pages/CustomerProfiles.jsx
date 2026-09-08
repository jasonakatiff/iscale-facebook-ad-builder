import React, { useState } from 'react';
import { useBrands } from '../context/BrandContext';
import CustomerProfileForm from '../components/CustomerProfileForm';
import { Plus, Edit2, Trash2, Users, LayoutGrid, List, Search, UserCircle } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';

const CustomerProfiles = () => {
    const { customerProfiles, brands, addProfile, updateProfile, deleteProfile } = useBrands();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState(null);
    const [viewMode, setViewMode] = useState(localStorage.getItem('preferred_view_mode') || 'list');

    // Persist view mode preference
    React.useEffect(() => {
        localStorage.setItem('preferred_view_mode', viewMode);
    }, [viewMode]);
    const [searchTerm, setSearchTerm] = useState('');

    const [profileToDelete, setProfileToDelete] = useState(null);

    // Helper to find which brands use a profile
    const getLinkedBrands = (profileId) => {
        return brands.filter(brand => (brand.profileIds || []).includes(profileId));
    };

    const filteredProfiles = customerProfiles.filter(profile =>
        profile.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSave = (profileData) => {
        if (editingProfile) {
            updateProfile(editingProfile.id, profileData);
        } else {
            addProfile(profileData);
        }
        setIsFormOpen(false);
        setEditingProfile(null);
    };

    const handleEdit = (profile) => {
        setEditingProfile(profile);
        setIsFormOpen(true);
    };

    const handleDelete = (profileId) => {
        setProfileToDelete(profileId);
    };

    const confirmDelete = () => {
        if (profileToDelete) {
            deleteProfile(profileToDelete);
            setProfileToDelete(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <Users size={32} className="text-brand-ink shrink-0" />
                        Customer Profiles
                    </h1>
                    <p className="text-secondary mt-2">Define and manage target audiences for your brands.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    <div className="relative w-full md:flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-faint" size={20} />
                        <input
                            type="text"
                            placeholder="Search profiles..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div className="flex bg-inset p-1 rounded-lg shrink-0">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-panel shadow-sm text-brand-ink' : 'text-muted hover:text-secondary'}`}
                        >
                            <List size={20} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-panel shadow-sm text-brand-ink' : 'text-muted hover:text-secondary'}`}
                        >
                            <LayoutGrid size={20} />
                        </button>
                    </div>
                    <button
                        onClick={() => { setEditingProfile(null); setIsFormOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors shrink-0 font-medium shadow-sm"
                    >
                        <Plus size={20} />
                        Add Profile
                    </button>
                </div>
            </div>

            {customerProfiles.length === 0 ? (
                <div className="bg-panel rounded-xl shadow-sm border border-line p-12 text-center">
                    <div className="w-16 h-16 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="text-brand-ink" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">No customer profiles yet</h3>
                    <p className="text-muted mb-6">Create profiles to better target your ad copy.</p>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="text-brand-ink font-medium hover:underline"
                    >
                        Add a Profile
                    </button>
                </div>
            ) : (
                <>
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredProfiles.map(profile => {
                                const linkedBrands = getLinkedBrands(profile.id);
                                return (
                                    <div
                                        key={profile.id}
                                        onClick={() => handleEdit(profile)}
                                        className="bg-panel rounded-xl shadow-sm border border-line overflow-hidden group hover:shadow-md transition-shadow cursor-pointer"
                                    >
                                        <div className="h-24 bg-subtle relative flex items-center justify-center">
                                            <UserCircle className="text-faint" size={48} />
                                            <div className="absolute top-4 right-4 flex -space-x-2">
                                                {linkedBrands.slice(0, 3).map(brand => (
                                                    <div
                                                        key={brand.id}
                                                        className="w-6 h-6 rounded-full border-2 border-panel flex items-center justify-center text-[10px] text-white font-bold"
                                                        style={{ backgroundColor: brand.colors.primary }}
                                                        title={brand.name}
                                                    >
                                                        {brand.name[0]}
                                                    </div>
                                                ))}
                                                {linkedBrands.length > 3 && (
                                                    <div className="w-6 h-6 rounded-full border-2 border-panel bg-soft flex items-center justify-center text-[10px] text-secondary font-bold">
                                                        +{linkedBrands.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-6">
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="text-lg font-bold text-foreground">{profile.name}</h3>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEdit(profile); }}
                                                        className="p-1.5 text-muted hover:bg-inset rounded-lg"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
                                                        className="p-1.5 text-danger hover:bg-danger-soft rounded-lg"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted line-clamp-2 mb-2">{profile.demographics}</p>
                                            <div className="space-y-1">
                                                <p className="text-xs text-faint uppercase font-semibold">Pain Points</p>
                                                <p className="text-sm text-secondary line-clamp-2">{profile.painPoints}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="bg-panel rounded-xl shadow-sm border border-line overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-subtle border-b border-line">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Profile Name</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Linked Brands</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Demographics</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {filteredProfiles.map(profile => {
                                        const linkedBrands = getLinkedBrands(profile.id);
                                        return (
                                            <tr
                                                key={profile.id}
                                                onClick={() => handleEdit(profile)}
                                                className="hover:bg-brand-soft transition-colors cursor-pointer"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-inset rounded-lg flex items-center justify-center text-muted">
                                                            <UserCircle size={16} />
                                                        </div>
                                                        <span className="font-medium text-foreground">{profile.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex -space-x-2">
                                                        {linkedBrands.length > 0 ? linkedBrands.slice(0, 3).map(brand => (
                                                            <div
                                                                key={brand.id}
                                                                className="w-6 h-6 rounded-full border-2 border-panel flex items-center justify-center text-[10px] text-white font-bold"
                                                                style={{ backgroundColor: brand.colors.primary }}
                                                                title={brand.name}
                                                            >
                                                                {brand.name[0]}
                                                            </div>
                                                        )) : (
                                                            <span className="text-xs text-faint italic">None</span>
                                                        )}
                                                        {linkedBrands.length > 3 && (
                                                            <div className="w-6 h-6 rounded-full border-2 border-panel bg-soft flex items-center justify-center text-[10px] text-secondary font-bold">
                                                                +{linkedBrands.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-secondary max-w-xs truncate">
                                                    {profile.demographics}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEdit(profile); }}
                                                            className="p-1.5 text-muted hover:bg-inset rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
                                                            className="p-1.5 text-danger hover:bg-danger-soft rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {isFormOpen && (
                <CustomerProfileForm
                    onClose={() => setIsFormOpen(false)}
                    onSave={handleSave}
                    initialData={editingProfile}
                />
            )}

            <ConfirmationModal
                isOpen={!!profileToDelete}
                onClose={() => setProfileToDelete(null)}
                onConfirm={confirmDelete}
                title="Delete Customer Profile"
                message="Are you sure you want to delete this profile? It will be unlinked from all brands."
                confirmText="Delete"
                isDestructive={true}
            />
        </div>
    );
};

export default CustomerProfiles;
