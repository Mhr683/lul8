import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ArrowRight, Tag, Sparkles } from 'lucide-react';
import { Product } from '../types/store';
import { ProductImage } from './ProductImage';
import { formatPKR } from '../services/abstractions';

interface GlobalHeaderSearchProps {
  products: Product[];
  categories: { id: string; name: string }[];
  onSelectProduct: (product: Product) => void;
  onViewAllResults: (query: string, category?: string) => void;
}

export const GlobalHeaderSearch: React.FC<GlobalHeaderSearchProps> = ({
  products,
  categories,
  onSelectProduct,
  onViewAllResults,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Shortcut "/" or "Cmd+K / Ctrl+K" to open global search
      if (
        (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        event.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Fast luxury matching across Name, Category, Description, Brand, and SKU
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeProducts = products.filter((p) => p.status === 'ACTIVE');

    if (!q) {
      // When input is blank, show featured curated pieces or top stock
      return activeProducts
        .filter((p) => (selectedCategory === 'ALL' ? true : p.category.toLowerCase() === selectedCategory.toLowerCase()))
        .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
        .slice(0, 5);
    }

    const tokens = q.split(/\s+/).filter(Boolean);

    return activeProducts
      .filter((p) => {
        if (selectedCategory !== 'ALL' && p.category.toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }

        const name = p.name.toLowerCase();
        const cat = p.category.toLowerCase();
        const sub = (p.subcategory || '').toLowerCase();
        const brand = p.brand.toLowerCase();
        const sku = p.sku.toLowerCase();
        const desc = `${p.shortDescription || ''} ${p.description || ''}`.toLowerCase();
        const keywords = (p.seoKeywords || '').toLowerCase();
        const combined = `${name} ${cat} ${sub} ${brand} ${sku} ${desc} ${keywords}`;

        // Support smart synonyms: kids -> children, perfume -> fragrance, watch -> watches/horology
        if ((q.includes('kid') || q.includes('child') || q.includes('bach')) && (cat === 'children' || sub.includes('kid') || sub.includes('boy') || sub.includes('girl') || sub.includes('baby'))) {
          return true;
        }
        if ((q.includes('perfume') || q.includes('fragrance') || q.includes('scent') || q.includes('attar')) && cat === 'fragrance') {
          return true;
        }
        if ((q.includes('watch') || q.includes('ghari')) && (cat === 'watches' || cat === 'horology')) {
          return true;
        }

        // Check if all tokens match anywhere in record
        return tokens.every((token) => combined.includes(token));
      })
      .slice(0, 10);
  }, [products, query, selectedCategory]);

  const totalMatchingCount = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    const tokens = q.split(/\s+/).filter(Boolean);
    return products
      .filter((p) => p.status === 'ACTIVE')
      .filter((p) => {
        if (selectedCategory !== 'ALL' && p.category.toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
        const text = `${p.name} ${p.category} ${p.subcategory || ''} ${p.brand} ${p.sku} ${p.shortDescription || ''} ${p.description || ''} ${p.seoKeywords || ''}`.toLowerCase();
        if ((q.includes('kid') || q.includes('child') || q.includes('bach')) && (p.category.toLowerCase() === 'children' || (p.subcategory || '').toLowerCase().includes('kid'))) {
          return true;
        }
        if ((q.includes('perfume') || q.includes('fragrance') || q.includes('scent')) && p.category.toLowerCase() === 'fragrance') {
          return true;
        }
        if ((q.includes('watch') || q.includes('ghari')) && (p.category.toLowerCase() === 'watches' || p.category.toLowerCase() === 'horology')) {
          return true;
        }
        return tokens.every((t) => text.includes(t));
      }).length;
  }, [products, query, selectedCategory]);

  const handleSelect = (product: Product) => {
    onSelectProduct(product);
    setIsOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onViewAllResults(query.trim(), selectedCategory === 'ALL' ? undefined : selectedCategory);
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Desktop & Mobile Trigger / Search Input */}
      <div className="relative flex items-center">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            placeholder="Search editions, materials, horology..."
            className={`pl-9 pr-8 py-1.5 text-xs text-[#141413] bg-[#F3F2EE] border transition-all duration-200 placeholder:text-[#8C8A85] focus:outline-none focus:bg-white focus:border-[#141413] ${
              isOpen
                ? 'w-64 sm:w-80 md:w-96 border-[#141413] bg-white shadow-sm ring-1 ring-black/5'
                : 'w-48 sm:w-60 md:w-72 border-black/10 hover:border-black/25'
            }`}
          />
          <Search className="w-3.5 h-3.5 text-[#787774] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#787774] hover:text-[#141413] p-0.5 cursor-pointer"
              aria-label="Clear search query"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {!query && (
            <kbd className="hidden lg:inline-flex items-center gap-0.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#8C8A85] bg-black/[0.04] px-1.5 py-0.5 border border-black/[0.06]">
              /
            </kbd>
          )}
        </form>
      </div>

      {/* Luxury Search Results Dropdown Overlay */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[460px] md:w-[540px] bg-white border border-black/15 shadow-2xl z-50 overflow-hidden divide-y divide-black/[0.06] animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Category Filter Chips */}
          <div className="p-3 bg-[#FAF9F6] flex items-center gap-1.5 overflow-x-auto text-[11px] font-medium no-scrollbar">
            <span className="text-[#8C6D46] uppercase tracking-wider text-[10px] font-semibold shrink-0 mr-1 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Filter:
            </span>
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-2.5 py-1 whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-[#141413] text-[#FBFBF9]'
                  : 'bg-white text-[#575653] hover:text-[#141413] border border-black/10'
              }`}
            >
              All Editions
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-2.5 py-1 whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory.toLowerCase() === cat.name.toLowerCase()
                    ? 'bg-[#141413] text-[#FBFBF9]'
                    : 'bg-white text-[#575653] hover:text-[#141413] border border-black/10'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Quick Results List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-black/[0.05]">
            {searchResults.length > 0 ? (
              searchResults.map((product) => (
                <div
                  key={product.id}
                  onClick={() => handleSelect(product)}
                  className="p-3.5 hover:bg-[#FAF9F6] flex items-center gap-3.5 cursor-pointer transition-colors group"
                >
                  <div className="w-14 h-14 bg-[#F3F2EE] shrink-0 border border-black/10 overflow-hidden relative">
                    <ProductImage
                      src={product.primaryImage}
                      alt={product.name}
                      category={product.category}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] text-[#787774] uppercase tracking-wider">
                      <span className="font-semibold text-[#8C6D46]">{product.brand}</span>
                      <span aria-hidden="true">·</span>
                      <span>{product.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{product.sku}</span>
                    </div>

                    <h4 className="text-xs font-semibold text-[#141413] group-hover:text-[#8C6D46] transition-colors truncate mt-0.5">
                      {product.name}
                    </h4>

                    {product.shortDescription && (
                      <p className="text-[11px] text-[#575653] line-clamp-1 mt-0.5 leading-snug">
                        {product.shortDescription}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0 font-mono">
                    <div className="text-xs font-semibold text-[#141413]">
                      {formatPKR(product.price)}
                    </div>
                    <div className="text-[10px] text-[#8C6D46]">
                      ${product.price.toLocaleString()} USD
                    </div>
                    {product.stock <= 5 && product.stock > 0 && (
                      <div className="text-[9px] text-[#991B1B] font-sans font-medium mt-0.5">
                        Only {product.stock} left
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-[#787774] space-y-2">
                <p>No luxury pieces matched &ldquo;{query}&rdquo; in {selectedCategory === 'ALL' ? 'the archive' : selectedCategory}.</p>
                <p className="text-[11px] text-[#8C8A85]">
                  Try searching by collection, materials (e.g. &ldquo;titanium&rdquo;, &ldquo;leather&rdquo;), or model code.
                </p>
              </div>
            )}
          </div>

          {/* Footer Bar: View All Results / Quick Suggestions */}
          <div className="p-3 bg-[#FAF9F6] flex items-center justify-between gap-3 text-xs">
            {query.trim() ? (
              <>
                <span className="text-[11px] text-[#787774]">
                  {totalMatchingCount > 0 ? (
                    <>
                      Found <strong className="text-[#141413]">{totalMatchingCount}</strong> luxury piece{totalMatchingCount === 1 ? '' : 's'}
                    </>
                  ) : (
                    'No pieces found'
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onViewAllResults(query.trim(), selectedCategory === 'ALL' ? undefined : selectedCategory);
                    setIsOpen(false);
                  }}
                  className="px-3 py-1.5 bg-[#141413] text-[#FBFBF9] text-[11px] font-medium flex items-center gap-1.5 hover:bg-[#2A2A28] transition-colors cursor-pointer"
                >
                  <span>View All in Catalog</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </>
            ) : (
              <div className="w-full flex items-center justify-between text-[11px] text-[#787774]">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#C5A059]" />
                  Curated Editions & Signature Pieces
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onViewAllResults('', selectedCategory === 'ALL' ? undefined : selectedCategory);
                    setIsOpen(false);
                  }}
                  className="text-[#141413] hover:underline font-medium cursor-pointer"
                >
                  Explore Complete Collection →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
