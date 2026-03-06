'use client';
import { X, Minus, Plus, ShoppingBag, ArrowRight, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { Button, Separator } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function CartDrawer() {
  const router = useRouter();
  const { items, isOpen, closeCart, removeItem, updateQty, total, count } = useCartStore();
  const { isAuthenticated } = useAuthStore();
  const cartTotal = total();
  const cartCount = count();

  const handleCheckout = () => {
    closeCart();
    if (!isAuthenticated) {
      router.push('/auth/login?redirect=/checkout');
    } else {
      router.push('/checkout');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={closeCart}
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed right-0 top-0 h-full w-full max-w-[420px] z-[70] flex flex-col',
          'bg-card border-l border-border shadow-2xl',
          'transition-transform duration-300 ease-[cubic-bezier(0.77,0,0.175,1)]',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-forest-400" />
            <h2 className="font-display text-lg font-semibold">
              Your Basket
              {cartCount > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">({cartCount})</span>
              )}
            </h2>
          </div>
          <button
            onClick={closeCart}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-display text-lg font-semibold text-foreground mb-1">Your basket is empty</p>
              <p className="text-sm text-muted-foreground">Add some natural goodness to get started.</p>
              <Button variant="default" size="sm" className="mt-4" onClick={closeCart}>
                Continue Shopping
              </Button>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.variantSku} className="flex gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
                {item.imageUrl && (
                  <div className="relative h-16 w-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                    <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.variantSku}
                    {item.attributes && Object.values(item.attributes)[0] && ` · ${Object.values(item.attributes)[0]}`}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQty(item.variantSku, item.quantity - 1)}
                        className="h-6 w-6 rounded-md bg-secondary flex items-center justify-center hover:bg-border transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.variantSku, item.quantity + 1)}
                        className="h-6 w-6 rounded-md bg-secondary flex items-center justify-center hover:bg-border transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                      <button
                        onClick={() => removeItem(item.variantSku)}
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-border p-6 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(cartTotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Delivery</span>
                <span className="text-forest-400">Free</span>
              </div>
              <Separator />
              <div className="flex justify-between font-display font-bold text-lg text-foreground">
                <span>Total</span>
                <span className="gradient-text">{formatCurrency(cartTotal)}</span>
              </div>
            </div>
            <Button size="lg" className="w-full gap-2 text-base" onClick={handleCheckout}>
              {isAuthenticated ? 'Proceed to Checkout' : 'Sign in to Checkout'}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Secure checkout · Free returns · 100% natural guarantee
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
