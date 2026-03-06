'use client';
import { useQuery } from '@tanstack/react-query';
import { Users, ShoppingBag, Package, TrendingUp, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { adminService } from '@/services/api';
import { StatCard, Card, CardHeader, CardTitle, CardContent, Skeleton, StatusBadge } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const SERVICE_MAP = [
  { prefix: '/api/v1/auth', service: 'authService', port: '3000', status: 'up' },
  { prefix: '/api/v1/products', service: 'catalogService', port: '3001', status: 'up' },
  { prefix: '/api/v1/orders', service: 'orderService', port: '3002', status: 'up' },
  { prefix: '/api/v1/payments', service: 'paymentService', port: '3004', status: 'up' },
  { prefix: '/api/v1/reviews', service: 'reviewService', port: '3005', status: 'up' },
  { prefix: '/api/v1/inventory', service: 'inventoryService', port: '3006', status: 'up' },
  { prefix: '/api/v1/vendors', service: 'vendorService', port: '3007', status: 'up' },
  { prefix: '/api/v1/payouts', service: 'payoutService', port: '3008', status: 'up' },
  { prefix: '/api/v1/admin', service: 'adminService', port: '3009', status: 'up' },
];

const ACTIVITY = [
  { time: '08:00', orders: 12, users: 5 },
  { time: '10:00', orders: 28, users: 14 },
  { time: '12:00', orders: 45, users: 22 },
  { time: '14:00', orders: 38, users: 18 },
  { time: '16:00', orders: 52, users: 31 },
  { time: '18:00', orders: 67, users: 40 },
  { time: '20:00', orders: 41, users: 24 },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass border border-border rounded-xl px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-medium">{p.value}</span></p>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminService.getDashboard,
    retry: 1,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Platform Overview</h1>
        <p className="text-muted-foreground mt-1">Monitor your entire Verdant ecosystem from here.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Card key={i} className="p-6"><Skeleton className="h-16" /></Card>)
        ) : (
          <>
            <StatCard icon={<Users className="h-5 w-5" />} label="Total Vendors" value={dashboard?.vendors?.total || '—'} change={{ value: `${dashboard?.vendors?.pending || 0} pending KYC`, positive: false }} color="blue" />
            <StatCard icon={<ShoppingBag className="h-5 w-5" />} label="Total Orders" value={dashboard?.orders?.total || '—'} change={{ value: `${dashboard?.orders?.processing || 0} processing`, positive: true }} color="green" />
            <StatCard icon={<Package className="h-5 w-5" />} label="Active Products" value={dashboard?.products?.active || '—'} change={{ value: `${dashboard?.products?.suspended || 0} suspended`, positive: false }} color="gold" />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Services Online" value={`${SERVICE_MAP.length}/9`} change={{ value: 'All systems go', positive: true }} color="purple" />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Platform Activity (Today)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ACTIVITY} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="orders" stroke="#55a558" strokeWidth={2} dot={false} name="orders" />
                <Line type="monotone" dataKey="users" stroke="#d4a843" strokeWidth={2} dot={false} name="users" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Vendor breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Vendor Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Active', value: dashboard?.vendors?.active || 0, color: 'text-forest-400', icon: <CheckCircle className="h-4 w-4" /> },
              { label: 'Pending KYC', value: dashboard?.vendors?.pending || 0, color: 'text-amber-400', icon: <Clock className="h-4 w-4" /> },
              { label: 'Suspended', value: dashboard?.vendors?.suspended || 0, color: 'text-red-400', icon: <XCircle className="h-4 w-4" /> },
            ].map(({ label, value, color, icon }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                <div className={`flex items-center gap-2 text-sm ${color}`}>
                  {icon} {label}
                </div>
                <span className="font-display font-bold text-xl text-foreground">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Service status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Microservices Status</CardTitle>
            <div className="flex items-center gap-1.5 text-xs text-forest-400">
              <span className="h-2 w-2 rounded-full bg-forest-400 animate-pulse" />
              All systems operational
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Gateway Prefix', 'Service', 'Port', 'Status'].map((h) => (
                    <th key={h} className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SERVICE_MAP.map((s) => (
                  <tr key={s.prefix} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-2.5 px-3">
                      <code className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{s.prefix}</code>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-foreground">{s.service}</td>
                    <td className="py-2.5 px-3 text-sm font-mono text-muted-foreground">{s.port}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-forest-400 bg-forest-500/10 border border-forest-500/20 rounded-full px-2.5 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-forest-400 animate-pulse" /> Online
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
