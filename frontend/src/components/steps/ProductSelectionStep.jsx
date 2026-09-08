import React from 'react';
import { Check, Image } from 'lucide-react';

export default function ProductSelectionStep({ products, selectedProduct, onSelect, useProductShots, onToggleProductShots }) {
    return (
        <div>
            <h3 className="text-xl font-bold mb-4">Select Your Product</h3>
            <p className="text-secondary mb-6">Choose the product to feature in the ads</p>
            {products.length === 0 ? (
                <div className="text-center py-12 text-muted">
                    No products found for this brand. Please add products first.
                </div>
            ) : (
                <div className="space-y-3">
                    {products.map(product => (
                        <div
                            key={product.id}
                            className={`p-4 rounded-xl border-2 transition-all ${selectedProduct?.id === product.id
                                ? 'border-amber-600 bg-brand-soft'
                                : 'border-line hover:border-brand-line'
                                }`}
                        >
                            <div
                                onClick={() => onSelect(product)}
                                className="cursor-pointer flex items-center justify-between"
                            >
                                <div>
                                    <div className="font-bold text-foreground">{product.name}</div>
                                    {product.description && (
                                        <div className="text-sm text-secondary mt-1">{product.description}</div>
                                    )}
                                    {product.product_shots && product.product_shots.length > 0 && (
                                        <div className="text-xs text-brand-ink mt-1 font-medium flex items-center gap-1">
                                            <Image size={12} />
                                            {product.product_shots.length} product shot{product.product_shots.length !== 1 ? 's' : ''} available
                                        </div>
                                    )}
                                </div>
                                {selectedProduct?.id === product.id && (
                                    <Check className="text-brand-ink" size={24} />
                                )}
                            </div>

                            {/* Product Shots Toggle */}
                            {selectedProduct?.id === product.id && product.product_shots && product.product_shots.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-brand-line">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${useProductShots ? 'bg-amber-600 border-amber-600' : 'bg-panel border-line-strong group-hover:border-amber-500'}`}>
                                            {useProductShots && <Check size={14} className="text-white" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={useProductShots}
                                            onChange={(e) => onToggleProductShots(e.target.checked)}
                                        />
                                        <div>
                                            <span className="text-sm font-medium text-foreground">Use Product Shots</span>
                                            <p className="text-xs text-muted">Include uploaded product images in the generation process</p>
                                        </div>
                                    </label>

                                    {useProductShots && (
                                        <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
                                            {product.product_shots.map((shot, idx) => (
                                                <img key={idx} src={shot} alt="Product shot" className="w-16 h-16 object-cover rounded-lg border border-line" />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
