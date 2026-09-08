import React from 'react';
import { ChevronRight, Package, Check } from 'lucide-react';

const BrandOptionsStep = ({ activeBrand, selectedProduct, onSelectProduct, onNext, onBack }) => {
    if (!activeBrand) return null;

    return (
        <div>
            <h2 className="text-2xl font-bold mb-2">Brand Options</h2>
            <p className="text-secondary mb-8">Select a product to feature in this ad campaign.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {activeBrand.products && activeBrand.products.length > 0 ? (
                    activeBrand.products.map(product => (
                        <div
                            key={product.id}
                            onClick={() => onSelectProduct(product)}
                            className={`cursor-pointer p-6 rounded-xl border-2 transition-all ${selectedProduct?.id === product.id
                                ? 'border-blue-600 bg-info-soft'
                                : 'border-line hover:border-info-line hover:bg-subtle'
                                }`}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-3 bg-panel rounded-lg shadow-sm text-info">
                                    <Package size={24} />
                                </div>
                                {selectedProduct?.id === product.id && (
                                    <div className="bg-blue-600 text-white p-1 rounded-full">
                                        <Check size={16} />
                                    </div>
                                )}
                            </div>
                            <h3 className="font-bold text-lg text-foreground mb-2">{product.name}</h3>
                            <p className="text-sm text-muted line-clamp-2">{product.description}</p>
                        </div>
                    ))
                ) : (
                    <div className="col-span-2 text-center py-12 bg-subtle rounded-xl border border-dashed border-line-strong">
                        <p className="text-muted">No products found for this brand.</p>
                        <button className="mt-4 text-info font-medium hover:underline">
                            Add a Product
                        </button>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
                <button
                    onClick={onBack}
                    className="px-6 py-3 text-secondary hover:text-foreground font-medium"
                >
                    Back
                </button>
                <button
                    onClick={onNext}
                    disabled={!selectedProduct}
                    className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg font-medium hover:bg-brand-hover disabled:bg-line-strong disabled:cursor-not-allowed"
                >
                    Next Step <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
};

export default BrandOptionsStep;
