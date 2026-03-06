import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(date));
}

export function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

export function getStatusColor(status: string) {
  const map: Record<string, string> = {
    PENDING: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    CHECKOUT_INITIATED: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    PROCESSING: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    SHIPPED: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
    DELIVERED: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    CANCELLED: 'text-red-400 bg-red-400/10 border-red-400/20',
    ACTIVE: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    DRAFT: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',
    SUSPENDED: 'text-red-400 bg-red-400/10 border-red-400/20',
    ARCHIVED: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20',
    PUBLISHED: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    REJECTED: 'text-red-400 bg-red-400/10 border-red-400/20',
  };
  return map[status] || 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20';
}
