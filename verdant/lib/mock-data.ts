import type { Product, Category } from '@/types';

export const MOCK_CATEGORIES: Category[] = [
  { id: '1', name: 'Vegetables', slug: 'vegetables' },
  { id: '2', name: 'Fruits', slug: 'fruits' },
  { id: '3', name: 'Pantry', slug: 'pantry' },
  { id: '4', name: 'Bakery', slug: 'bakery' },
  { id: '5', name: 'Herbs & Spices', slug: 'herbs-spices' },
  { id: '6', name: 'Dairy & Eggs', slug: 'dairy-eggs' },
  { id: '7', name: 'Superfoods', slug: 'superfoods' },
  { id: '8', name: 'Beverages', slug: 'beverages' },
];

const makeProduct = (
  id: string, name: string, desc: string, price: string, sku: string,
  imgPath: string, catName: string, catSlug: string, rating: number, reviews: number,
  attrs: Record<string, string> = {},
): Product => ({
  id, name, description: desc, status: 'ACTIVE',
  categoryId: catSlug, vendorId: 'vendor-1',
  category: { id: catSlug, name: catName, slug: catSlug },
  images: [{ id: `${id}-img`, url: imgPath, isPrimary: true, altText: name, position: 0 }],
  variants: [{ id: `${id}-v1`, sku, price, attributes: attrs }],
  averageRating: rating, totalReviews: reviews,
  createdAt: '2024-01-15T00:00:00Z', updatedAt: '2024-01-15T00:00:00Z',
});

export const MOCK_PRODUCTS: Product[] = [
  makeProduct('p1', 'Heirloom Tomatoes', 'Sun-ripened on local farms. Bursting with garden-fresh flavour, zero pesticides.', '4.99', 'TOM-HRL-001', 'https://images.unsplash.com/photo-1546470427-e26264be0b0d?w=600&h=600&fit=crop', 'Vegetables', 'vegetables', 4.8, 124, { weight: '500g' }),
  makeProduct('p2', 'Raw Wildflower Honey', 'Unfiltered, unpasteurized honey from free-roaming bees in meadow wildflowers.', '12.99', 'HON-WLD-001', 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&h=600&fit=crop', 'Pantry', 'pantry', 4.9, 89, { size: '450g jar' }),
  makeProduct('p3', 'Cold-Pressed Olive Oil', 'Extra virgin, first cold press from ancient Kalamata groves. Robust and peppery.', '18.50', 'OIL-OLV-001', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=600&fit=crop', 'Pantry', 'pantry', 4.7, 67, { size: '500ml' }),
  makeProduct('p4', 'Sprouted Grain Bread', 'Slow-fermented sourdough with sprouted wheat. Dense, nutty, deeply satisfying.', '7.25', 'BRD-SPR-001', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&h=600&fit=crop', 'Bakery', 'bakery', 4.6, 203, { weight: '800g loaf' }),
  makeProduct('p5', 'Fresh Turmeric Root', 'Vibrant turmeric harvested at peak potency. Earthy, warming, anti-inflammatory.', '3.50', 'TUR-FRS-001', 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=600&h=600&fit=crop', 'Herbs & Spices', 'herbs-spices', 4.5, 44, { weight: '200g' }),
  makeProduct('p6', 'Pasture-Raised Eggs', 'From hens that roam free on lush pastures. Rich golden yolks, exceptional flavour.', '8.99', 'EGG-PST-001', 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=600&h=600&fit=crop', 'Dairy & Eggs', 'dairy-eggs', 4.9, 312, { count: 'Dozen' }),
  makeProduct('p7', 'Maca Root Powder', 'Adaptogenic maca from Peruvian highlands. Earthy, malty, energises naturally.', '15.00', 'MAC-PWD-001', 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&h=600&fit=crop', 'Superfoods', 'superfoods', 4.3, 78, { size: '250g' }),
  makeProduct('p8', 'Organic Matcha', 'Ceremonial-grade matcha from Uji, Japan. Vibrant, umami-rich, stone-ground.', '22.00', 'MAT-CER-001', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&h=600&fit=crop', 'Beverages', 'beverages', 4.8, 156, { size: '50g tin' }),
  makeProduct('p9', 'Cashew Cream Cheese', 'Vegan cream cheese from organic cashews. Smooth, tangy, and perfectly spreadable.', '6.75', 'CHS-CSH-001', 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a318?w=600&h=600&fit=crop', 'Dairy & Eggs', 'dairy-eggs', 4.4, 56, { size: '200g' }),
  makeProduct('p10', 'Dragon Fruit', 'Vibrant pink pitaya, sweet with a subtle earthiness. High in antioxidants.', '5.50', 'FRT-DRG-001', 'https://images.unsplash.com/photo-1527325678964-54921661f888?w=600&h=600&fit=crop', 'Fruits', 'fruits', 4.6, 91, { weight: '300g' }),
  makeProduct('p11', 'Spirulina Powder', 'Ocean-grown spirulina, packed with protein, iron and B-vitamins.', '19.99', 'SPR-PWD-001', 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab12?w=600&h=600&fit=crop', 'Superfoods', 'superfoods', 4.2, 43, { size: '200g' }),
  makeProduct('p12', 'Avocado Oil', 'Cold-pressed Hass avocado oil with a delicate, buttery flavour profile.', '14.99', 'OIL-AVO-001', 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&h=600&fit=crop', 'Pantry', 'pantry', 4.7, 88, { size: '250ml' }),
];

export const HERO_BANNERS = [
  {
    id: 1,
    title: 'Pure. Natural. Grown with Care.',
    subtitle: 'Farm-to-door organics, sourced with intention and delivered with love.',
    cta: 'Shop Now',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600&h=800&fit=crop',
    accent: '#55a558',
  },
  {
    id: 2,
    title: 'New Season Harvest is Here',
    subtitle: 'Crisp autumn vegetables and golden pantry staples from local farms.',
    cta: 'Explore Harvest',
    image: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1600&h=800&fit=crop',
    accent: '#d4a843',
  },
  {
    id: 3,
    title: 'Superfoods for Super You',
    subtitle: 'Maca, matcha, spirulina — nature\'s most powerful ingredients, ethically sourced.',
    cta: 'Discover Superfoods',
    image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1600&h=800&fit=crop',
    accent: '#9bbf9d',
  },
];

export const FEATURED_VENDORS = [
  { id: 'v1', name: 'Green Roots Farm', specialty: 'Organic Vegetables', location: 'California', products: 24, rating: 4.9, image: 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=400&h=400&fit=crop' },
  { id: 'v2', name: "Hive & Harvest", specialty: 'Raw Honey & Preserves', location: 'Vermont', products: 12, rating: 4.8, image: 'https://images.unsplash.com/photo-1471193945509-9ad0617afabf?w=400&h=400&fit=crop' },
  { id: 'v3', name: 'Sunrise Bakehouse', specialty: 'Artisan Sourdough', location: 'Oregon', products: 8, rating: 4.7, image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=400&fit=crop' },
  { id: 'v4', name: 'Pure Earth Superfoods', specialty: 'Adaptogens & Powders', location: 'Colorado', products: 18, rating: 4.6, image: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400&h=400&fit=crop' },
];
