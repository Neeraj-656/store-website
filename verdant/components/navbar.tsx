'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ShoppingCart, Leaf, User, Menu, X, LogOut, Package, LayoutDashboard, Shield } from 'lucide-react';
import { useCartStore } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/api';
import { useToast } from '@/components/ui/toaster';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { count, toggleCart } = useCartStore();
  const { user, isAuthenticated, clearAuth } = useAuthStore();
  const { add: toast } = useToast();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const cartCount = count();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = async () => {
    try { await authService.logout(); } catch {}
    clearAuth();
    toast('Signed out successfully');
    router.push('/');
  };

  const navLinks = [
    { href: '/', label: 'Shop' },
    { href: '/#trending', label: 'Trending' },
    { href: '/#categories', label: 'Categories' },
  ];

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'glass border-b border-border shadow-xl' : 'bg-transparent',
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-xl bg-forest-500/20 flex items-center justify-center group-hover:bg-forest-500/30 transition-colors">
              <Leaf className="h-4 w-4 text-forest-400" />
            </div>
            <span className="font-display text-lg font-bold text-foreground">
              Verd<span className="gradient-text-green">ant</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  pathname === l.href
                    ? 'text-forest-400 bg-forest-500/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Cart */}
            <button
              onClick={toggleCart}
              className="relative h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            >
              <ShoppingCart className="h-4.5 w-4.5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4.5 w-4.5 rounded-full bg-forest-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>

            {/* User */}
            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 h-9 px-3 rounded-xl hover:bg-secondary transition-colors text-sm"
                >
                  <div className="h-6 w-6 rounded-full bg-forest-500/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-forest-400 uppercase">
                      {user.email[0]}
                    </span>
                  </div>
                  <span className="hidden sm:block text-foreground font-medium text-sm max-w-[100px] truncate">
                    {user.email.split('@')[0]}
                  </span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-12 w-52 glass-card border border-border shadow-2xl py-1 z-50">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs text-muted-foreground">Signed in as</p>
                      <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                    </div>
                    {user.role === 'vendor' && (
                      <Link href="/vendor/dashboard" onClick={() => setUserMenuOpen(false)}>
                        <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors cursor-pointer">
                          <LayoutDashboard className="h-4 w-4" /> Vendor Dashboard
                        </div>
                      </Link>
                    )}
                    {user.role === 'admin' && (
                      <Link href="/admin/dashboard" onClick={() => setUserMenuOpen(false)}>
                        <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors cursor-pointer">
                          <Shield className="h-4 w-4" /> Admin Panel
                        </div>
                      </Link>
                    )}
                    <Link href="/orders" onClick={() => setUserMenuOpen(false)}>
                      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors cursor-pointer">
                        <Package className="h-4 w-4" /> My Orders
                      </div>
                    </Link>
                    <div className="border-t border-border mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors w-full text-left"
                      >
                        <LogOut className="h-4 w-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/auth/login">
                <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5">
                  <User className="h-3.5 w-3.5" /> Sign In
                </Button>
              </Link>
            )}

            {/* Mobile menu */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        {menuOpen && (
          <div className="md:hidden border-t border-border py-4 space-y-1 animate-fade-in">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
                <div className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  {l.label}
                </div>
              </Link>
            ))}
            {!isAuthenticated && (
              <Link href="/auth/login" onClick={() => setMenuOpen(false)}>
                <div className="px-3 py-2 rounded-lg text-sm font-medium text-forest-400 hover:bg-forest-500/10 transition-colors">
                  Sign In / Register
                </div>
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
