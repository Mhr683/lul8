export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'PRODUCT_MANAGER'
  | 'ORDER_MANAGER'
  | 'CUSTOMER';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string; // e.g., "Obsidian Black / Medium"
  size?: string;
  color?: string;
  material?: string;
  price: number;
  stock: number;
}

export interface ProductStudioShot {
  shotType: string;
  caption: string;
  lightingSetup: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  approved?: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  stock: number;
  reservedStock?: number;
  lowStockThreshold?: number;
  category: string;
  subcategory?: string;
  brand: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  featured?: boolean;
  bestSeller?: boolean;
  newArrival?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  primaryImage?: string;
  rating?: number;
  reviewCount?: number;
  weightKg?: number;
  dimensions?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  productCount?: number;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  variantLabel?: string;
  primaryImage?: string;
  category: string;
}

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PACKED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'RETURNED'
  | 'QUOTE_REQUESTED'
  | 'QUOTE_READY'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_REJECTED'
  | 'QUOTE_EXPIRED';

export type PaymentStatus =
  | 'PENDING'
  | 'PENDING_VERIFICATION'
  | 'PAID'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type PaymentMethod =
  | 'COD'
  | 'RAAST_IBAN'
  | 'BANK_TRANSFER'
  | 'NAYAPAY'
  | 'HBL_BANK'
  | 'BANK_ACCOUNT'
  | 'MANUAL'
  | 'MANUAL_QUOTE';

export type CustomsMode = 'NOT_APPLICABLE' | 'DAP' | 'DDP';

export interface ShippingCalculationSnapshot {
  destCountryIso: string;
  destZoneName: string;
  carrier: string;
  actualWeightKg: number;
  volumetricWeightKg: number;
  billableWeightKg: number;
  baseFee: number;
  additionalWeightFee: number;
  freeShippingApplied: boolean;
  finalShippingFee: number;
  currency: string;
  customsMode: CustomsMode;
  customsNotice: string;
  estimatedDelivery: string;
  requiresManualQuote: boolean;
  calculatedAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string | null;
  orderAccessToken?: string;
  items?: OrderItem[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  destCountryIso?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentSubMethod?: string;
  paymentReference?: string;
  paymentProofDetails?: string;
  paymentVerifiedBy?: string;
  paymentVerifiedAt?: string;
  paymentVerificationNote?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  shippingFee?: number;
  total: number;
  currency?: string;
  exchangeRateSnapshot?: number;
  couponCode?: string;
  shippingAddressSummary?: string;
  shippingCalculationSnapshot?: ShippingCalculationSnapshot;
  trackingNumber?: string;
  courierName?: string;
  quoteAmount?: number;
  quoteCourier?: string;
  quoteEstimatedDays?: string;
  quoteCustomsMode?: CustomsMode;
  quoteAdminNotes?: string;
  quoteExpiresAt?: string;
  district?: string;
  tehsil?: string;
  paymentReceiptEmailSent?: boolean;
  paymentReceiptEmailSentAt?: string;
  paymentReceiptEmailSubject?: string;
  paymentReceiptEmailRecipient?: string;
  paymentReceiptEmailHtml?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING' | 'BOGO';
  value: number;
  minCartAmount?: number;
  maxDiscount?: number;
  categoryFilter?: string;
  usageLimit?: number;
  usedCount?: number;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface Review {
  id: string;
  productId: string;
  productName?: string;
  userId: string;
  authorName: string;
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase?: boolean;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  helpfulCount?: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName?: string;
  action: string;
  resource: string;
  details?: string;
  createdAt: string;
}

export interface AITask {
  id: string;
  actorUid: string;
  name: string;
  toolName: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalItems: number;
  completedItems: number;
  failedItems?: number;
  summary?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StoreNotification {
  id: string;
  userId: string;
  type:
    | 'NEW_ORDER'
    | 'PAYMENT_RECEIVED'
    | 'LOW_STOCK'
    | 'PAYMENT_FAILURE'
    | 'NEW_REVIEW'
    | 'REFUND'
    | 'IMPORT_FAILED'
    | 'AI_TASK_COMPLETED'
    | 'AI_TASK_FAILED';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface ShippingZoneConfig {
  id: string;
  name: string;
  countries: string[];
  courier: string;
  baseFee: number;
  includedWeightKg: number;
  perAdditionalKgFee: number;
  volumetricDivisor: number;
  freeShippingThreshold?: number;
  estimatedDelivery: string;
  customsMode: CustomsMode;
  allowManualQuoteIfNoRate?: boolean;
}

export interface StoreSettings {
  id: string;
  storeName: string;
  contactEmail: string;
  // Central Merchant & Currency Config
  merchantCountry: string; // 'PK'
  currency: string; // Base currency: 'PKR'
  secondaryDisplayCurrency: string; // 'USD'
  usdToPkrRate: number; // Configurable store exchange rate (e.g. 278.5)
  isRateStatic: boolean;
  taxRate: number; // Domestic sales tax (%)
  // Domestic Pakistan Logistics
  domesticBaseFee: number; // PKR 250
  domesticIncludedWeightKg: number; // 1.0 kg
  domesticAdditionalPerKg: number; // PKR 120
  domesticFreeShippingThreshold: number; // PKR 10,000
  domesticVolumetricDivisor: number; // 5000
  domesticSupportedCouriers: string[]; // ['TCS', 'Leopards Courier', 'M&P Courier', 'Pakistan Post']
  // International Zones
  internationalZones: ShippingZoneConfig[];
  allowInternationalManualQuotes: boolean;
  // Payment Provider Configuration
  easypaisaEnabled?: boolean;
  easypaisaStoreId?: string;
  easypaisaHashKey?: string;
  easypaisaAccountNum?: string;
  easypaisaEnvironment?: 'sandbox' | 'production';
  jazzcashEnabled?: boolean;
  jazzcashMerchantId?: string;
  jazzcashPassword?: string;
  jazzcashIntegritySalt?: string;
  jazzcashEnvironment?: 'sandbox' | 'production';
  cardEnabled?: boolean;
  installmentsEnabled?: boolean;
  bankAccountEnabled?: boolean;
  sadapayEnabled?: boolean;
  codEnabled: boolean; // Pakistan only
  codMinOrder?: number;
  codMaxOrder?: number;
  nayapayEnabled: boolean;
  nayapayAccountTitle?: string;
  nayapayNumber?: string;
  nayapayInstructions?: string;
  raastEnabled: boolean;
  raastAccountTitle?: string;
  raastIban?: string;
  bankName?: string;
  bankTransferInstructions?: string;
  guestCheckoutEnabled?: boolean;
  googleMapsApiKey?: string;
  aiTone?: 'Professional' | 'Premium' | 'Friendly' | 'Minimal' | 'Luxury' | 'Persuasive';
  // 24/7 Client Helpline & Concierge Configuration
  helplinePhone?: string;
  helplineWhatsApp?: string;
  helplineWhatsAppFormatted?: string;
  helplineEmail?: string;
  helplineHours?: string;
  updatedAt?: string;
}

export interface CustomerHelplineMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedActions?: string[];
}

export interface CustomerInquiryTicket {
  id: string;
  ticketNumber: string;
  name: string;
  email: string;
  phone?: string;
  orderNumber?: string;
  category: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  channel: string;
  createdAt: string;
  aiAutoReply?: string;
  aiAutoRepliedAt?: string;
  aiAutoReplyStatus?: 'SENT' | 'PENDING' | 'DISABLED';
  merchantReply?: string;
  merchantRepliedAt?: string;
}

export interface AIMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolExecutions?: {
    name: string;
    args: Record<string, any>;
    status: 'EXECUTED' | 'PENDING_CONFIRMATION' | 'CANCELLED' | 'FAILED';
    resultSummary?: string;
  }[];
}
