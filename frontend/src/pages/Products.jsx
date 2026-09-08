import React, { useState } from 'react';
import { useBrands } from '../context/BrandContext';
import ProductForm from '../components/ProductForm';
import { Plus, Edit2, Trash2, Package, LayoutGrid, List, Search } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';

const Products = () => {
    const { brands, addProduct, updateProduct, deleteProduct } = useBrands();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [viewMode, setViewMode] = useState(localStorage.getItem('preferred_view_mode') || 'list');

    // Persist view mode preference
    React.useEffect(() => {
        localStorage.setItem('preferred_view_mode', viewMode);
    }, [viewMode]);
    const [searchTerm, setSearchTerm] = useState('');

    const [productToDelete, setProductToDelete] = useState(null);

    // Flatten products from all brands
    const allProducts = brands.flatMap(brand =>
        brand.products.map(product => ({
            ...product,
            brandName: brand.name,
            brandId: brand.id,
            brandColor: brand.colors.primary
        }))
    );

    const filteredProducts = allProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.brandName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSave = (productData) => {
        if (editingProduct) {
            updateProduct(productData.brandId, editingProduct.id, productData);
        } else {
            addProduct(productData.brandId, productData);
        }
        setIsFormOpen(false);
        setEditingProduct(null);
    };

    const handleEdit = (product) => {
        setEditingProduct(product);
        setIsFormOpen(true);
    };

    const handleDelete = (brandId, productId) => {
        setProductToDelete({ brandId, productId });
    };

    const confirmDelete = () => {
        if (productToDelete) {
            deleteProduct(productToDelete.brandId, productToDelete.productId);
            setProductToDelete(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <Package size={32} className="text-brand-ink" />
                        Products
                    </h1>
                    <p className="text-secondary mt-2">Manage your product catalog across all brands.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    <div className="relative w-full md:flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-faint" size={20} />
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                        onClick={() => { setEditingProduct(null); setIsFormOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors shrink-0 font-medium shadow-sm"
                    >
                        <Plus size={20} />
                        Add Product
                    </button>
                </div>
            </div>

            {allProducts.length === 0 ? (
                <div className="bg-panel rounded-xl shadow-sm border border-line p-12 text-center">
                    <div className="w-16 h-16 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-4">
                        <Package className="text-brand-ink" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">No products yet</h3>
                    <p className="text-muted mb-6">Add products to your brands to start creating ads.</p>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="text-brand-ink font-medium hover:underline"
                    >
                        Add a Product
                    </button>
                </div>
            ) : (
                <>
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredProducts.map(product => (
                                <div
                                    key={product.id}
                                    onClick={() => handleEdit(product)}
                                    className="bg-panel rounded-xl shadow-sm border border-line overflow-hidden group hover:shadow-md transition-shadow cursor-pointer"
                                >
                                    <div className="h-24 bg-subtle relative flex items-center justify-center">
                                        <Package className="text-faint" size={48} />
                                        <div className="absolute top-4 right-4">
                                            <span
                                                className="text-xs font-medium px-2 py-1 rounded-full text-white"
                                                style={{ backgroundColor: product.brandColor }}
                                            >
                                                {product.brandName}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="text-lg font-bold text-foreground">{product.name}</h3>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEdit(product); }}
                                                    className="p-1.5 text-muted hover:bg-inset rounded-lg"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(product.brandId, product.id); }}
                                                    className="p-1.5 text-danger hover:bg-danger-soft rounded-lg"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-sm text-muted line-clamp-2">{product.description || 'No description'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-panel rounded-xl shadow-sm border border-line overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-subtle border-b border-line">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Product</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Brand</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Description</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {filteredProducts.map(product => (
                                        <tr
                                            key={product.id}
                                            onClick={() => handleEdit(product)}
                                            className="hover:bg-brand-soft transition-colors cursor-pointer"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-inset rounded-lg flex items-center justify-center text-muted">
                                                        <Package size={16} />
                                                    </div>
                                                    <span className="font-medium text-foreground">{product.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span
                                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                                                    style={{ backgroundColor: product.brandColor }}
                                                >
                                                    {product.brandName}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-secondary max-w-xs truncate">
                                                {product.description || <span className="text-faint italic">No description</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEdit(product); }}
                                                        className="p-1.5 text-muted hover:bg-inset rounded-lg transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(product.brandId, product.id); }}
                                                        className="p-1.5 text-danger hover:bg-danger-soft rounded-lg transition-colors"
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
                <ProductForm
                    onClose={() => setIsFormOpen(false)}
                    onSave={handleSave}
                    initialData={editingProduct}
                />
            )}

            <ConfirmationModal
                isOpen={!!productToDelete}
                onClose={() => setProductToDelete(null)}
                onConfirm={confirmDelete}
                title="Delete Product"
                message="Are you sure you want to delete this product? This action cannot be undone."
                confirmText="Delete"
                isDestructive={true}
            />
        </div>
    );
};

export default Products;
