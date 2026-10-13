export interface NavCategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  tag?: string;
  categoryFilter: string; // The primary category to filter by
  subcategoryFilter?: string; // Optional subcategory filter
  collectionFilter?: 'ALL' | 'NEW_ARRIVALS' | 'BEST_SELLERS' | 'OFFERS';
}

export interface NavMenuSection {
  id: string;
  label: string;
  slug: string;
  items: NavCategoryItem[];
}

export const MAIN_NAV_SECTIONS: NavMenuSection[] = [
  {
    id: 'nav-shop',
    label: 'Shop',
    slug: 'shop',
    items: [
      {
        id: 'shop-all',
        name: 'All Products',
        slug: 'all-products',
        categoryFilter: 'ALL',
      },
      {
        id: 'shop-health-beauty',
        name: 'Health & Beauty',
        slug: 'health-beauty',
        categoryFilter: 'Health & Beauty',
      },
      {
        id: 'shop-home-kitchen',
        name: 'Home & Kitchen',
        slug: 'home-kitchen',
        categoryFilter: 'Home & Kitchen',
      },
      {
        id: 'shop-watches',
        name: 'Watches',
        slug: 'watches',
        categoryFilter: 'Watches',
      },
      {
        id: 'shop-fragrance',
        name: 'Fragrance',
        slug: 'fragrance',
        categoryFilter: 'Fragrance',
      },
      {
        id: 'shop-electronics',
        name: 'Electronics',
        slug: 'electronics',
        categoryFilter: 'Electronics',
      },
      {
        id: 'shop-bags-luggage',
        name: 'Bags & Luggage',
        slug: 'bags-luggage',
        categoryFilter: 'Leather Goods',
      },
      {
        id: 'shop-jewelry',
        name: 'Jewelry & Accessories',
        slug: 'jewelry-accessories',
        categoryFilter: 'Jewelry',
      },
    ],
  },
  {
    id: 'nav-men',
    label: 'Men',
    slug: 'men',
    items: [
      {
        id: 'men-all',
        name: 'All Men',
        slug: 'all-men',
        categoryFilter: 'Men',
      },
      {
        id: 'men-shirts',
        name: 'Shirts',
        slug: 'shirts',
        categoryFilter: 'Men',
        subcategoryFilter: 'Shirts',
      },
      {
        id: 'men-jackets',
        name: 'Jackets',
        slug: 'jackets',
        categoryFilter: 'Men',
        subcategoryFilter: 'Jackets',
      },
      {
        id: 'men-trousers',
        name: 'Trousers & Chinos',
        slug: 'trousers',
        categoryFilter: 'Men',
        subcategoryFilter: 'Trousers & Chinos',
      },
      {
        id: 'men-ethnic',
        name: 'Traditional & Kurta',
        slug: 'ethnic-kurta',
        categoryFilter: 'Men',
        subcategoryFilter: 'Traditional & Ethnic',
      },
      {
        id: 'men-shoes',
        name: 'Shoes & Footwear',
        slug: 'men-shoes',
        categoryFilter: 'Men',
        subcategoryFilter: 'Footwear & Shoes',
      },
      {
        id: 'men-blazers',
        name: 'Suits & Blazers',
        slug: 'suits-blazers',
        categoryFilter: 'Men',
        subcategoryFilter: 'Suits & Blazers',
      },
    ],
  },
  {
    id: 'nav-women',
    label: 'Women',
    slug: 'women',
    items: [
      {
        id: 'women-all',
        name: 'All Women',
        slug: 'all-women',
        categoryFilter: 'Women',
      },
      {
        id: 'women-dresses',
        name: 'Dresses',
        slug: 'dresses',
        categoryFilter: 'Women',
        subcategoryFilter: 'Dresses',
      },
      {
        id: 'women-tops',
        name: 'Tops & Blouses',
        slug: 'tops',
        categoryFilter: 'Women',
        subcategoryFilter: 'Tops & Blouses',
      },
      {
        id: 'women-handbags',
        name: 'Handbags & Clutches',
        slug: 'handbags',
        categoryFilter: 'Women',
        subcategoryFilter: 'Handbags & Clutches',
      },
      {
        id: 'women-jewelry',
        name: 'Jewelry & Ornaments',
        slug: 'jewelry',
        categoryFilter: 'Women',
        subcategoryFilter: 'Jewelry & Ornaments',
      },
      {
        id: 'women-shoes',
        name: 'Shoes & Heels',
        slug: 'women-shoes',
        categoryFilter: 'Women',
        subcategoryFilter: 'Shoes & Heels',
      },
      {
        id: 'women-shawls',
        name: 'Shawls & Outerwear',
        slug: 'shawls-outerwear',
        categoryFilter: 'Women',
        subcategoryFilter: 'Outerwear & Shawls',
      },
    ],
  },
  {
    id: 'nav-children',
    label: 'Children',
    slug: 'children',
    items: [
      {
        id: 'children-all',
        name: 'All Children',
        slug: 'all-children',
        categoryFilter: 'Children',
      },
      {
        id: 'children-boys',
        name: 'Boys Clothing',
        slug: 'boys-clothing',
        categoryFilter: 'Children',
        subcategoryFilter: 'Boys Clothing',
      },
      {
        id: 'children-girls',
        name: 'Girls Clothing',
        slug: 'girls-clothing',
        categoryFilter: 'Children',
        subcategoryFilter: 'Girls Clothing',
      },
      {
        id: 'children-baby',
        name: 'Baby & Toddler',
        slug: 'baby-toddler',
        categoryFilter: 'Children',
        subcategoryFilter: 'Baby & Toddler',
      },
      {
        id: 'children-toys',
        name: 'Toys & Games',
        slug: 'toys-games',
        categoryFilter: 'Children',
        subcategoryFilter: 'Toys & Games',
      },
      {
        id: 'children-shoes',
        name: 'Kids Footwear',
        slug: 'kids-footwear',
        categoryFilter: 'Children',
        subcategoryFilter: 'Kids Footwear',
      },
      {
        id: 'children-school',
        name: 'School & Accessories',
        slug: 'school-accessories',
        categoryFilter: 'Children',
        subcategoryFilter: 'School & Accessories',
      },
    ],
  },
  {
    id: 'nav-collections',
    label: 'Collections',
    slug: 'collections',
    items: [
      {
        id: 'col-new-arrivals',
        name: 'New Arrivals',
        slug: 'new-arrivals',
        categoryFilter: 'ALL',
        collectionFilter: 'NEW_ARRIVALS',
      },
      {
        id: 'col-best-sellers',
        name: 'Best Sellers',
        slug: 'best-sellers',
        categoryFilter: 'ALL',
        collectionFilter: 'BEST_SELLERS',
      },
      {
        id: 'col-health-beauty',
        name: 'Health & Beauty',
        slug: 'health-beauty-collection',
        categoryFilter: 'Health & Beauty',
      },
      {
        id: 'col-home-kitchen',
        name: 'Home & Kitchen',
        slug: 'home-kitchen-collection',
        categoryFilter: 'Home & Kitchen',
      },
      {
        id: 'col-watches',
        name: 'Watches',
        slug: 'watches-collection',
        categoryFilter: 'Watches',
      },
      {
        id: 'col-fragrance',
        name: 'Fragrance',
        slug: 'fragrance-collection',
        categoryFilter: 'Fragrance',
      },
      {
        id: 'col-electronics',
        name: 'Electronics',
        slug: 'electronics-collection',
        categoryFilter: 'Electronics',
      },
      {
        id: 'col-offers',
        name: 'Special Offers',
        slug: 'special-offers',
        categoryFilter: 'ALL',
        collectionFilter: 'OFFERS',
      },
    ],
  },
];
