'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, CheckCircle, XCircle, AlertTriangle, Eye } from 'lucide-react';
import { adminService } from '@/services/api';
import { useToast } from '@/components/ui/toaster';
import { Card, Button, Skeleton, StatusBadge } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { Vendor } from '@/types';

function ConfirmModal({ title, message, onConfirm, onCancel, loading }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-card border border-border p-6 w-full max-w-sm">
        <h3 className="font-display text-lg font-bold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{message}</p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button className="flex-1" loading={loading} onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminVendorsPage() {
  const { add: toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<{ type: string; vendorId: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-vendors'],
    queryFn: () => adminService.listVendors(),
  });

  const approveMutation = useMutation({
    mutationFn: (vendorId: string) => adminService.approveVendorKyc(vendorId, {}),
    onSuccess: () => { toast('KYC approved ✅'); qc.invalidateQueries({ queryKey: ['admin-vendors'] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: (vendorId: string) => adminService.rejectVendorKyc(vendorId, 'Documents insufficient'),
    onSuccess: () => { toast('KYC rejected'); qc.invalidateQueries({ queryKey: ['admin-vendors'] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const suspendMutation = useMutation({
    mutationFn: (vendorId: string) => adminService.suspendVendor(vendorId, 'Policy violation'),
    onSuccess: () => { toast('Vendor suspended'); qc.invalidateQueries({ queryKey: ['admin-vendors'] }); setConfirm(null); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const vendors: Vendor[] = (data as { data: Vendor[] })?.data || [];
  const filtered = vendors.filter((v) => v.id.includes(search) || (v.businessName || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Vendors</h1>
        <p className="text-muted-foreground mt-1">Review KYC documents and manage vendor status</p>
      </div>

      {confirm && confirm.type === 'suspend' && (
        <ConfirmModal
          title="Suspend Vendor?"
          message="This vendor will be unable to sell products until unsuspended. This action can be reversed."
          onConfirm={() => suspendMutation.mutate(confirm.vendorId)}
          onCancel={() => setConfirm(null)}
          loading={suspendMutation.isPending}
        />
      )}

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : vendors.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No vendors found. They will appear here after registering.
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Vendor ID', 'Status', 'KYC', 'Active', 'Joined', 'Actions'].map((h) => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="border-b border-border hover:bg-secondary/30 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-mono text-xs text-muted-foreground">#{v.id.slice(0, 12)}…</p>
                      {v.businessName && <p className="text-sm font-medium text-foreground">{v.businessName}</p>}
                    </td>
                    <td className="py-3 px-4"><StatusBadge status={v.status} /></td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium ${v.kycStatus === 'APPROVED' ? 'text-forest-400' : v.kycStatus === 'REJECTED' ? 'text-red-400' : 'text-amber-400'}`}>
                        {v.kycStatus || 'PENDING'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {v.isActive ? <CheckCircle className="h-4 w-4 text-forest-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{formatDate(v.createdAt)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        {v.kycStatus !== 'APPROVED' && (
                          <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => approveMutation.mutate(v.id)} loading={approveMutation.isPending}>
                            Approve
                          </Button>
                        )}
                        {v.kycStatus !== 'REJECTED' && (
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => rejectMutation.mutate(v.id)}>
                            Reject
                          </Button>
                        )}
                        {v.isActive && (
                          <Button size="sm" variant="outline" className="h-7 text-xs text-amber-400 border-amber-400/30 hover:bg-amber-400/10" onClick={() => setConfirm({ type: 'suspend', vendorId: v.id })}>
                            <AlertTriangle className="h-3 w-3 mr-1" /> Suspend
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
