import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ArrowRight, Sparkles, Tag } from 'lucide-react';
import { MAIN_NAV_SECTIONS, NavMenuSection, NavCategoryItem } from '../data/categoryNavigation';

interface HeaderNavDropdownsProps {
  activeCategory: string;
  activeSubcategory: string;
  activeCollection: string;
  subView: string;
  onSelectCategory: (category: string, subcategory?: string, collection?: string) => void;
  onNavigateHome: () => void;
  onNavigateOffers: () => void;
  onOpenTrackOrder: () => void;
  onOpenContact: () => void;
  onOpenAbout: () => void;
}

export const HeaderNavDropdowns: React.FC<HeaderNavDropdownsProps> = ({
  activeCategory,
  activeSubcategory,
  activeCollection,
  subView,
  onSelectCategory,
  onNavigateHome,
  onNavigateOffers,
  onOpenTrackOrder,
  onOpenContact,
  onOpenAbout,
}) => {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<any>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleMouseEnter = (id: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpenDropdownId(id);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setOpenDropdownId(null);
    }, 150);
  };

  const handleItemClick = (item: NavCategoryItem) => {
    setOpenDropdownId(null);
    onSelectCategory(
      item.categoryFilter,
      item.subcategoryFilter || 'ALL',
      item.collectionFilter || 'ALL'
    );
  };

  return (
    <div ref={dropdownRef} className="flex items-center gap-1 sm:gap-4 md:gap-6 lg:gap-7 text-sm font-medium text-neutral-800">
      {/* 1. Home Link */}
      <button
        type="button"
        onClick={onNavigateHome}
        className={`px-1 py-2 text-sm transition-colors whitespace-nowrap cursor-pointer hover:text-black ${
          subView === 'HOME'
            ? 'text-black font-semibold border-b-2 border-black -mb-[2px]'
            : 'text-neutral-700'
        }`}
      >
        Home
      </button>

      {/* 2. Main Dropdown Sections: Shop, Men, Women, Children, Collections */}
      {MAIN_NAV_SECTIONS.map((section: NavMenuSection) => {
        const isOpen = openDropdownId === section.id;
        const isSectionActive =
          (section.id === 'nav-men' && activeCategory === 'Men') ||
          (section.id === 'nav-women' && activeCategory === 'Women') ||
          (section.id === 'nav-children' && activeCategory === 'Children') ||
          (section.id === 'nav-collections' && activeCollection !== 'ALL') ||
          (section.id === 'nav-shop' && subView === 'CATALOG' && activeCategory !== 'Men' && activeCategory !== 'Women' && activeCategory !== 'Children' && activeCollection === 'ALL');

        return (
          <div
            key={section.id}
            className="relative"
            onMouseEnter={() => handleMouseEnter(section.id)}
            onMouseLeave={handleMouseLeave}
          >
            <button
              type="button"
              onClick={() => {
                if (isOpen) {
                  setOpenDropdownId(null);
                } else {
                  setOpenDropdownId(section.id);
                }
              }}
              className={`flex items-center gap-1 px-1 py-2 text-sm transition-colors whitespace-nowrap cursor-pointer hover:text-black group ${
                isSectionActive
                  ? 'text-black font-semibold border-b-2 border-black -mb-[2px]'
                  : 'text-neutral-700'
              }`}
              aria-expanded={isOpen}
            >
              <span>{section.label}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-black transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-black' : ''
                }`}
              />
            </button>

            {/* Video-matched Floating Dropdown Menu Card */}
            {isOpen && (
              <div
                className="absolute top-full left-0 mt-1 min-w-[210px] sm:min-w-[230px] bg-white rounded-lg shadow-xl border border-neutral-100 py-2.5 px-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                style={{
                  boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const isSelected =
                      (item.categoryFilter === 'ALL' && activeCategory === 'ALL' && item.collectionFilter === 'ALL' && activeCollection === 'ALL') ||
                      (item.subcategoryFilter && item.subcategoryFilter === activeSubcategory && item.categoryFilter === activeCategory) ||
                      (!item.subcategoryFilter && item.categoryFilter === activeCategory && (!item.collectionFilter || item.collectionFilter === activeCollection));

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm rounded transition-colors flex items-center justify-between cursor-pointer group/item ${
                          isSelected
                            ? 'bg-neutral-100 font-semibold text-black'
                            : 'text-neutral-600 hover:text-black hover:bg-neutral-50'
                        }`}
                      >
                        <span className="truncate">{item.name}</span>
                        <ArrowRight className="w-3 h-3 text-neutral-300 opacity-0 group-hover/item:opacity-100 group-hover/item:text-black transition-all transform group-hover/item:translate-x-0.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 3. Offers Link */}
      <button
        type="button"
        onClick={onNavigateOffers}
        className={`px-1 py-2 text-sm transition-colors whitespace-nowrap cursor-pointer hover:text-black flex items-center gap-1 ${
          activeCollection === 'OFFERS'
            ? 'text-black font-semibold border-b-2 border-black -mb-[2px]'
            : 'text-neutral-700'
        }`}
      >
        <span>Offers</span>
        <span className="text-[10px] font-mono px-1.5 py-0.2 bg-red-100 text-red-700 rounded font-semibold">SALE</span>
      </button>

      {/* 4. About Us Link */}
      <button
        type="button"
        onClick={onOpenAbout}
        className="px-1 py-2 text-sm text-neutral-700 hover:text-black transition-colors whitespace-nowrap cursor-pointer"
      >
        About Us
      </button>

      {/* 5. Contact Us Link */}
      <button
        type="button"
        onClick={onOpenContact}
        className="px-1 py-2 text-sm text-neutral-700 hover:text-black transition-colors whitespace-nowrap cursor-pointer"
      >
        Contact Us
      </button>
    </div>
  );
};
