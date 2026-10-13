import { PaymentMethod, PaymentStatus } from '../types/store';

// 1. Payment Provider Abstraction Layer
// Strictly supports Cash on Delivery and manual bank / NayaPay / Raast transfer with TID.
// All manual transfers remain PENDING_VERIFICATION until admin approval.
export interface PaymentRequest {
  orderNumber: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  customerEmail: string;
  maskedInstrumentSummary?: string;
  authCredentials?: {
    accountNumber?: string;
    pinOrPassword?: string;
    authType?: 'MPIN' | 'PASSWORD' | 'OTP' | '3DS';
    verified?: boolean;
    merchantCreditedAccount?: string;
  };
  directAutoDebit?: boolean;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  paymentStatus: PaymentStatus;
  providerMessage: string;
  isGatewayConfigured: boolean;
  merchantCreditedAccount?: string;
  debitedAt?: string;
}

export class PaymentGatewayService {
  static async processPayment(req: PaymentRequest): Promise<PaymentResult> {
    const txSuffix = Math.floor(10000000 + Math.random() * 90000000).toString();
    const debitedAt = new Date().toISOString();
    const tid = req.maskedInstrumentSummary?.trim() || `TID-${txSuffix}`;

    switch (req.method) {
      case 'COD':
        return {
          success: true,
          transactionId: `COD-PK-${txSuffix}`,
          paymentStatus: 'PENDING',
          isGatewayConfigured: true,
          providerMessage: `Cash on Delivery (COD) registered for ${req.amount.toLocaleString()} ${req.currency}. Cash collection scheduled with courier at delivery.`,
        };
      case 'NAYAPAY':
        return {
          success: true,
          transactionId: tid.startsWith('NAYA-') ? tid : `NAYA-${tid}`,
          paymentStatus: 'PENDING_VERIFICATION',
          isGatewayConfigured: true,
          debitedAt,
          providerMessage: `NayaPay manual transfer Transaction ID (${tid}) recorded. Order is PENDING admin verification.`,
        };
      case 'RAAST_IBAN':
      case 'BANK_TRANSFER':
      case 'HBL_BANK':
      case 'BANK_ACCOUNT':
        return {
          success: true,
          transactionId: tid.startsWith('RAAST-') || tid.startsWith('BNK-') ? tid : `BNK-${tid}`,
          paymentStatus: 'PENDING_VERIFICATION',
          isGatewayConfigured: true,
          debitedAt,
          providerMessage: `Bank Transfer / RAAST Transaction ID (${tid}) recorded. Order is PENDING admin verification.`,
        };
      case 'MANUAL_QUOTE':
        return {
          success: true,
          transactionId: `QUOTE-${txSuffix}`,
          paymentStatus: 'PENDING',
          isGatewayConfigured: false,
          providerMessage: `International Shipping & Customs Quote Request logged. Awaiting concierge logistics rate review.`,
        };
      case 'MANUAL':
      default:
        return {
          success: true,
          transactionId: tid,
          paymentStatus: 'PENDING_VERIFICATION',
          isGatewayConfigured: true,
          debitedAt,
          providerMessage: `Manual payment reference (${tid}) submitted. Order is PENDING admin verification.`,
        };
    }
  }
}

// 2. Shipping Rate & Carrier Abstraction Layer
export interface ShippingMethodOption {
  id: string;
  name: string;
  carrier: string;
  estimatedDays: string;
  baseFee: number;
}

export const SHIPPING_METHODS: ShippingMethodOption[] = [
  {
    id: 'ship-standard',
    name: 'Insured Armored Ground Courier',
    carrier: 'DHL Express',
    estimatedDays: '3–5 business days',
    baseFee: 25,
  },
  {
    id: 'ship-Priority',
    name: 'Priority Air Concierge',
    carrier: 'FedEx International Priority',
    estimatedDays: '1–2 business days',
    baseFee: 55,
  },
  {
    id: 'ship-pickup',
    name: 'Atelier Flagship Private Collection',
    carrier: 'In-Boutique Appointment',
    estimatedDays: 'Ready in 2 hours',
    baseFee: 0,
  },
];

export function calculateShippingFee(
  subtotal: number,
  freeThreshold: number,
  selectedMethodId: string,
  hasFreeShippingCoupon: boolean
): number {
  if (hasFreeShippingCoupon) return 0;
  const method = SHIPPING_METHODS.find((m) => m.id === selectedMethodId) || SHIPPING_METHODS[0];
  if (method.id === 'ship-pickup') return 0;
  if (method.id === 'ship-standard' && subtotal >= freeThreshold) return 0;
  return method.baseFee;
}

// 3. Transactional Email Service Abstraction Layer
export interface TransactionalEmailPayload {
  to: string;
  template:
    | 'ORDER_CONFIRMATION'
    | 'PAYMENT_RECEIVED'
    | 'SHIPPING_NOTIFICATION'
    | 'DELIVERY_NOTIFICATION'
    | 'REFUND_NOTICE'
    | 'PROMOTIONAL';
  subject: string;
  storeName?: string;
  orderNumber?: string;
  customerName?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  paymentReference?: string;
  summary: string;
  htmlBody?: string;
}

export class EmailNotificationService {
  static formatDispatchLog(payload: TransactionalEmailPayload): string {
    return `[Concierge Dispatch Log -> ${payload.to}] (${payload.template}): ${payload.subject} — ${payload.summary}`;
  }

  static generatePaymentReceivedSubject(orderNumber: string, storeName: string): string {
    return `Payment Recieved: Order #${orderNumber} | ${storeName}`;
  }
}

// 4. Configurable Multi-Currency & Pricing Mathematics
// Merchant base currency: PKR. Secondary display currency: USD.
export const DEFAULT_STATIC_USD_TO_PKR_RATE = 278.5;
export const USD_TO_PKR_RATE = DEFAULT_STATIC_USD_TO_PKR_RATE;

export interface MoneyValue {
  amount: number;
  currency: string;
}

export function formatMoney(val: MoneyValue): string {
  if (val.currency === 'PKR') {
    return `PKR ${Math.round(val.amount).toLocaleString('en-US')}`;
  }
  if (val.currency === 'USD') {
    return `$${val.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${val.currency} ${val.amount.toFixed(2)}`;
}

export function formatPKR(usdAmount: number, rate = DEFAULT_STATIC_USD_TO_PKR_RATE): string {
  const pkr = Math.round((Number(usdAmount) || 0) * rate);
  return `PKR ${pkr.toLocaleString('en-US')}`;
}

export function formatDualPrice(
  usdAmount: number,
  includeDecimals = false,
  rate = DEFAULT_STATIC_USD_TO_PKR_RATE
): string {
  const num = Number(usdAmount) || 0;
  const usdStr = includeDecimals
    ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const pkrStr = formatPKR(num, rate);
  return `${usdStr} (${pkrStr})`;
}

export function sanitizeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'item-slug'
  );
}

export function sanitizeSku(input: string): string {
  return (
    input
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .toUpperCase()
      .slice(0, 60) || `AA-${Date.now().toString().slice(-5)}`
  );
}

export function sanitizeDocId(input: string): string {
  return (
    input
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 120) || `doc-${Date.now()}`
  );
}
