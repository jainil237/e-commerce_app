export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: string;
  mrp: string;
  stock: number;
  sku: string;
  gstPercent: number;
  weight?: number;
  tags?: string[] | string;
  images: Array<{ url: string; altText?: string; sortOrder: number }>;
  category: { id: string; name: string; slug: string };
  isFeatured?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  gstPercent: number;
  product: {
    name: string;
    slug: string;
    images: Array<{ url: string }>;
    isReturnable?: boolean;
    isReplaceable?: boolean;
  };
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  razorpayPaymentId: string | null;
  razorpayOrderId?: string | null;
  subtotal: string;
  shippingCharge: string;
  discount: string;
  gstAmount: string;
  total: string;
  invoiceUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
  deliveredAt: string | null;
  items: OrderItem[];
  address: {
    label: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  };
  tracking?: {
    courier: string;
    trackingId: string;
    trackingUrl: string;
  };
  notes?: string | null;
  user?: User;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'CUSTOMER' | 'ADMIN';
  createdAt: string;
  updatedAt?: string;
  addresses?: Address[];
  orderCount?: number;
  totalSpent?: string;
  orders?: Order[];
  couponUsages?: CouponUsage[];
}

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export type ViewerContext = 'customer' | 'admin';
export interface Coupon {
  id: string
  code: string
  discountType: 'PERCENTAGE' | 'FLAT'
  discountValue: number
  minOrderValue?: number | null
  maxUsage?: number | null
  perUserLimit?: number | null
  usedCount: number
  validFrom?: string | null
  expiresAt?: string | null
  isActive: boolean
  couponUsages?: CouponUsage[]
}

export interface CouponUsage {
  id: string;
  couponId: string;
  userId: string;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
}
