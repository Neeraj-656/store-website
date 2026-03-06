'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Eye, Package, Search, MoreHorizontal } from 'lucide-react';
import Image from 'next/image';
import { productService } from '@/services/api';
import { useToast } from '@/components/ui/toaster';
import { Button, Card, Input, Label, Textarea, StatusBadge, Skeleton } from '@/components/ui';
import { formatCurrency, cn } from '@/lib/utils';
import { MOCK_PRODUCTS } from '@/lib/mock-data';
import type { Product, CreateProductPayload } from '@/types';

const STATUS_OPTIONS = ['ACTIVE', 'DRAFT', 'ARCHIVED'] as const;

function ProductRow({ product, onEdit }: { product: Product; onEdit: (p: Product) => void }) {
  const primary = product.images.find((i) => i.isPrimary) || product.images[0];
  const variant = product.variants[0];
  return (
    <tr className="border-b border-border hover:bg-secondary/30 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
            {primary && <Image src={primary.url} alt={product.name} fill className="object-cover" />}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{product.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{variant?.sku}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground">{product.category?.name || '—'}</td>
      <td className="py-3 px-4">
        <span className="font-semibold text-foreground">{variant ? formatCurrency(parseFloat(variant.price)) : '—'}</span>
      </td>
      <td className="py-3 px-4"><StatusBadge status={product.status} /></td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(product)} className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ProductForm({ product, onClose }: { product?: Product | null; onClose: () => void }) {
  const { add: toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    categoryId: product?.categoryId || '',
    price: product?.variants[0]?.price || '',
    sku: product?.variants[0]?.sku || '',
    imageUrl: product?.images[0]?.url || '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: CreateProductPayload = {
        categoryId: form.categoryId,
        name: form.name,
        description: form.description,
        images: [{ url: form.imageUrl, isPrimary: true }],
        variants: [{ sku: form.sku.toUpperCase(), price: form.price, attributes: {} }],
      };
      return productService.createProduct(payload, crypto.randomUUID());
    },
    onSuccess: () => {
      toast(product ? 'Product updated!' : 'Product created!');
      qc.invalidateQueries({ queryKey: ['vendor-products'] });
      onClose();
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Product Name</Label>
          <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Organic Heirloom Tomatoes" />
        </div>
        <div className="space-y-1">
          <Label>Category ID</Label>
          <Input value={form.categoryId} onChange={(e) => setForm(f => ({ ...f, categoryId: e.target.value }))} placeholder="UUID from catalog service" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the product…" rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>SKU</Label>
          <Input value={form.sku} onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="TOM-HRL-001" />
        </div>
        <div className="space-y-1">
          <Label>Price (USD)</Label>
          <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} placeholder="4.99" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Image URL</Label>
        <Input value={form.imageUrl} onChange={(e) => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" />
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
          {product ? 'Save Changes' : 'Create Product'}
        </Button>
      </div>
    </div>
  );
}

export default function VendorProductsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');

  // Use mock data until backend products endpoint is available
  const products = MOCK_PRODUCTS.slice(0, 6);
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground mt-1">Manage your product listings</p>
        </div>
        <Button onClick={() => { setEditProduct(null); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      {/* Form panel */}
      {showForm && (
        <Card className="p-6">
          <h2 className="font-display text-xl font-semibold text-foreground mb-4">
            {editProduct ? 'Edit Product' : 'New Product'}
          </h2>
          <ProductForm product={editProduct} onClose={() => setShowForm(false)} />
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Product', 'Category', 'Price', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No products found</td></tr>
              ) : (
                filtered.map((p) => (
                  <ProductRow key={p.id} product={p} onEdit={(p) => { setEditProduct(p); setShowForm(true); }} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
