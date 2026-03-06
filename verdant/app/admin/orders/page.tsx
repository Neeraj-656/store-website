'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshCw, XCircle, DollarSign, AlertTriangle } from 'lucide-react';
import { adminService } from '@/services/api';
import { useToast } from '@/components/ui/toaster';
import { Card, Button, Skeleton, StatusBadge } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Order } from '@/types';

export default function AdminOrdersPage() {
  const { add: toast } = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<{ type: 'cancel' | 'refund'; orderId: string } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: adminService.getOrderOverrides,
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => adminService.forceCancel(orderId, 'Admin force cancel'),
    onSuccess: () => { toast('Order cancelled ✅'); qc.invalidateQueries({ queryKey: ['admin-orders'] }); setConfirm(null); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const refundMutation = useMutation({
    mutationFn: (orderId: string) => adminService.forceRefund(orderId, 'Admin force refund'),
    onSuccess: () => { toast('Refund initiated ✅'); qc.invalidateQueries({ queryKey: ['admin-orders'] }); setConfirm(null); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const orders: Order[] = (data as { data: Order[] })?.data || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Order Management</h1>
          <p className="text-muted-foreground mt-1">Force-cancel or refund orders as needed</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card border border-border p-6 w-full max-w-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h3 className="font-display text-lg font-bold text-foreground">
                {confirm.type === 'cancel' ? 'Force Cancel Order?' : 'Force Refund Order?'}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              {confirm.type === 'cancel'
                ? 'This will forcefully cancel the order. The customer will be notified.'
                : 'This will initiate a full refund for this order.'}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1"
                loading={cancelMutation.isPending || refundMutation.isPending}
                onClick={() => confirm.type === 'cancel' ? cancelMutation.mutate(confirm.orderId) : refundMutation.mutate(confirm.orderId)}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">No order overrides on record.</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Order ID', 'Customer', 'Status', 'Items', 'Total', 'Date', 'Actions'].map((h) => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">#{order.id.slice(0, 8)}</td>
                    <td className="py-3 px-4 text-xs font-mono text-muted-foreground">{order.customerId?.slice(0, 8)}…</td>
                    <td className="py-3 px-4"><StatusBadge status={order.status} /></td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{order.items?.length || 0}</td>
                    <td className="py-3 px-4 font-semibold text-foreground">{formatCurrency(order.totalAmount)}</td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{formatDate(order.createdAt)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        {!['CANCELLED', 'DELIVERED'].includes(order.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-red-400 hover:bg-red-500/10"
                            onClick={() => setConfirm({ type: 'cancel', orderId: order.id })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                          </Button>
                        )}
                        {order.status === 'DELIVERED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-amber-400 hover:bg-amber-500/10"
                            onClick={() => setConfirm({ type: 'refund', orderId: order.id })}
                          >
                            <DollarSign className="h-3.5 w-3.5 mr-1" /> Refund
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
