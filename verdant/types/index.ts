// ── Auth ──────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  role: 'customer' | 'vendor' | 'admin';
  status: string;
  isEmailVerified: boolean;
  vendorId?: string;
  adminId?: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginPayload { email: string; password: string; }
export interface RegisterPayload { email: string; password: string; phone?: string; }

// ── Product / Catalog ─────────────────────────────────────────────────────────
export interface ProductImage {
  id: string;
  url: string;
  isPrimary: boolean;
  altText?: string;
  position: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  price: string;
  attributes: Record<string, string>;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string;
  children?: Category[];
}

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface Product {
  id: string;
  name: string;
  description: string;
  status: ProductStatus;
  categoryId: string;
  category?: Category;
  images: ProductImage[];
  variants: ProductVariant[];
  vendorId: string;
  averageRating?: number;
  totalReviews?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductPayload {
  categoryId: string;
  name: string;
  description: string;
  images: { url: string; isPrimary: boolean; altText?: string }[];
  variants: { sku: string; price: string; attributes: Record<string, string> }[];
}

// ── Orders ────────────────────────────────────────────────────────────────────
export type OrderStatus =
  | 'PENDING'
  | 'CHECKOUT_INITIATED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface OrderItem {
  id: string;
  productId: string;
  variantSku: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderPayload {
  customerId: string;
  items: { productId: string; variantSku: string; quantity: number; unitPrice: number }[];
  idempotencyKey: string;
}

// ── Reviews ───────────────────────────────────────────────────────────────────
export type ReviewStatus = 'PUBLISHED' | 'REJECTED' | 'PENDING';

export interface Review {
  id: string;
  productId: string;
  userId: string;
  orderId: string;
  rating: number;
  title?: string;
  body?: string;
  status: ReviewStatus;
  helpfulCount: number;
  createdAt: string;
}

export interface ProductRating {
  productId: string;
  averageRating: number;
  totalReviews: number;
  oneStar: number;
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
}

// ── Vendor ────────────────────────────────────────────────────────────────────
export interface Vendor {
  id: string;
  email: string;
  businessName?: string;
  status: string;
  kycStatus?: string;
  isActive: boolean;
  createdAt: string;
}

// ── Payout / Wallet ───────────────────────────────────────────────────────────
export interface VendorWallet {
  vendorId: string;
  availableBalance: number;
  pendingBalance: number;
  lifetimeEarnings: number;
  totalPayouts: number;
  currency: string;
}

export interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  referenceId: string;
  referenceType: string;
  description?: string;
  createdAt: string;
}

export interface Payout {
  id: string;
  vendorId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export interface AdminDashboard {
  vendors: { total: number; pending: number; active: number; suspended: number };
  orders: { total: number; pending: number; processing: number };
  products: { total: number; active: number; suspended: number };
}

export interface ModerationCase {
  id: string;
  type: string;
  status: string;
  vendorId?: string;
  productId?: string;
  createdAt: string;
}

// ── Cart (client-side) ────────────────────────────────────────────────────────
export interface CartItem {
  productId: string;
  variantSku: string;
  productName: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  attributes?: Record<string, string>;
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
