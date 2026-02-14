import React, { useState } from 'react';
import { useBrands } from '../context/BrandContext';
import { useToast } from '../context/ToastContext';
import CustomerProfileForm from '../components/CustomerProfileForm';
import { Plus, Edit2, Trash2, Users, LayoutGrid, List, Search, UserCircle } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';

const CustomerProfiles = () => {
    const { customerProfiles, brands, addProfile, updateProfile, deleteProfile } = useBrands();
    const { showSuccess, showError } = useToast();
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

    const handleSave = async (profileData) => {
        try {
            if (editingProfile) {
                await updateProfile(editingProfile.id, profileData);
                showSuccess('Profile updated successfully');
            } else {
                await addProfile(profileData);
                showSuccess('Profile created successfully');
            }
            setIsFormOpen(false);
            setEditingProfile(null);
        } catch (error) {
            showError(error.message || 'Failed to save profile');
        }
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
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <Users size={32} className="text-amber-600" />
                        Customer Profiles
                    </h1>
                    <p className="text-gray-600 mt-2">Define and manage target audiences for your brands.</p>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search profiles..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-lg shrink-0">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <List size={20} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <LayoutGrid size={20} />
                        </button>
                    </div>
                    <button
                        onClick={() => { setEditingProfile(null); setIsFormOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors shrink-0 font-medium shadow-sm"
                    >
                        <Plus size={20} />
                        Add Profile
                    </button>
                </div>
            </div>

            {customerProfiles.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="text-amber-600" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No customer profiles yet</h3>
                    <p className="text-gray-500 mb-6">Create profiles to better target your ad copy.</p>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="text-amber-600 font-medium hover:underline"
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
                                        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden group hover:shadow-md transition-shadow cursor-pointer"
                                    >
                                        <div className="h-24 bg-gray-50 relative flex items-center justify-center">
                                            <UserCircle className="text-gray-300" size={48} />
                                            <div className="absolute top-4 right-4 flex -space-x-2">
                                                {linkedBrands.slice(0, 3).map(brand => (
                                                    <div
                                                        key={brand.id}
                                                        className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold"
                                                        style={{ backgroundColor: brand.colors.primary }}
                                                        title={brand.name}
                                                    >
                                                        {brand.name[0]}
                                                    </div>
                                                ))}
                                                {linkedBrands.length > 3 && (
                                                    <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] text-gray-600 font-bold">
                                                        +{linkedBrands.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-6">
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="text-lg font-bold text-gray-900">{profile.name}</h3>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEdit(profile); }}
                                                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-500 line-clamp-2 mb-2">{profile.demographics}</p>
                                            <div className="space-y-1">
                                                <p className="text-xs text-gray-400 uppercase font-semibold">Pain Points</p>
                                                <p className="text-sm text-gray-600 line-clamp-2">{profile.painPoints}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Profile Name</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Linked Brands</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Demographics</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredProfiles.map(profile => {
                                        const linkedBrands = getLinkedBrands(profile.id);
                                        return (
                                            <tr
                                                key={profile.id}
                                                onClick={() => handleEdit(profile)}
                                                className="hover:bg-amber-50 transition-colors cursor-pointer"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                                                            <UserCircle size={16} />
                                                        </div>
                                                        <span className="font-medium text-gray-900">{profile.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex -space-x-2">
                                                        {linkedBrands.length > 0 ? linkedBrands.slice(0, 3).map(brand => (
                                                            <div
                                                                key={brand.id}
                                                                className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold"
                                                                style={{ backgroundColor: brand.colors.primary }}
                                                                title={brand.name}
                                                            >
                                                                {brand.name[0]}
                                                            </div>
                                                        )) : (
                                                            <span className="text-xs text-gray-400 italic">None</span>
                                                        )}
                                                        {linkedBrands.length > 3 && (
                                                            <div className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] text-gray-600 font-bold">
                                                                +{linkedBrands.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                                                    {profile.demographics}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEdit(profile); }}
                                                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
                                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
