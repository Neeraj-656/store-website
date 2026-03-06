'use client';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ArrowRight, Leaf, Star, MapPin, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MOCK_PRODUCTS, MOCK_CATEGORIES, HERO_BANNERS, FEATURED_VENDORS } from '@/lib/mock-data';
import { ProductCard, ProductCardSkeleton } from '@/components/product-card';
import { Navbar } from '@/components/navbar';
import { CartDrawer } from '@/components/cart-drawer';
import { Button, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

// ── Hero Carousel ─────────────────────────────────────────────────────────────
function HeroSection() {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const go = (idx: number) => {
    setDirection(idx > active ? 1 : -1);
    setActive(idx);
  };

  const next = () => go((active + 1) % HERO_BANNERS.length);
  const prev = () => go((active - 1 + HERO_BANNERS.length) % HERO_BANNERS.length);

  useEffect(() => {
    timerRef.current = setInterval(next, 5500);
    return () => clearInterval(timerRef.current);
  }, [active]);

  const banner = HERO_BANNERS[active];

  return (
    <section className="relative h-[88vh] min-h-[580px] max-h-[820px] overflow-hidden">
      {/* Background image */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={active}
          custom={direction}
          variants={{ enter: (d: number) => ({ x: d * 60, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: d * -60, opacity: 0 }) }}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          <Image src={banner.image} alt={banner.title} fill priority className="object-cover" quality={90} />
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="relative z-10 h-full flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-2xl"
            >
              <Badge variant="default" className="mb-4 text-xs uppercase tracking-widest">
                <Leaf className="h-3 w-3" /> 100% Certified Organic
              </Badge>
              <h1 className="font-display text-5xl md:text-7xl font-bold text-white leading-none mb-5">
                {banner.title.split(' ').map((word, i) => (
                  <span key={i} className={i === 0 ? 'gradient-text-green' : ''}>{word} </span>
                ))}
              </h1>
              <p className="text-lg text-white/70 font-light leading-relaxed mb-8 max-w-xl">
                {banner.subtitle}
              </p>
              <div className="flex items-center gap-3">
                <Link href="#products">
                  <Button size="xl" className="gap-2 text-base shadow-2xl shadow-forest-500/30">
                    {banner.cta} <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button variant="glass" size="xl" className="text-base">
                    Join Verdant
                  </Button>
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4">
        <button onClick={prev} className="h-9 w-9 rounded-xl glass flex items-center justify-center text-white hover:bg-white/20 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          {HERO_BANNERS.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className={cn('rounded-full transition-all duration-300', i === active ? 'w-6 h-2 bg-forest-400' : 'w-2 h-2 bg-white/30 hover:bg-white/60')}
            />
          ))}
        </div>
        <button onClick={next} className="h-9 w-9 rounded-xl glass flex items-center justify-center text-white hover:bg-white/20 transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 right-8 z-10 hidden lg:flex items-center gap-2 text-white/40 text-xs animate-bounce">
        <span>Scroll</span>
        <div className="w-px h-8 bg-white/20" />
      </div>
    </section>
  );
}

// ── Ticker ────────────────────────────────────────────────────────────────────
function MarqueeTicker() {
  const items = ['🌿 100% Organic', '🚚 Free Delivery Over $50', '🐝 Ethically Sourced', '♻️ Zero-Waste Packaging', '⭐ 4.9 Average Rating', '🌱 Farm-to-Door Fresh'];
  return (
    <div className="bg-forest-900/80 border-y border-forest-800/50 py-2.5 overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap">
        {[...items, ...items].map((item, i) => (
          <span key={i} className="text-xs font-medium text-forest-300 tracking-widest uppercase mx-8">{item}</span>
        ))}
      </div>
    </div>
  );
}

// ── Category Row ──────────────────────────────────────────────────────────────
function CategoriesRow() {
  const icons: Record<string, string> = {
    Vegetables: '🥦', Fruits: '🍇', Pantry: '🫙', Bakery: '🍞',
    'Herbs & Spices': '🌿', 'Dairy & Eggs': '🥚', Superfoods: '✨', Beverages: '🍵',
  };
  return (
    <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-8 py-14">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="font-display text-3xl font-bold text-foreground">Shop by Category</h2>
          <p className="text-muted-foreground mt-1">Explore our range of natural goods</p>
        </div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {MOCK_CATEGORIES.map((cat) => (
          <Link key={cat.id} href={`/category/${cat.slug}`}>
            <div className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-card hover:border-forest-500/50 hover:bg-forest-500/5 transition-all duration-200 cursor-pointer group text-center">
              <span className="text-3xl">{icons[cat.name] || '🌱'}</span>
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{cat.name}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Product Slider ────────────────────────────────────────────────────────────
function ProductSlider({ title, subtitle, products }: { title: string; subtitle: string; products: typeof MOCK_PRODUCTS }) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') => {
    if (!sliderRef.current) return;
    sliderRef.current.scrollBy({ left: dir === 'right' ? 320 : -320, behavior: 'smooth' });
  };

  return (
    <section className="py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-3xl font-bold text-foreground">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => scroll('left')} className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-forest-500/50 transition-all">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => scroll('right')} className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-forest-500/50 transition-all">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div ref={sliderRef} className="slider-container flex gap-4 pb-2">
          {products.map((p) => (
            <div key={p.id} className="slider-item flex-shrink-0 w-[240px] sm:w-[260px]">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Products Grid ─────────────────────────────────────────────────────────────
function ProductsGrid({ title, subtitle, products }: { title: string; subtitle: string; products: typeof MOCK_PRODUCTS }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = products.filter((p) => {
    const matchCat = activeCategory === 'All' || p.category?.name === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category?.name || '')))];

  return (
    <section id="products" className="py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-3xl font-bold text-foreground">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
          </div>
          <input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 px-3 rounded-xl border border-border bg-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full sm:w-56"
          />
        </div>
        {/* Category pills */}
        <div className="flex gap-2 flex-wrap mb-6">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200',
                activeCategory === c
                  ? 'bg-forest-500 border-forest-500 text-white'
                  : 'border-border bg-card text-muted-foreground hover:border-forest-500/50 hover:text-foreground',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Vendor Spotlight ──────────────────────────────────────────────────────────
function VendorSpotlight() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8 py-14">
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold text-foreground">Vendor Spotlight</h2>
        <p className="text-muted-foreground mt-1">Meet the farms and artisans behind your food</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURED_VENDORS.map((vendor) => (
          <div key={vendor.id} className="glass-card p-4 flex flex-col gap-3 card-hover border border-border">
            <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-secondary">
              <Image src={vendor.image} alt={vendor.name} fill className="object-cover" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground">{vendor.name}</h3>
              <p className="text-xs text-forest-400 mt-0.5">{vendor.specialty}</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{vendor.location}</span>
              <span className="flex items-center gap-1"><Package className="h-3 w-3" />{vendor.products} products</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" />
              <span className="text-sm font-semibold text-foreground">{vendor.rating}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Leaf className="h-5 w-5 text-forest-400" />
              <span className="font-display text-xl font-bold">Verd<span className="gradient-text-green">ant</span></span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              A marketplace rooted in nature. Every product is chosen for freshness, purity, and ecological harmony.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Shop</p>
            {MOCK_CATEGORIES.slice(0, 5).map((c) => (
              <Link key={c.id} href={`/category/${c.slug}`}>
                <p className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-1.5 cursor-pointer">{c.name}</p>
              </Link>
            ))}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Account</p>
            {[['Sign In', '/auth/login'], ['Register', '/auth/register'], ['My Orders', '/orders'], ['Become a Vendor', '/auth/register?type=vendor']].map(([label, href]) => (
              <Link key={href} href={href}>
                <p className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-1.5 cursor-pointer">{label}</p>
              </Link>
            ))}
          </div>
        </div>
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Verdant Market. All rights reserved.</span>
          <span>Powered by your microservices backend · gateway:8080</span>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StorePage() {
  const trending = MOCK_PRODUCTS.sort((a, b) => (b.totalReviews || 0) - (a.totalReviews || 0)).slice(0, 8);
  const newArrivals = MOCK_PRODUCTS.slice().reverse().slice(0, 8);

  return (
    <>
      <Navbar />
      <CartDrawer />
      <main>
        <HeroSection />
        <MarqueeTicker />
        <CategoriesRow />
        <div className="bg-gradient-to-b from-background to-forest-950/20">
          <ProductSlider
            title="Trending Right Now"
            subtitle="Most loved by our community this week"
            products={trending}
          />
        </div>
        <VendorSpotlight />
        <ProductsGrid
          title="All Products"
          subtitle="Browse our full range of natural groceries"
          products={MOCK_PRODUCTS}
        />
        <Footer />
      </main>
    </>
  );
}
