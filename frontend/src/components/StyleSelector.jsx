import React, { useState } from 'react';
import { Search, Sparkles, TrendingUp, Users, Lightbulb, Zap, CheckCircle2 } from 'lucide-react';
import { adStyles, AD_CATEGORIES, getAllCategories, getStylesByCategory, searchStyles } from '../data/adStyles';

const categoryIcons = {
    [AD_CATEGORIES.TRUST_AUTHORITY]: TrendingUp,
    [AD_CATEGORIES.PROBLEM_SOLUTION]: Lightbulb,
    [AD_CATEGORIES.SOCIAL_PROOF]: Users,
    [AD_CATEGORIES.DEMONSTRATION]: Sparkles,
    [AD_CATEGORIES.DISRUPTION]: Zap
};

const categoryColors = {
    [AD_CATEGORIES.TRUST_AUTHORITY]: 'blue',
    [AD_CATEGORIES.PROBLEM_SOLUTION]: 'green',
    [AD_CATEGORIES.SOCIAL_PROOF]: 'purple',
    [AD_CATEGORIES.DEMONSTRATION]: 'amber',
    [AD_CATEGORIES.DISRUPTION]: 'red'
};

export default function StyleSelector({ onSelect }) {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredStyle, setHoveredStyle] = useState(null);

    const categories = getAllCategories();

    // Filter styles based on category and search
    const filteredStyles = searchQuery
        ? searchStyles(searchQuery)
        : selectedCategory === 'all'
            ? adStyles
            : getStylesByCategory(selectedCategory);

    return (
        <div className="space-y-6">
            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-faint" size={20} />
                <input
                    type="text"
                    placeholder="Search styles by name, industry, or use case..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                />
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${selectedCategory === 'all'
                            ? 'bg-brand text-white'
                            : 'bg-inset text-secondary hover:bg-soft'
                        }`}
                >
                    All Styles ({adStyles.length})
                </button>
                {categories.map((category) => {
                    const Icon = categoryIcons[category];
                    const color = categoryColors[category];
                    const count = getStylesByCategory(category).length;
                    const isActive = selectedCategory === category;

                    return (
                        <button
                            key={category}
                            onClick={() => setSelectedCategory(category)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${isActive
                                    ? `bg-${color}-600 text-white`
                                    : `bg-${color}-50 text-${color}-700 hover:bg-${color}-100`
                                }`}
                            style={isActive ? {
                                backgroundColor: `var(--${color}-600)`,
                                color: 'white'
                            } : {
                                backgroundColor: `var(--${color}-50)`,
                                color: `var(--${color}-700)`
                            }}
                        >
                            <Icon size={16} />
                            {category} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Results Count */}
            {searchQuery && (
                <p className="text-sm text-secondary">
                    Found {filteredStyles.length} style{filteredStyles.length !== 1 ? 's' : ''}
                </p>
            )}

            {/* Style Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStyles.map((style) => {
                    const color = categoryColors[style.category];
                    const Icon = categoryIcons[style.category];
                    const isHovered = hoveredStyle === style.id;

                    return (
                        <div
                            key={style.id}
                            onClick={() => onSelect(style)}
                            onMouseEnter={() => setHoveredStyle(style.id)}
                            onMouseLeave={() => setHoveredStyle(null)}
                            className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all ${isHovered
                                    ? `border-${color}-600 shadow-lg scale-105`
                                    : 'border-line hover:border-line-strong hover:shadow-md'
                                }`}
                            style={isHovered ? {
                                borderColor: `var(--${color}-600)`,
                                transform: 'scale(1.02)'
                            } : {}}
                        >
                            {/* Category Badge */}
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium mb-3 bg-${color}-100 text-${color}-700`}
                                style={{
                                    backgroundColor: `var(--${color}-100)`,
                                    color: `var(--${color}-700)`
                                }}>
                                <Icon size={12} />
                                {style.category}
                            </div>

                            {/* Style Name */}
                            <h4 className="font-bold text-foreground mb-2 text-lg">{style.name}</h4>

                            {/* Description */}
                            <p className="text-sm text-secondary mb-3">{style.description}</p>

                            {/* Visual Layout */}
                            <div className="mb-3">
                                <span className="text-xs font-medium text-muted">Layout:</span>
                                <p className="text-sm text-secondary">{style.visualLayout}</p>
                            </div>

                            {/* Best For Tags */}
                            <div className="mb-3">
                                <span className="text-xs font-medium text-muted block mb-1">Best For:</span>
                                <div className="flex flex-wrap gap-1">
                                    {style.bestFor.map((industry) => (
                                        <span
                                            key={industry}
                                            className="px-2 py-0.5 bg-inset text-secondary text-xs rounded"
                                        >
                                            {industry}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Psychology (shown on hover) */}
                            {isHovered && (
                                <div className="mt-4 pt-4 border-t border-line animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex items-start gap-2">
                                        <Sparkles className={`text-${color}-600 flex-shrink-0 mt-0.5`} size={16} />
                                        <div>
                                            <span className="text-xs font-medium text-muted block mb-1">Psychology:</span>
                                            <p className="text-sm text-secondary italic">{style.psychology}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Select Indicator */}
                            {isHovered && (
                                <div className="absolute top-4 right-4">
                                    <CheckCircle2 className={`text-${color}-600`} size={24} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Empty State */}
            {filteredStyles.length === 0 && (
                <div className="text-center py-12">
                    <Search className="mx-auto text-faint mb-4" size={48} />
                    <h3 className="text-lg font-bold text-foreground mb-2">No styles found</h3>
                    <p className="text-secondary">Try adjusting your search or browse all categories</p>
                </div>
            )}
        </div>
    );
}
