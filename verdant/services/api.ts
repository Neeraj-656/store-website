import apiClient from '@/lib/api-client';
import type {
  LoginPayload, RegisterPayload, AuthTokens, User,
  Product, CreateProductPayload, ProductRating,
  Order, CreateOrderPayload,
  Review, PaginatedResponse,
  Vendor, VendorWallet, LedgerEntry, Payout,
  AdminDashboard, ModerationCase,
} from '@/types';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authService = {
  login: async (payload: LoginPayload) => {
    const { data } = await apiClient.post('/auth/login', payload);
    return data.data as { user: User; accessToken: string; refreshToken: string };
  },
  registerCustomer: async (payload: RegisterPayload) => {
    const { data } = await apiClient.post('/auth/register/customer', payload);
    return data.data as User;
  },
  registerVendor: async (payload: RegisterPayload) => {
    const { data } = await apiClient.post('/auth/register/vendor', payload);
    return data.data as User;
  },
  logout: async (refreshToken?: string) => {
    await apiClient.post('/auth/logout', { refreshToken });
  },
  me: async () => {
    const { data } = await apiClient.get('/auth/me');
    return data.data as User;
  },
  forgotPassword: async (email: string) => {
    const { data } = await apiClient.post('/auth/forgot-password', { email });
    return data;
  },
  resetPassword: async (payload: { email: string; otp: string; newPassword: string }) => {
    const { data } = await apiClient.post('/auth/reset-password', payload);
    return data;
  },
};

// ── Products ──────────────────────────────────────────────────────────────────
export const productService = {
  getPublicProduct: async (id: string) => {
    const { data } = await apiClient.get(`/products/public/${id}`);
    return data.data as Product;
  },
  // Vendor product management
  createProduct: async (payload: CreateProductPayload, idempotencyKey: string) => {
    const { data } = await apiClient.post('/products/vendor', payload, {
      headers: { 'x-idempotency-key': idempotencyKey },
    });
    return data.data as Product;
  },
  getVendorProduct: async (id: string) => {
    const { data } = await apiClient.get(`/products/vendor/${id}`);
    return data.data as Product;
  },
  changeProductStatus: async (id: string, status: string, expectedVersion: number) => {
    const { data } = await apiClient.patch(`/products/vendor/${id}/status`, { status, expectedVersion });
    return data.data as Product;
  },
};

// ── Orders ────────────────────────────────────────────────────────────────────
export const orderService = {
  create: async (payload: CreateOrderPayload) => {
    const { data } = await apiClient.post('/orders', payload, {
      headers: { 'x-idempotency-key': payload.idempotencyKey },
    });
    return data as Order;
  },
  getById: async (id: string) => {
    const { data } = await apiClient.get(`/orders/${id}`);
    return data as Order;
  },
  getByCustomer: async (customerId: string, params?: { page?: number; limit?: number }) => {
    const { data } = await apiClient.get(`/orders/customer/${customerId}`, { params });
    return data as { data: Order[]; meta: unknown };
  },
  checkout: async (id: string) => {
    const { data } = await apiClient.post(`/orders/${id}/checkout`);
    return data;
  },
  cancel: async (id: string, reason: string) => {
    const { data } = await apiClient.post(`/orders/${id}/cancel`, { reason });
    return data;
  },
};

// ── Reviews ───────────────────────────────────────────────────────────────────
export const reviewService = {
  listByProduct: async (productId: string, params?: { page?: number; limit?: number; sort?: string }) => {
    const { data } = await apiClient.get(`/reviews/products/${productId}`, { params });
    return data as PaginatedResponse<Review>;
  },
  getRating: async (productId: string) => {
    const { data } = await apiClient.get(`/reviews/products/${productId}/rating`);
    return data.data as ProductRating;
  },
  create: async (productId: string, payload: { orderId: string; rating: number; title?: string; body?: string }) => {
    const { data } = await apiClient.post(`/reviews/products/${productId}`, payload);
    return data.data as Review;
  },
  vote: async (reviewId: string, helpful: boolean) => {
    const { data } = await apiClient.post(`/reviews/${reviewId}/vote`, { helpful });
    return data;
  },
  moderate: async (reviewId: string, status: 'PUBLISHED' | 'REJECTED') => {
    const { data } = await apiClient.patch(`/reviews/${reviewId}/moderate`, { status });
    return data;
  },
};

// ── Vendors ───────────────────────────────────────────────────────────────────
export const vendorService = {
  getMyProfile: async () => {
    const { data } = await apiClient.get('/vendors/me');
    return data.data as Vendor;
  },
  // Admin routes
  listVendors: async (params?: { page?: number; status?: string }) => {
    const { data } = await apiClient.get('/vendors/admin', { params });
    return data as { data: Vendor[]; meta: unknown };
  },
  getVendorById: async (vendorId: string) => {
    const { data } = await apiClient.get(`/vendors/admin/${vendorId}`);
    return data.data as Vendor;
  },
};

// ── Payouts ───────────────────────────────────────────────────────────────────
export const payoutService = {
  getWallet: async () => {
    const { data } = await apiClient.get('/payouts/wallet');
    return data.data as VendorWallet;
  },
  getLedger: async (params?: { page?: number; limit?: number; type?: string }) => {
    const { data } = await apiClient.get('/payouts/ledger', { params });
    return data as { data: LedgerEntry[]; meta: unknown };
  },
  requestPayout: async (payload: { amount: number; bankAccountId: string; ifscCode: string; accountNumber: string }) => {
    const { data } = await apiClient.post('/payouts', payload);
    return data.data as Payout;
  },
  listPayouts: async () => {
    const { data } = await apiClient.get('/payouts');
    return data as { data: Payout[] };
  },
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminService = {
  getDashboard: async () => {
    const { data } = await apiClient.get('/admin/dashboard');
    return data.data as AdminDashboard;
  },
  listVendors: async (params?: { page?: number; status?: string }) => {
    const { data } = await apiClient.get('/admin/vendors', { params });
    return data as { data: Vendor[] };
  },
  approveVendorKyc: async (vendorId: string, payload: { tier?: string }) => {
    const { data } = await apiClient.post(`/admin/vendors/${vendorId}/review/approve`, payload);
    return data;
  },
  rejectVendorKyc: async (vendorId: string, reason: string) => {
    const { data } = await apiClient.post(`/admin/vendors/${vendorId}/review/reject`, { reason });
    return data;
  },
  suspendVendor: async (vendorId: string, reason: string) => {
    const { data } = await apiClient.post(`/admin/vendors/${vendorId}/suspend`, { reason });
    return data;
  },
  getOrderOverrides: async () => {
    const { data } = await apiClient.get('/admin/orders/overrides');
    return data as { data: Order[] };
  },
  forceCancel: async (orderId: string, reason: string) => {
    const { data } = await apiClient.post(`/admin/orders/${orderId}/force-cancel`, { reason });
    return data;
  },
  forceRefund: async (orderId: string, reason: string) => {
    const { data } = await apiClient.post(`/admin/orders/${orderId}/force-refund`, { reason });
    return data;
  },
  getProduct: async (productId: string) => {
    const { data } = await apiClient.get(`/admin/products/${productId}`);
    return data.data as Product;
  },
  suspendProduct: async (productId: string, reason: string) => {
    const { data } = await apiClient.post(`/admin/products/${productId}/suspend`, { reason });
    return data;
  },
  listCases: async () => {
    const { data } = await apiClient.get('/admin/cases');
    return data as { data: ModerationCase[] };
  },
  getReports: async () => {
    const [vendors, products, orderOverrides] = await Promise.all([
      apiClient.get('/admin/reports/vendors'),
      apiClient.get('/admin/reports/products'),
      apiClient.get('/admin/reports/order-overrides').catch(() => ({ data: {} })),
    ]);
    return { vendors: vendors.data, products: products.data, orderOverrides: orderOverrides.data };
  },
};
