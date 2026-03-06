'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Star, Plus } from 'lucide-react';
import { useCartStore } from '@/store/cart.store';
import { useToast } from '@/components/ui/toaster';
import { Badge, Skeleton } from '@/components/ui';
import { formatCurrency, cn } from '@/lib/utils';
import type { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const router = useRouter();
  const { addItem, openCart } = useCartStore();
  const { add: toast } = useToast();

  const primaryImage = product.images.find((i) => i.isPrimary) || product.images[0];
  const variant = product.variants[0];
  const price = variant ? parseFloat(variant.price) : 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!variant) return;
    addItem({
      productId: product.id,
      variantSku: variant.sku,
      productName: product.name,
      price,
      quantity: 1,
      imageUrl: primaryImage?.url,
      attributes: variant.attributes,
    });
    toast(`${product.name} added to basket 🌿`);
    openCart();
  };

  return (
    <div
      onClick={() => router.push(`/product/${product.id}`)}
      className={cn(
        'group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden cursor-pointer card-hover',
        className,
      )}
    >
      {/* Image */}
      <div className="relative h-52 overflow-hidden bg-secondary">
        {primaryImage ? (
          <Image
            src={primaryImage.url}
            alt={primaryImage.altText || product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No image
          </div>
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Category tag */}
        {product.category && (
          <div className="absolute top-3 left-3">
            <Badge variant="default" className="text-[10px] font-bold tracking-wider uppercase backdrop-blur-sm">
              {product.category.name}
            </Badge>
          </div>
        )}

        {/* Quick add button */}
        <button
          onClick={handleAddToCart}
          className={cn(
            'absolute bottom-3 right-3 h-9 w-9 rounded-xl bg-forest-500 text-white flex items-center justify-center',
            'transition-all duration-300 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0',
            'hover:bg-forest-600 shadow-lg shadow-forest-500/30',
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        <h3 className="font-display font-semibold text-foreground text-sm leading-snug mb-1 line-clamp-2">
          {product.name}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2 flex-1 leading-relaxed">
          {product.description}
        </p>

        {/* Rating */}
        {(product.averageRating || 0) > 0 && (
          <div className="flex items-center gap-1 mt-2">
            <Star className="h-3 w-3 fill-gold-500 text-gold-500" />
            <span className="text-xs font-medium text-foreground">{product.averageRating?.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">({product.totalReviews})</span>
          </div>
        )}

        {/* Price + add */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <div>
            <span className="font-display font-bold text-xl text-foreground">{formatCurrency(price)}</span>
            {variant?.attributes && Object.values(variant.attributes)[0] && (
              <span className="text-xs text-muted-foreground ml-1">/ {Object.values(variant.attributes)[0]}</span>
            )}
          </div>
          <button
            onClick={handleAddToCart}
            className="h-8 w-8 rounded-xl bg-forest-500/10 text-forest-400 hover:bg-forest-500 hover:text-white flex items-center justify-center transition-all duration-200"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
export function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <Skeleton className="h-52 rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex justify-between items-center pt-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-8 w-8 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
