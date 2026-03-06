'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Package, ChevronRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { orderService } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { Navbar } from '@/components/navbar';
import { CartDrawer } from '@/components/cart-drawer';
import { Card, Skeleton, StatusBadge, Button } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Order } from '@/types';

function OrderCard({ order }: { order: Order }) {
  return (
    <Card className="p-5 hover:border-forest-500/30 transition-colors cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground font-mono">#{order.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{formatDate(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="space-y-1.5 mb-4">
        {order.items?.slice(0, 3).map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{item.productName || item.variantSku} <span className="text-foreground">×{item.quantity}</span></span>
            <span className="text-foreground">{formatCurrency(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
        {order.items?.length > 3 && (
          <p className="text-xs text-muted-foreground">+{order.items.length - 3} more items</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div>
          <span className="text-xs text-muted-foreground">Total</span>
          <p className="font-display font-bold text-xl text-foreground">{formatCurrency(order.totalAmount)}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Card>
  );
}

function OrderSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex justify-between mb-4">
        <div className="space-y-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-32" /></div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="space-y-2 mb-4">
        <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex justify-between pt-3 border-t border-border">
        <Skeleton className="h-6 w-20" /><Skeleton className="h-4 w-4" />
      </div>
    </Card>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) router.push('/auth/login?redirect=/orders');
  }, [isAuthenticated, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', user?.id],
    queryFn: () => orderService.getByCustomer(user!.id, { limit: 20 }),
    enabled: !!user?.id,
  });

  const orders: Order[] = (data as { data: Order[] })?.data || [];

  return (
    <>
      <Navbar />
      <CartDrawer />
      <main className="pt-24 pb-16 min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Shop
            </Link>
            <h1 className="font-display text-4xl font-bold text-foreground">My Orders</h1>
            <p className="text-muted-foreground mt-1">Track and manage your Verdant orders</p>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <OrderSkeleton key={i} />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground mb-1">No orders yet</h3>
              <p className="text-muted-foreground text-sm mb-6">Time to stock up on some natural goodness!</p>
              <Link href="/"><Button>Start Shopping</Button></Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => <OrderCard key={order.id} order={order} />)}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
