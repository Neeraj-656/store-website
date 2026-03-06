'use client';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, ShoppingBag, Package, TrendingUp, ArrowUpRight, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { payoutService, orderService } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { StatCard, Card, CardHeader, CardTitle, CardContent, Skeleton, StatusBadge } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

const REVENUE_DATA = [
  { month: 'Jan', revenue: 1200, orders: 24 },
  { month: 'Feb', revenue: 1900, orders: 38 },
  { month: 'Mar', revenue: 1600, orders: 31 },
  { month: 'Apr', revenue: 2400, orders: 46 },
  { month: 'May', revenue: 2100, orders: 42 },
  { month: 'Jun', revenue: 3200, orders: 58 },
  { month: 'Jul', revenue: 2800, orders: 52 },
];

const CATEGORY_DATA = [
  { name: 'Vegetables', sales: 420 },
  { name: 'Pantry', sales: 310 },
  { name: 'Bakery', sales: 180 },
  { name: 'Superfoods', sales: 240 },
  { name: 'Dairy', sales: 290 },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass border border-border rounded-xl px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          {p.name}: <span className="text-forest-400 font-medium">{p.name === 'revenue' ? formatCurrency(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function VendorDashboard() {
  const { user } = useAuthStore();

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['vendor-wallet'],
    queryFn: payoutService.getWallet,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">
          Good morning, <span className="gradient-text-green">{user?.email?.split('@')[0]}</span> 👋
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your store today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {walletLoading ? (
          [...Array(4)].map((_, i) => <Card key={i} className="p-6"><Skeleton className="h-16" /></Card>)
        ) : (
          <>
            <StatCard
              icon={<DollarSign className="h-5 w-5" />}
              label="Available Balance"
              value={formatCurrency((wallet?.availableBalance || 0) / 100)}
              change={{ value: '+12.5% this month', positive: true }}
              color="green"
            />
            <StatCard
              icon={<Clock className="h-5 w-5" />}
              label="Pending Balance"
              value={formatCurrency((wallet?.pendingBalance || 0) / 100)}
              color="gold"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Lifetime Earnings"
              value={formatCurrency((wallet?.lifetimeEarnings || 0) / 100)}
              change={{ value: 'All time', positive: true }}
              color="blue"
            />
            <StatCard
              icon={<CheckCircle className="h-5 w-5" />}
              label="Total Payouts"
              value={wallet?.totalPayouts || 0}
              color="purple"
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>Revenue Overview</CardTitle>
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-lg">Last 7 months</span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={REVENUE_DATA} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#338836" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#338836" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="revenue" stroke="#55a558" strokeWidth={2} fill="url(#revGrad)" name="revenue" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Sales by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={CATEGORY_DATA} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="sales" fill="#55a558" radius={[0, 4, 4, 0]} name="sales" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Add New Product', desc: 'List a new product for sale', href: '/vendor/products/new', icon: Package, color: 'forest' },
          { label: 'View Orders', desc: 'Manage incoming orders', href: '/vendor/orders', icon: ShoppingBag, color: 'gold' },
          { label: 'Request Payout', desc: 'Withdraw your earnings', href: '/vendor/payouts', icon: DollarSign, color: 'blue' },
        ].map(({ label, desc, href, icon: Icon, color }) => (
          <a key={href} href={href} className="glass-card p-4 flex items-center gap-4 card-hover border border-border group">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color === 'forest' ? 'bg-forest-500/15 text-forest-400' : color === 'gold' ? 'bg-gold-500/15 text-gold-500' : 'bg-sky-500/15 text-sky-400'}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-forest-400 transition-colors">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-forest-400 transition-colors ml-auto flex-shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}
