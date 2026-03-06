'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, ShoppingBag, BarChart2,
  Shield, FileText, LogOut, Leaf, ChevronRight, Menu, AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/api';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/vendors', label: 'Vendors', icon: Users },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/moderation', label: 'Moderation', icon: AlertTriangle },
  { href: '/admin/reports', label: 'Reports', icon: BarChart2 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, clearAuth } = useAuthStore();
  const { add: toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'admin') {
      router.push('/auth/login');
    }
  }, [isAuthenticated, user, router]);

  const handleLogout = async () => {
    try { await authService.logout(); } catch {}
    clearAuth();
    toast('Signed out');
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-background flex">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        'fixed left-0 top-0 h-full w-60 z-50 flex flex-col border-r border-border transition-transform duration-300',
        'bg-[hsl(220_13%_8%)]',
        'lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <div className="h-7 w-7 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-red-400" />
          </div>
          <span className="font-display font-bold text-foreground">Admin Control</span>
        </div>

        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-red-500/20 flex items-center justify-center">
              <span className="text-sm font-bold text-red-400 uppercase">{user?.email?.[0] || 'A'}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.email?.split('@')[0]}</p>
              <p className="text-xs text-red-400 font-semibold">Super Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/admin/dashboard' && pathname.startsWith(href));
            return (
              <Link key={href} href={href} onClick={() => setSidebarOpen(false)}>
                <div className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                  active ? 'bg-red-500/15 text-red-400' : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                )}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{label}</span>
                  {active && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 space-y-1 border-t border-border">
          <Link href="/">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-forest-400 hover:bg-forest-500/10 transition-all cursor-pointer">
              <Leaf className="h-4 w-4" /> View Store
            </div>
          </Link>
          <button onClick={handleLogout} className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all w-full">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:ml-60 min-w-0">
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-secondary">
            <Menu className="h-4 w-4" />
          </button>
          <span className="font-display font-bold">Admin Panel</span>
          <div />
        </div>
        <div className="p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
