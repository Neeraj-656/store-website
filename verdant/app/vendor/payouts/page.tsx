'use client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { DollarSign, ArrowDownToLine, TrendingUp, Clock, RefreshCw } from 'lucide-react';
import { payoutService } from '@/services/api';
import { useToast } from '@/components/ui/toaster';
import { StatCard, Card, CardHeader, CardTitle, CardContent, Button, Input, Label, StatusBadge, Skeleton } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function VendorPayoutsPage() {
  const { add: toast } = useToast();
  const [payoutAmount, setPayoutAmount] = useState('');
  const [bankDetails, setBankDetails] = useState({ bankAccountId: '', ifscCode: '', accountNumber: '' });
  const [showForm, setShowForm] = useState(false);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['vendor-wallet'],
    queryFn: payoutService.getWallet,
  });

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['vendor-ledger'],
    queryFn: () => payoutService.getLedger({ limit: 10 }),
  });

  const { data: payoutsData } = useQuery({
    queryKey: ['vendor-payouts'],
    queryFn: payoutService.listPayouts,
  });

  const payoutMutation = useMutation({
    mutationFn: () => payoutService.requestPayout({
      amount: Math.round(parseFloat(payoutAmount) * 100),
      ...bankDetails,
    }),
    onSuccess: () => {
      toast('Payout requested successfully! 🎉');
      setShowForm(false);
      setPayoutAmount('');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const ledger = (ledgerData as { data: unknown[] })?.data || [];
  const payouts = (payoutsData as { data: unknown[] })?.data || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Payouts & Wallet</h1>
        <p className="text-muted-foreground mt-1">Manage your earnings and withdrawal requests</p>
      </div>

      {/* Wallet stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {walletLoading ? (
          [...Array(4)].map((_, i) => <Card key={i} className="p-6"><Skeleton className="h-16" /></Card>)
        ) : (
          <>
            <StatCard icon={<DollarSign className="h-5 w-5" />} label="Available Balance" value={formatCurrency((wallet?.availableBalance || 0) / 100)} color="green" />
            <StatCard icon={<Clock className="h-5 w-5" />} label="Pending (Escrow)" value={formatCurrency((wallet?.pendingBalance || 0) / 100)} color="gold" />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Lifetime Earnings" value={formatCurrency((wallet?.lifetimeEarnings || 0) / 100)} color="blue" />
            <StatCard icon={<ArrowDownToLine className="h-5 w-5" />} label="Total Payouts" value={wallet?.totalPayouts || 0} color="purple" />
          </>
        )}
      </div>

      {/* Request payout */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Request a Payout</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5">
              <ArrowDownToLine className="h-3.5 w-3.5" /> Withdraw
            </Button>
          </div>
        </CardHeader>
        {showForm && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="space-y-1">
                <Label>Amount (USD)</Label>
                <Input type="number" step="0.01" placeholder="100.00" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} />
                <p className="text-xs text-muted-foreground">Available: {formatCurrency((wallet?.availableBalance || 0) / 100)}</p>
              </div>
              <div className="space-y-1">
                <Label>Bank Account ID</Label>
                <Input placeholder="Bank account reference" value={bankDetails.bankAccountId} onChange={(e) => setBankDetails(b => ({ ...b, bankAccountId: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>IFSC Code</Label>
                <Input placeholder="SBIN0001234" value={bankDetails.ifscCode} onChange={(e) => setBankDetails(b => ({ ...b, ifscCode: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Account Number</Label>
                <Input placeholder="Last 4 digits: XXXX" value={bankDetails.accountNumber} onChange={(e) => setBankDetails(b => ({ ...b, accountNumber: e.target.value }))} />
              </div>
            </div>
            <Button loading={payoutMutation.isPending} onClick={() => payoutMutation.mutate()}>
              Submit Payout Request
            </Button>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ledger */}
        <Card>
          <CardHeader><CardTitle>Recent Ledger Entries</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {ledgerLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No ledger entries yet</p>
            ) : (
              <div className="space-y-2">
                {ledger.map((entry: unknown) => {
                  const e = entry as { id: string; type: string; amount: number; description?: string; createdAt: string };
                  return (
                    <div key={e.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{e.type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{e.description || formatDate(e.createdAt)}</p>
                      </div>
                      <span className={`text-sm font-bold ${e.type === 'CREDIT' ? 'text-forest-400' : 'text-red-400'}`}>
                        {e.type === 'CREDIT' ? '+' : '-'}{formatCurrency(e.amount / 100)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payout history */}
        <Card>
          <CardHeader><CardTitle>Payout History</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {payouts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No payouts yet</p>
            ) : (
              <div className="space-y-2">
                {payouts.map((p: unknown) => {
                  const payout = p as { id: string; amount: number; status: string; createdAt: string };
                  return (
                    <div key={payout.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{formatCurrency(payout.amount / 100)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(payout.createdAt)}</p>
                      </div>
                      <StatusBadge status={payout.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
