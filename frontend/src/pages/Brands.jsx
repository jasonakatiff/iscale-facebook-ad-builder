import React, { useState } from 'react';
import { useBrands } from '../context/BrandContext';
import { useToast } from '../context/ToastContext';
import BrandForm from '../components/BrandForm';
import { Plus, Edit2, Trash2, Briefcase, LayoutGrid, List } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';

const Brands = () => {
    const { brands, addBrand, updateBrand, deleteBrand } = useBrands();
    const { showSuccess, showError } = useToast();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingBrand, setEditingBrand] = useState(null);
    const [viewMode, setViewMode] = useState(localStorage.getItem('preferred_view_mode') || 'list'); // 'list' or 'grid'

    // Persist view mode preference
    React.useEffect(() => {
        localStorage.setItem('preferred_view_mode', viewMode);
    }, [viewMode]);

    const [brandToDelete, setBrandToDelete] = useState(null);

    const handleSave = async (brandData) => {
        try {
            if (editingBrand) {
                await updateBrand(editingBrand.id, brandData);
                showSuccess('Brand updated successfully');
            } else {
                await addBrand(brandData);
                showSuccess('Brand created successfully');
            }
            setIsFormOpen(false);
            setEditingBrand(null);
        } catch (error) {
            showError(error.message || 'Failed to save brand');
        }
    };

    const handleEdit = (brand) => {
        setEditingBrand(brand);
        setIsFormOpen(true);
    };

    const handleDelete = (id) => {
        setBrandToDelete(id);
    };

    const confirmDelete = () => {
        if (brandToDelete) {
            deleteBrand(brandToDelete);
            setBrandToDelete(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <Briefcase size={32} className="text-amber-600" />
                        Brand Management
                    </h1>
                    <p className="text-gray-600 mt-2">Manage your brands, assets, and styles.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                            title="List View"
                        >
                            <List size={20} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                            title="Grid View"
                        >
                            <LayoutGrid size={20} />
                        </button>
                    </div>
                    <button
                        onClick={() => { setEditingBrand(null); setIsFormOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium shadow-sm"
                    >
                        <Plus size={20} />
                        Add Brand
                    </button>
                </div>
            </div>

            {brands.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Briefcase className="text-amber-600" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No brands yet</h3>
                    <p className="text-gray-500 mb-6">Create your first brand to start generating consistent ads.</p>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="text-amber-600 font-medium hover:underline"
                    >
                        Create a brand
                    </button>
                </div>
            ) : (
                <>
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {brands.map(brand => (
                                <div key={brand.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden group hover:shadow-md transition-shadow">
                                    <div className="h-32 bg-gradient-to-r from-gray-100 to-gray-200 relative">
                                        <div className="absolute bottom-0 left-6 transform translate-y-1/2">
                                            <div
                                                className="w-16 h-16 rounded-xl border-4 border-white shadow-sm flex items-center justify-center text-white font-bold text-xl"
                                                style={{ backgroundColor: brand.colors.primary }}
                                            >
                                                {brand.name.charAt(0)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-10 p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <h3 className="text-xl font-bold text-gray-900">{brand.name}</h3>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEdit(brand)}
                                                    className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(brand.id)}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-3 text-sm text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: brand.colors.primary }}></div>
                                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: brand.colors.secondary }}></div>
                                                <span className="text-gray-400 text-xs ml-1">Brand Colors</span>
                                            </div>
                                            <p className="line-clamp-2">
                                                <span className="font-medium text-gray-900">Voice:</span> {brand.voice || 'Not specified'}
                                            </p>
                                            <p>
                                                <span className="font-medium text-gray-900">Products:</span> {brand.products.length}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Brand</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Colors</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Voice</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Products</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {brands.map(brand => (
                                        <tr
                                            key={brand.id}
                                            onClick={() => handleEdit(brand)}
                                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm"
                                                        style={{ backgroundColor: brand.colors.primary }}
                                                    >
                                                        {brand.name.charAt(0)}
                                                    </div>
                                                    <span className="font-medium text-gray-900">{brand.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: brand.colors.primary }} title="Primary"></div>
                                                    <div className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: brand.colors.secondary }} title="Secondary"></div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                                                {brand.voice || <span className="text-gray-400 italic">Not specified</span>}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {brand.products.length}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEdit(brand); }}
                                                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(brand.id); }}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete"
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
                    )}
                </>
            )}

            {isFormOpen && (
                <BrandForm
                    onClose={() => setIsFormOpen(false)}
                    onSave={handleSave}
                    initialData={editingBrand}
                />
            )}

            <ConfirmationModal
                isOpen={!!brandToDelete}
                onClose={() => setBrandToDelete(null)}
                onConfirm={confirmDelete}
                title="Delete Brand"
                message="Are you sure you want to delete this brand? This action cannot be undone."
                confirmText="Delete"
                isDestructive={true}
            />
        </div>
    );
};

export default Brands;
