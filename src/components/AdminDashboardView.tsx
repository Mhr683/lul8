import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Boxes,
  FileSpreadsheet,
  Terminal,
  Cpu,
  Tag,
  MessageSquare,
  Bell,
  ShieldAlert,
  Settings,
  ArrowLeft,
  Plus,
  Send,
  Upload,
  Download,
  Trash2,
  Edit3,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Camera,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Key,
  ShieldCheck,
  Save,
  CreditCard,
  ExternalLink,
  Globe,
  Inbox,
  Sparkles,
  Clock,
  User,
  Mail,
  Phone,
  Bot,
  CheckCircle2,
  MessageCircle,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import {
  Product,
  Order,
  OrderStatus,
  AIMessageRecord,
  ProductStudioShot,
  CustomerInquiryTicket,
} from '../types/store';
import { SAMPLE_CSV_TEMPLATE, IMG_HANDBAG } from '../data/seedData';
import { formatDualPrice, formatPKR, USD_TO_PKR_RATE, EmailNotificationService, sanitizeDocId, sanitizeSku, sanitizeSlug } from '../services/abstractions';
import { canExecuteAITool } from '../ai/permissions';
import {
  validateCsvFileUpload,
  validateProductPayload,
  validateCouponPayload,
  parseCsvLineRFC4180,
  parseCsvRFC4180,
  detectCsvDelimiter,
  parseNumericPrice,
  parseNumericStock,
  detectPriceCurrency,
  validateAIToolArgs,
} from '../validation/validators';

type AdminTab =
  | 'DASHBOARD'
  | 'PRODUCTS'
  | 'INVENTORY'
  | 'CSV_WORKFLOW'
  | 'ORDERS'
  | 'COUPONS'
  | 'REVIEWS'
  | 'AI_COMMAND_CENTER'
  | 'AI_TASKS'
  | 'AUDIT_LOGS'
  | 'NOTIFICATIONS'
  | 'SETTINGS';

interface PendingConfirmation {
  id: string;
  description: string;
  toolName: string;
  args: Record<string, any>;
  onConfirm: () => Promise<string>;
}

export interface ParsedCsvRow {
  rowNumber: number;
  sku: string;
  name: string;
  price: number;
  originalCsvPrice?: number;
  csvCurrency?: 'PKR' | 'USD' | 'DIRECT';
  stock: number;
  category: string;
  brand: string;
  shortDescription: string;
  seoTitle?: string;
  seoDescription?: string;
  compareAtPrice?: number;
  costPrice?: number;
  primaryImage?: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
}

const DEMO_AI_COMMANDS = [
  'Create a new luxury black leather handbag product. Price $1290. Generate the complete listing and SEO content.',
  'Find products with stock below 5.',
  'Increase the price of all products in the Leather Goods category by 10%.',
  'Find products without SEO descriptions and generate SEO metadata for them.',
  'Create a 20% discount coupon SUMMER20 for orders above $250.',
  'Show orders that have not shipped.',
  'Rewrite all descriptions in the Fragrance category in a Luxury tone.',
  'Analyze today’s store sales and best-selling categories.',
];

export const AdminDashboardView: React.FC<{
  onReturnToStore: () => void;
  initialTab?: AdminTab;
  autoOpenNewProduct?: boolean;
}> = ({
  onReturnToStore,
  initialTab = 'PRODUCTS',
  autoOpenNewProduct = false,
}) => {
  const {
    products,
    categories,
    orders,
    coupons,
    reviews,
    auditLogs,
    aiTasks,
    notifications,
    settings,
    firebaseUser,
    userProfile,
    isAdmin,
    signInWithGoogle,
    saveProduct,
    importProductsBatch,
    removeProduct,
    saveCategory,
    adjustInventory,
    updateOrderState,
    verifyManualPayment,
    updateShippingQuote,
    saveCoupon,
    deleteCouponById,
    moderateReview,
    updateStoreSettings,
    recordAuditLog,
    createOrUpdateAITask,
    markNotificationRead,
    seedInitialDatabaseIfEmpty,
    selectedAdminProduct,
    setSelectedAdminProduct,
    selectedAdminOrder,
    setSelectedAdminOrder,
    cancelAITask,
    showToast,
  } = useStore();

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab || 'PRODUCTS');
  const [dateFilter, setDateFilter] = useState<'TODAY' | '7D' | '30D' | 'ALL'>('30D');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (autoOpenNewProduct) {
      setActiveTab('PRODUCTS');
      setEditingProduct({
        name: '',
        sku: `AA-NEW-${Math.floor(100 + Math.random() * 899)}`,
        price: 950,
        stock: 15,
        category: categories[0]?.name || 'Leather Goods',
        brand: settings.storeName || 'Atelier Aurelia',
        status: 'ACTIVE',
        shortDescription: '',
        description: '',
      });
    }
  }, [autoOpenNewProduct, categories, settings.storeName]);

  // Floating AI Copilot Drawer Toggle (available on non-AI tabs)
  const [copilotDrawerOpen, setCopilotDrawerOpen] = useState(false);

  // Settings visibility toggles for merchant secrets
  const [showJazzPassword, setShowJazzPassword] = useState(false);
  const [showJazzSalt, setShowJazzSalt] = useState(false);
  const [showEasypaisaHash, setShowEasypaisaHash] = useState(false);
  const [showGoogleMapsKey, setShowGoogleMapsKey] = useState(false);

  // AI Conversation State
  const [aiMessages, setAiMessages] = useState<AIMessageRecord[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Welcome to the Atelier Aurelia AI Executive Command Center. Tell me what operation to perform in natural language—such as creating products, adjusting category pricing, generating missing SEO metadata, importing CSV catalogs, creating coupons, or auditing unshipped orders—and I will execute it directly against your store database.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);

  // Product Editor & AI Studio Image Generator State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [studioShots, setStudioShots] = useState<ProductStudioShot[]>([]);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [generatingShots, setGeneratingShots] = useState(false);

  // CSV Import State
  const [csvRawText, setCsvRawText] = useState(SAMPLE_CSV_TEMPLATE);
  const [selectedDelimiter, setSelectedDelimiter] = useState<string>('auto');
  const [csvCurrency, setCsvCurrency] = useState<'PKR' | 'USD' | 'DIRECT'>('PKR');
  const [csvUploadedFileName, setCsvUploadedFileName] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvParsing, setCsvParsing] = useState(false);
  const [csvPreviewPage, setCsvPreviewPage] = useState(1);
  const [parsedCsvRows, setParsedCsvRows] = useState<ParsedCsvRow[]>([]);
  const [csvImportSummary, setCsvImportSummary] = useState<{
    imported: number;
    updated: number;
    failed: number;
  } | null>(null);
  const [csvEnriching, setCsvEnriching] = useState(false);

  // Coupon Form State
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'>('PERCENTAGE');
  const [newCouponValue, setNewCouponValue] = useState(20);
  const [newCouponMinAmount, setNewCouponMinAmount] = useState(200);

  // International Freight Quoting & Transactional Receipt Modal State
  const [quotingOrder, setQuotingOrder] = useState<Order | null>(null);
  const [viewingReceiptOrder, setViewingReceiptOrder] = useState<Order | null>(null);
  const [quoteFreightAmount, setQuoteFreightAmount] = useState<number>(8500);
  const [quoteCourierChoice, setQuoteCourierChoice] = useState<string>('DHL Express International');
  const [quoteDeliveryTime, setQuoteDeliveryTime] = useState<string>('4–6 business days');
  const [quoteCustomsRule, setQuoteCustomsRule] = useState<'DAP' | 'DDP'>('DAP');
  const [quoteSpecialInstructions, setQuoteSpecialInstructions] = useState<string>('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'ALL' | 'PENDING_VERIFICATION' | 'PAID' | 'COD'>('ALL');

  // Unified Communications Inbox & Customer Inquiries State
  const [inboxTickets, setInboxTickets] = useState<CustomerInquiryTicket[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxTab, setInboxTab] = useState<'MESSAGES' | 'ALERTS'>('MESSAGES');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [activeReplyTicketId, setActiveReplyTicketId] = useState<string | null>(null);
  const [merchantReplyText, setMerchantReplyText] = useState('');
  const [isSendingMerchantReply, setIsSendingMerchantReply] = useState(false);
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [simForm, setSimForm] = useState({
    name: 'Mohsin Ali',
    email: 'mohsin.ali@example.pk',
    phone: '+92 300 9876543',
    orderNumber: 'AA-ORD-9021',
    category: 'ORDER_TRACKING',
    subject: 'Order delivery status & Cash on Delivery inquiry',
    message: 'Assalam o Alaikum, mera order AA-ORD-9021 kab tak deliver hoga? Kya delivery rider ko cash de saktay hain?',
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedResult, setSimulatedResult] = useState<any | null>(null);

  const fetchInboxTickets = async () => {
    setInboxLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/helpline/tickets', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.tickets)) {
        setInboxTickets(data.tickets);
      }
    } catch (err) {
      console.warn('Failed to fetch inbox tickets:', err);
    } finally {
      setInboxLoading(false);
    }
  };

  useEffect(() => {
    fetchInboxTickets();
    const interval = setInterval(fetchInboxTickets, 12000);
    return () => clearInterval(interval);
  }, []);

  const handleSimulateIncomingMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simForm.name.trim() || !simForm.email.trim() || !simForm.message.trim()) {
      showToast?.('Please fill name, email, and inquiry message.');
      return;
    }
    setIsSimulating(true);
    setSimulatedResult(null);
    try {
      const res = await fetch('/api/helpline/contact-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...simForm,
          channel: 'LIVE_CUSTOMER_TEST',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSimulatedResult(data);
        showToast?.(`AI Auto-Reply generated for Ticket #${data.ticketNumber}!`);
        await fetchInboxTickets();
      } else {
        showToast?.(data.error || 'Failed to submit test message');
      }
    } catch {
      showToast?.('Network error submitting test message');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSendMerchantReply = async (ticketId: string) => {
    if (!merchantReplyText.trim()) return;
    setIsSendingMerchantReply(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/helpline/tickets/${ticketId}/merchant-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          merchantReply: merchantReplyText.trim(),
          status: 'RESOLVED',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('Merchant reply dispatched & ticket marked resolved.');
        setMerchantReplyText('');
        setActiveReplyTicketId(null);
        await fetchInboxTickets();
      }
    } catch {
      showToast?.('Failed to send merchant reply');
    } finally {
      setIsSendingMerchantReply(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, newStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') => {
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(`/api/helpline/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`Ticket status updated to ${newStatus}`);
        await fetchInboxTickets();
      }
    } catch {
      showToast?.('Failed to update ticket status');
    }
  };

  const unreadTicketsCount = useMemo(
    () => inboxTickets.filter((t) => t.status === 'OPEN').length,
    [inboxTickets]
  );
  const unreadAlertsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const pendingVerificationOrders = useMemo(
    () => orders.filter((o) => o.paymentStatus === 'PENDING_VERIFICATION'),
    [orders]
  );

  // Analytics Calculations (Grounded in actual state)
  const totalRevenue = useMemo(
    () =>
      orders
        .filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED')
        .reduce((sum, o) => sum + o.total, 0),
    [orders]
  );

  const avgOrderValue = useMemo(
    () => (orders.length > 0 ? totalRevenue / orders.length : 0),
    [orders, totalRevenue]
  );

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.stock <= (p.lowStockThreshold || 5)),
    [products]
  );

  const missingSeoProducts = useMemo(
    () => products.filter((p) => !p.seoDescription || p.seoDescription.trim() === ''),
    [products]
  );

  const unshippedOrders = useMemo(
    () => orders.filter((o) => ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'].includes(o.status)),
    [orders]
  );

  const displayedOrders = useMemo(() => {
    if (orderPaymentFilter === 'PENDING_VERIFICATION') {
      return orders.filter((o) => o.paymentStatus === 'PENDING_VERIFICATION');
    }
    if (orderPaymentFilter === 'PAID') {
      return orders.filter((o) => o.paymentStatus === 'PAID');
    }
    if (orderPaymentFilter === 'COD') {
      return orders.filter((o) => o.paymentMethod === 'COD');
    }
    return orders;
  }, [orders, orderPaymentFilter]);

  const categoryRevenueBreakdown = useMemo(() => {
    const map: Record<string, { count: number; stockValue: number }> = {};
    for (const p of products) {
      if (!map[p.category]) map[p.category] = { count: 0, stockValue: 0 };
      map[p.category].count += 1;
      map[p.category].stockValue += p.price * p.stock;
    }
    return Object.entries(map).map(([name, stats]) => ({ name, ...stats }));
  }, [products]);

  // Execute a single AI Tool Call against actual StoreContext mutators with RBAC Permission & Runtime Validation Checks
  const executeSingleToolCall = async (
    name: string,
    args: Record<string, any>
  ): Promise<{ status: 'EXECUTED' | 'PENDING_CONFIRMATION'; summary: string }> => {
    const permCheck = canExecuteAITool(userProfile?.role, name);
    if (!permCheck.allowed) {
      await recordAuditLog('AI_PERMISSION_DENIED', name, permCheck.reason || 'Permission denied');
      return {
        status: 'EXECUTED',
        summary: `Blocked: ${permCheck.reason}`,
      };
    }

    const argValidation = validateAIToolArgs(name, args);
    if (!argValidation.valid) {
      return {
        status: 'EXECUTED',
        summary: `Validation Error in ${name}(): ${argValidation.errors.join(' ')}`,
      };
    }

    switch (name) {
      case 'createProduct': {
        const created = await saveProduct(
          {
            name: args.name || 'New Atelier Piece',
            sku: args.sku,
            price: Number(args.price || 450),
            compareAtPrice: args.compareAtPrice ? Number(args.compareAtPrice) : undefined,
            costPrice: args.costPrice ? Number(args.costPrice) : undefined,
            stock: Number(args.stock ?? 15),
            category: args.category || 'Leather Goods',
            brand: args.brand || 'Atelier Aurelia',
            shortDescription: args.shortDescription,
            description: args.description,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            seoKeywords: args.seoKeywords,
            featured: Boolean(args.featured ?? true),
          },
          'AI_TOOL:createProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Created product "${created.name}" (SKU: ${created.sku}, Price: ${formatDualPrice(created.price)}, Stock: ${created.stock}).`,
        };
      }

      case 'updateProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;

        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `No matching product found for "${args.productIdOrName}".`,
          };
        }

        const updated = await saveProduct(
          {
            ...target,
            ...(args.price !== undefined ? { price: Number(args.price) } : {}),
            ...(args.stock !== undefined ? { stock: Number(args.stock) } : {}),
            ...(args.description ? { description: String(args.description) } : {}),
            ...(args.shortDescription ? { shortDescription: String(args.shortDescription) } : {}),
            ...(args.seoTitle ? { seoTitle: String(args.seoTitle) } : {}),
            ...(args.seoDescription ? { seoDescription: String(args.seoDescription) } : {}),
            ...(args.status ? { status: args.status } : {}),
          },
          'AI_TOOL:updateProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Updated "${updated.name}" (${updated.sku}) — Price: ${formatDualPrice(updated.price)}, Stock: ${updated.stock}.`,
        };
      }

      case 'duplicateProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;

        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Product "${args.productIdOrName}" not found for duplication.`,
          };
        }

        const cloned = await saveProduct(
          {
            ...target,
            id: undefined,
            sku: args.newSku || `${target.sku}-COPY`,
            name: `${target.name} (Edition Copy)`,
          },
          'AI_TOOL:duplicateProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Duplicated "${target.name}" as "${cloned.name}" (SKU: ${cloned.sku}).`,
        };
      }

      case 'searchProducts': {
        const q = String(args.query || '').toLowerCase();
        const maxStock = args.maxStock !== undefined ? Number(args.maxStock) : undefined;
        const found = products.filter((p) => {
          const matchesText =
            !q ||
            q === 'all' ||
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q);
          const matchesStock = maxStock === undefined || p.stock <= maxStock;
          return matchesText && matchesStock;
        });
        return {
          status: 'EXECUTED',
          summary: `Found ${found.length} matching product(s): ${
            found
              .slice(0, 6)
              .map((p) => `${p.name} [${p.sku}] (${formatDualPrice(p.price)}, ${p.stock} in stock)`)
              .join('; ') || 'None'
          }.`,
        };
      }

      case 'createCategory': {
        const createdCat = await saveCategory({
          name: String(args.name || 'New Collection'),
          description: args.description,
          seoTitle: args.seoTitle,
          seoDescription: args.seoDescription,
        });
        return {
          status: 'EXECUTED',
          summary: `Created category "${createdCat.name}" (slug: /${createdCat.slug}).`,
        };
      }

      case 'bulkUpdateCategoryPrices': {
        const cat = String(args.category || 'ALL');
        const hasAmt = args.amountChange !== undefined && args.amountChange !== null && !isNaN(Number(args.amountChange));
        const rawAmt = hasAmt ? Number(args.amountChange) : null;
        const pct = args.percentageChange !== undefined && args.percentageChange !== null && !isNaN(Number(args.percentageChange)) ? Number(args.percentageChange) : null;
        const rawCurrency = String(args.currency || 'USD').toUpperCase().trim();
        const isPkr = rawCurrency === 'PKR' || rawCurrency === 'RS' || rawCurrency === 'RUPEES';

        // When PKR is specified, convert to base USD using USD_TO_PKR_RATE (278.5)
        const amtInUsd = rawAmt !== null
          ? (isPkr ? rawAmt / USD_TO_PKR_RATE : rawAmt)
          : null;

        const matching = products.filter(
          (p) => cat.toUpperCase() === 'ALL' || p.category.toLowerCase().includes(cat.toLowerCase())
        );

        let changeDesc = '';
        if (rawAmt !== null) {
          if (isPkr) {
            changeDesc = `${rawAmt >= 0 ? `+PKR ${rawAmt.toLocaleString()}` : `-PKR ${Math.abs(rawAmt).toLocaleString()}`} (≈ ${amtInUsd! >= 0 ? `+$${amtInUsd!.toFixed(2)}` : `-$${Math.abs(amtInUsd!).toFixed(2)}`} USD)`;
          } else {
            const approxPkr = Math.round(Math.abs(rawAmt) * USD_TO_PKR_RATE);
            changeDesc = `${rawAmt >= 0 ? `+$${rawAmt}` : `-$${Math.abs(rawAmt)}`} USD (≈ ${rawAmt >= 0 ? `+PKR ${approxPkr.toLocaleString()}` : `-PKR ${approxPkr.toLocaleString()}`})`;
          }
        } else {
          changeDesc = `${(pct ?? 0) >= 0 ? `+${pct ?? 0}%` : `${pct}%`}`;
        }

        const confirmId = `conf-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Adjust prices by ${changeDesc} across ${matching.length} products in "${cat}". Do you want me to continue?`,
            toolName: 'bulkUpdateCategoryPrices',
            args,
            onConfirm: async () => {
              const taskId = `task-bulk-price-${Date.now()}`;
              await createOrUpdateAITask({
                id: taskId,
                name: `Bulk Price Update (${changeDesc} on ${cat})`,
                toolName: 'bulkUpdateCategoryPrices',
                status: 'RUNNING',
                totalItems: matching.length,
                completedItems: 0,
              });
              let count = 0;
              for (const prod of matching) {
                let nextPrice: number;
                if (amtInUsd !== null) {
                  nextPrice = Math.max(1, Math.round((prod.price + amtInUsd) * 100) / 100);
                } else {
                  nextPrice = Math.max(1, Math.round(prod.price * (1 + (pct ?? 0) / 100)));
                }
                await saveProduct(
                  { ...prod, price: nextPrice },
                  `AI_BULK_PRICE_CHANGE (${changeDesc})`
                );
                count++;
              }
              await createOrUpdateAITask({
                id: taskId,
                name: `Bulk Price Update (${changeDesc} on ${cat})`,
                toolName: 'bulkUpdateCategoryPrices',
                status: 'COMPLETED',
                totalItems: matching.length,
                completedItems: count,
                summary: `Updated prices for ${count} products in ${cat} by ${changeDesc}.`,
              });
              return `Confirmed & updated prices for ${count} products in ${cat} by ${changeDesc}.`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Queued confirmation to change prices by ${changeDesc} for ${matching.length} products in ${cat}.`,
        };
      }

      case 'deleteProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target = products.find(
          (p) =>
            p.id.toLowerCase() === queryStr ||
            p.sku.toLowerCase() === queryStr ||
            p.name.toLowerCase().includes(queryStr)
        );
        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Could not locate product "${args.productIdOrName}" for deletion.`,
          };
        }
        const confirmId = `conf-del-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Permanently delete product "${target.name}" (${target.sku})? This action cannot be undone.`,
            toolName: 'deleteProduct',
            args,
            onConfirm: async () => {
              await removeProduct(target.id);
              return `Permanently deleted "${target.name}" (${target.sku}).`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Awaiting confirmation to permanently delete "${target.name}".`,
        };
      }

      case 'bulkDeleteProducts': {
        const scope = String(args.scope || 'ALL').trim().toUpperCase();
        let targets = products;
        if (scope !== 'ALL') {
          targets = products.filter(
            (p) =>
              p.category.toUpperCase() === scope ||
              p.status.toUpperCase() === scope ||
              p.brand.toUpperCase() === scope
          );
        }
        if (targets.length === 0) {
          return {
            status: 'EXECUTED',
            summary: `No products found matching scope "${args.scope}".`,
          };
        }
        const confirmId = `conf-bulk-del-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Permanently delete all ${targets.length} product(s) in "${scope === 'ALL' ? 'Entire Store Catalog' : args.scope}"? This action cannot be undone.`,
            toolName: 'bulkDeleteProducts',
            args,
            onConfirm: async () => {
              for (const p of targets) {
                await removeProduct(p.id);
              }
              return `Permanently deleted all ${targets.length} product(s) from "${scope === 'ALL' ? 'Entire Store Catalog' : args.scope}".`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Awaiting administrator confirmation to delete ${targets.length} product(s).`,
        };
      }

      case 'updateInventory': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;
        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Product "${args.productIdOrName}" not found.`,
          };
        }
        const nextStock = Math.max(0, Math.round(Number(args.newStock || 0)));
        const delta = Math.abs(nextStock - target.stock);
        if (delta >= 50 || (target.stock > 0 && nextStock === 0)) {
          const confirmId = `conf-inv-${Date.now()}`;
          setPendingConfirmations((prev) => [
            ...prev,
            {
              id: confirmId,
              description: `Large inventory change on "${target.name}" (${target.sku}): ${target.stock} → ${nextStock} units. Confirm execution?`,
              toolName: 'updateInventory',
              args,
              onConfirm: async () => {
                await adjustInventory(target.id, nextStock, 'Confirmed AI Inventory Change');
                return `Confirmed & updated stock for "${target.name}" (${target.sku}) to ${nextStock} units.`;
              },
            },
          ]);
          return {
            status: 'PENDING_CONFIRMATION',
            summary: `Confirmation required for large stock change on "${target.name}" (${target.stock} → ${nextStock} units).`,
          };
        }

        await adjustInventory(target.id, nextStock, 'AI Assistant Command');
        return {
          status: 'EXECUTED',
          summary: `Updated stock for "${target.name}" (${target.sku}) to ${nextStock} units.`,
        };
      }

      case 'getLowStockProducts': {
        const threshold = Number(args.threshold ?? 5);
        const low = products.filter((p) => p.stock <= threshold);
        return {
          status: 'EXECUTED',
          summary: `Products with stock <= ${threshold} (${low.length}): ${
            low.map((p) => `${p.name} [${p.sku}: ${p.stock} units]`).join(', ') || 'None'
          }.`,
        };
      }

      case 'generateMissingSEO': {
        const targets = products.filter(
          (p) => !p.seoDescription || p.seoDescription.trim() === ''
        );
        const listToProcess = targets.length > 0 ? targets : products.slice(0, 3);
        const taskId = `task-seo-${Date.now()}`;
        await createOrUpdateAITask({
          id: taskId,
          name: `Bulk SEO Generation (${listToProcess.length} products)`,
          toolName: 'generateMissingSEO',
          status: 'RUNNING',
          totalItems: listToProcess.length,
          completedItems: 0,
        });

        let done = 0;
        for (const p of listToProcess) {
          await saveProduct(
            {
              ...p,
              seoTitle: `${p.name} — Handcrafted ${p.category} | ${settings.storeName}`,
              seoDescription: `Acquire the ${p.name} by ${p.brand}. ${
                p.shortDescription || 'Crafted from noble materials with insured global courier delivery.'
              }`,
              seoKeywords: `${p.name.toLowerCase()}, ${p.category.toLowerCase()}, ${p.brand.toLowerCase()}, bespoke luxury`,
            },
            'AI_TOOL:generateMissingSEO'
          );
          done++;
        }

        await createOrUpdateAITask({
          id: taskId,
          name: `Bulk SEO Generation (${listToProcess.length} products)`,
          toolName: 'generateMissingSEO',
          status: 'COMPLETED',
          totalItems: listToProcess.length,
          completedItems: done,
          summary: `Generated SEO titles, meta descriptions, and keywords for ${done} products.`,
        });

        return {
          status: 'EXECUTED',
          summary: `Generated and saved SEO metadata for ${done} products (${listToProcess
            .map((p) => p.sku)
            .join(', ')}).`,
        };
      }

      case 'rewriteCategoryDescriptions': {
        const targetKey = String(args.categoryOrProduct || '').toLowerCase();
        const tone = String(args.tone || 'Luxury');
        const matches = products.filter(
          (p) =>
            p.category.toLowerCase().includes(targetKey) ||
            p.name.toLowerCase().includes(targetKey)
        );
        const list = matches.length > 0 ? matches : selectedAdminProduct ? [selectedAdminProduct] : [];
        let updatedCount = 0;
        for (const p of list) {
          await saveProduct(
            {
              ...p,
              description: `[${tone} Edition] Meticulously realized by ${p.brand} artisans, the ${p.name} exemplifies enduring architectural proportion and tactile permanence. ${p.shortDescription || ''}`,
            },
            `AI_TOOL:rewriteDescriptions(${tone})`
          );
          updatedCount++;
        }
        return {
          status: 'EXECUTED',
          summary: `Rewrote ${updatedCount} product description(s) in "${tone}" tone.`,
        };
      }

      case 'generateProductImages': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) ||
          selectedAdminProduct ||
          products[0];

        if (target) {
          await handleGenerateStudioShots(target.name, target.category);
          return {
            status: 'EXECUTED',
            summary: `Generated 5 studio photography variations (White Background, Studio Shot, Lifestyle, Macro, Editorial) for "${target.name}".`,
          };
        }
        return {
          status: 'EXECUTED',
          summary: 'Generated studio photography variations.',
        };
      }

      case 'createCoupon': {
        const saved = await saveCoupon({
          code: String(args.code || 'ATELIER20'),
          type: (args.type as any) || 'PERCENTAGE',
          value: Number(args.value || 20),
          minCartAmount: Number(args.minCartAmount || 100),
          categoryFilter: args.categoryFilter,
          usageLimit: Number(args.usageLimit || 100),
        });
        return {
          status: 'EXECUTED',
          summary: `Created active promotional coupon "${saved.code}" (${saved.type}: ${saved.value}).`,
        };
      }

      case 'deleteCoupon': {
        const codeStr = String(args.code || '').toUpperCase();
        const targetCoupon = coupons.find((c) => c.code.toUpperCase() === codeStr);
        if (!targetCoupon) {
          return {
            status: 'EXECUTED',
            summary: `Coupon "${codeStr}" not found.`,
          };
        }
        await deleteCouponById(targetCoupon.id);
        return {
          status: 'EXECUTED',
          summary: `Deleted coupon "${targetCoupon.code}".`,
        };
      }

      case 'searchOrders': {
        const q = String(args.statusOrQuery || 'UNSHIPPED').toUpperCase();
        const matched =
          q === 'UNSHIPPED'
            ? unshippedOrders
            : orders.filter(
                (o) =>
                  o.status.toUpperCase().includes(q) ||
                  o.customerName.toUpperCase().includes(q) ||
                  o.orderNumber.toUpperCase().includes(q)
              );
        return {
          status: 'EXECUTED',
          summary: `Found ${matched.length} matching order(s): ${
            matched
              .map((o) => `${o.orderNumber} (${o.customerName}, ${formatDualPrice(o.total)}, ${o.status})`)
              .join('; ') || 'None'
          }.`,
        };
      }

      case 'cancelOrder':
      case 'refundOrder':
      case 'updateOrderStatus': {
        const targetId = String(args.orderNumberOrId || '');
        const nextStatus: OrderStatus =
          name === 'cancelOrder'
            ? 'CANCELLED'
            : name === 'refundOrder'
            ? 'REFUNDED'
            : (String(args.status || 'SHIPPED') as OrderStatus);

        const targetOrder =
          orders.find(
            (o) =>
              o.orderNumber.toLowerCase() === targetId.toLowerCase() ||
              o.id.toLowerCase() === targetId.toLowerCase()
          ) || selectedAdminOrder;

        if (!targetOrder) {
          return {
            status: 'EXECUTED',
            summary: `Order "${targetId}" was not found in active records.`,
          };
        }

        if (nextStatus === 'REFUNDED' || nextStatus === 'CANCELLED') {
          const confirmId = `conf-ord-${Date.now()}`;
          setPendingConfirmations((prev) => [
            ...prev,
            {
              id: confirmId,
              description: `${
                nextStatus === 'REFUNDED' ? 'Record Refund for' : 'Cancel'
              } Order ${targetOrder.orderNumber} (${formatDualPrice(targetOrder.total)} for ${
                targetOrder.customerName
              })? Inventory will be restored automatically.`,
              toolName: name,
              args,
              onConfirm: async () => {
                await updateOrderState(targetOrder.id, nextStatus, args.trackingNumber);
                return `Order ${targetOrder.orderNumber} marked as ${nextStatus} and stock restored.`;
              },
            },
          ]);
          return {
            status: 'PENDING_CONFIRMATION',
            summary: `Confirmation required to mark Order ${targetOrder.orderNumber} as ${nextStatus}.`,
          };
        }

        await updateOrderState(targetOrder.id, nextStatus, args.trackingNumber);
        return {
          status: 'EXECUTED',
          summary: `Order ${targetOrder.orderNumber} updated to ${nextStatus}.`,
        };
      }

      case 'searchCustomers': {
        const q = String(args.query || 'ALL').toLowerCase();
        const customerMap = new Map<string, { name: string; email: string; orders: number; spend: number }>();
        for (const o of orders) {
          const prev = customerMap.get(o.customerEmail) || {
            name: o.customerName,
            email: o.customerEmail,
            orders: 0,
            spend: 0,
          };
          prev.orders += 1;
          prev.spend += o.total;
          customerMap.set(o.customerEmail, prev);
        }
        const list = Array.from(customerMap.values()).filter(
          (c) => q === 'all' || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        );
        return {
          status: 'EXECUTED',
          summary: `Customer Directory (${list.length}): ${
            list
              .map((c) => `${c.name} <${c.email}> — ${c.orders} order(s), Total: ${formatDualPrice(c.spend)}`)
              .join('; ') || 'No matching customers'
          }.`,
        };
      }

      case 'sendCustomerEmail': {
        const dispatchSummary = EmailNotificationService.formatDispatchLog({
          to: String(args.toEmail || 'client@atelieraurelia.com'),
          subject: String(args.subject || 'Atelier Aurelia Concierge Update'),
          template: 'PROMOTIONAL',
          summary: String(args.message || ''),
        });
        await recordAuditLog('AI_EMAIL_DISPATCHED', String(args.toEmail), dispatchSummary);
        return {
          status: 'EXECUTED',
          summary: `Logged concierge dispatch to ${args.toEmail} ("${args.subject}").`,
        };
      }

      case 'importCSV': {
        const rawContent = (args.csvText || args.rawCsv || args.csvPayload || csvRawText);
        if (args.csvText || args.rawCsv) {
          setCsvRawText(rawContent);
        }
        const rows = handleParseCsv(rawContent, args.delimiter, args.currency);
        let workingRows = rows;
        if (args.enrichMissingWithAI && workingRows.length > 0) {
          workingRows = await handleAIEnrichCsv(workingRows);
        }
        const result = await handleCommitCsvImport(workingRows);
        setActiveTab('CSV_WORKFLOW');
        return {
          status: 'EXECUTED',
          summary: `Executed CSV Import: ${result.imported} created, ${result.updated} updated, ${result.failed} failed.`,
        };
      }

      case 'exportCSV': {
        if (String(args.resourceType || 'PRODUCTS').toUpperCase() === 'ORDERS') {
          handleExportOrdersCsv();
          return {
            status: 'EXECUTED',
            summary: `Exported ${orders.length} orders to CSV download.`,
          };
        }
        handleExportProductsCsv();
        return {
          status: 'EXECUTED',
          summary: `Exported ${products.length} products to CSV download.`,
        };
      }

      case 'analyzeStoreMetrics':
      default: {
        const lowList = lowStockProducts.map((p) => `${p.name} (${p.stock} left)`).join(', ');
        const unshippedList = unshippedOrders
          .map((o) => `${o.orderNumber} (${formatDualPrice(o.total)})`)
          .join(', ');
        return {
          status: 'EXECUTED',
          summary: `Live Audit — Revenue: ${formatDualPrice(totalRevenue)} across ${
            orders.length
          } orders | Low Stock (${lowStockProducts.length}): ${
            lowList || 'None'
          } | Unshipped Orders (${unshippedOrders.length}): ${unshippedList || 'None'}.`,
        };
      }
    }
  };

  // Send Natural Language Instruction to Server-Side Gemini Operator
  const handleSendAICommand = async (customPrompt?: string) => {
    const promptToSend = (customPrompt ?? aiInput).trim();
    if (!promptToSend || aiBusy) return;

    const userMsg: AIMessageRecord = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: promptToSend,
      timestamp: new Date().toISOString(),
    };
    setAiMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setAiInput('');
    setAiBusy(true);

    try {
      const storeSnapshot = {
        storeName: settings.storeName,
        currency: settings.currency,
        actorUid: firebaseUser?.uid || 'local-admin',
        actorName: userProfile?.name || firebaseUser?.email || 'Executive Admin',
        userRole: userProfile?.role || 'SUPER_ADMIN',
        currentTab: activeTab,
        currentFilter: productSearch || dateFilter,
        stagedCsvRowCount: parsedCsvRows.length,
        productCount: products.length,
        lowStockProducts: lowStockProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          stock: p.stock,
          price: p.price,
        })),
        missingSeoProducts: missingSeoProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
        })),
        orderCount: orders.length,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        unshippedOrders: unshippedOrders.map((o) => ({
          orderNumber: o.orderNumber,
          customer: o.customerName,
          total: o.total,
          status: o.status,
        })),
        coupons: coupons.map((c) => ({ code: c.code, type: c.type, value: c.value })),
        categories: categories.map((c) => c.name),
        selectedProduct: selectedAdminProduct
          ? {
              id: selectedAdminProduct.id,
              sku: selectedAdminProduct.sku,
              name: selectedAdminProduct.name,
              price: selectedAdminProduct.price,
              category: selectedAdminProduct.category,
            }
          : null,
        selectedOrder: selectedAdminOrder
          ? {
              id: selectedAdminOrder.id,
              orderNumber: selectedAdminOrder.orderNumber,
              customerName: selectedAdminOrder.customerName,
              status: selectedAdminOrder.status,
              paymentStatus: selectedAdminOrder.paymentStatus,
              total: selectedAdminOrder.total,
            }
          : null,
        aiTone: settings.aiTone || 'Luxury',
      };

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt: promptToSend, storeContext: storeSnapshot }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI service returned an error.');
      }

      const executedTools: AIMessageRecord['toolExecutions'] = [];
      if (Array.isArray(data.blockedCalls)) {
        for (const bc of data.blockedCalls) {
          executedTools.push({
            name: bc.name,
            args: {},
            status: 'FAILED',
            resultSummary: `Blocked by Server Guard: ${bc.reason}`,
          });
        }
      }
      if (Array.isArray(data.functionCalls)) {
        for (const fc of data.functionCalls) {
          const outcome = await executeSingleToolCall(fc.name, fc.args || {});
          executedTools.push({
            name: fc.name,
            args: fc.args || {},
            status: outcome.status,
            resultSummary: outcome.summary,
          });
        }
      }

      const assistantReply: AIMessageRecord = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content:
          data.text ||
          (executedTools.length > 0
            ? executedTools.map((t) => t.resultSummary).join('\n')
            : 'Operation analyzed.'),
        timestamp: new Date().toISOString(),
        toolExecutions: executedTools,
      };

      setAiMessages((prev) => [...prev, assistantReply]);
    } catch (error: any) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `AI execution error: ${error?.message || 'Please retry.'}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setAiBusy(false);
    }
  };

  // RFC-4180 Compliant Multi-line CSV & TSV Parser & Deep Validator
  const handleParseCsv = (
    raw: string,
    forcedDelimiter?: string,
    forcedCurrency?: 'PKR' | 'USD' | 'DIRECT'
  ): ParsedCsvRow[] => {
    if (!raw || !raw.trim()) {
      showToast('CSV is empty. Please upload or paste catalog data.');
      setParsedCsvRows([]);
      return [];
    }

    const activeDelimiter =
      forcedDelimiter || (selectedDelimiter === 'auto' ? undefined : selectedDelimiter);
    const { rows: allRows, malformedQuotes } = parseCsvRFC4180(raw, activeDelimiter);

    if (allRows.length < 2) {
      showToast('CSV must contain a header row and at least one product row.');
      setParsedCsvRows([]);
      return [];
    }

    const rawHeaders = allRows[0];
    const normalizedHeaders = rawHeaders.map((h) =>
      h.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
    );

    // Priority-based column finder: checks candidate synonyms in strict order of precedence!
    const findColIndex = (candidates: string[]) => {
      // 1. Exact normalized match pass
      for (const cand of candidates) {
        const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
        const idx = normalizedHeaders.findIndex((h) => h === cleanCand);
        if (idx !== -1) return idx;
      }
      // 2. Substring match pass (in candidate priority order)
      for (const cand of candidates) {
        const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
        const idx = normalizedHeaders.findIndex((h) => h.includes(cleanCand));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const nameIdx = findColIndex([
      'name',
      'title',
      'productname',
      'producttitle',
      'itemname',
      'itemtitle',
      'product',
      'item',
      'heading',
      'label',
    ]);

    // Priority for Price: NEVER match 'cost' or 'amount' before real price headers!
    const regularPriceIdx = findColIndex([
      'regularprice',
      'price',
      'sellingprice',
      'unitprice',
      'retailprice',
      'saleprice',
      'productprice',
      'itemprice',
      'pricepkr',
      'priceusd',
      'pkr',
      'usd',
      'rate',
      'msrp',
    ]);

    const salePriceIdx = findColIndex([
      'saleprice',
      'specialprice',
      'discountprice',
      'offerprice',
    ]);

    const skuIdx = findColIndex([
      'sku',
      'productsku',
      'variantsku',
      'itemsku',
      'itemcode',
      'code',
      'id',
      'productid',
      'barcode',
      'upc',
    ]);

    const inStockIdx = findColIndex(['instock', 'instock?']);
    const stockIdx = findColIndex([
      'stock',
      'quantity',
      'qty',
      'inventory',
      'inventoryquantity',
      'units',
      'available',
      'stockcount',
      'count',
      'onhand',
    ]);

    // Prioritize categories
    const categoryIdx = findColIndex([
      'categories',
      'category',
      'productcategories',
      'productcategory',
      'collection',
      'department',
      'group',
      'cat',
      'producttype',
    ]);

    const brandIdx = findColIndex([
      'brand',
      'vendor',
      'manufacturer',
      'designer',
      'maker',
      'company',
      'supplier',
    ]);

    const descIdx = findColIndex([
      'shortdescription',
      'description',
      'desc',
      'body',
      'bodyhtml',
      'details',
      'summary',
      'about',
    ]);

    const compareAtPriceIdx = findColIndex([
      'compareatprice',
      'originalprice',
      'listprice',
      'oldprice',
      'wasprice',
    ]);

    const costPriceIdx = findColIndex([
      'costprice',
      'unitcost',
      'cost',
      'buyprice',
      'purchaseprice',
    ]);

    const seoTitleIdx = findColIndex([
      'seotitle',
      'metatitle',
      'pagetitle',
    ]);

    const seoDescIdx = findColIndex([
      'seodescription',
      'metadescription',
      'metadesc',
    ]);

    const imageIdx = findColIndex([
      'images',
      'image',
      'imageurl',
      'primaryimage',
      'featuredimage',
      'photo',
      'picture',
      'img',
      'src',
    ]);

    // Auto-detect currency if not explicitly forced by button click
    let activeCurrency: 'PKR' | 'USD' | 'DIRECT' = forcedCurrency || csvCurrency;
    if (!forcedCurrency) {
      const detected = detectPriceCurrency(raw.slice(0, 5000), rawHeaders);
      if (detected === 'PKR') {
        activeCurrency = 'PKR';
        setCsvCurrency('PKR');
      } else if (detected === 'USD' && csvCurrency !== 'PKR') {
        activeCurrency = 'USD';
        setCsvCurrency('USD');
      }
    }

    const seenSkusInBatch = new Set<string>();

    const rows = allRows.slice(1).map((cells, index) => {
      const rawName = nameIdx !== -1 ? (cells[nameIdx] || '').trim() : '';
      const rawSku = skuIdx !== -1 ? (cells[skuIdx] || '').trim() : '';

      // Clean and sanitize SKU: replace spaces and weird characters with hyphens
      let cleanedSku = rawSku.replace(/[^a-zA-Z0-9_\-\.]/g, '-').replace(/^-+|-+$/g, '');
      const fallbackSku = `AA-${(rawName || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'CSV'}-${String(index + 1).padStart(3, '0')}`;
      if (!cleanedSku) {
        cleanedSku = fallbackSku;
      }

      // Extract Price (WooCommerce sale price vs regular price support)
      const rawSale = salePriceIdx !== -1 ? parseNumericPrice(cells[salePriceIdx] || '') : NaN;
      const rawRegular = regularPriceIdx !== -1 ? parseNumericPrice(cells[regularPriceIdx] || '') : NaN;

      const hasValidSale = !isNaN(rawSale) && rawSale > 0;
      const hasValidRegular = !isNaN(rawRegular) && rawRegular > 0;

      let rawProductPrice = hasValidSale ? rawSale : hasValidRegular ? rawRegular : NaN;

      // Smart fallback: If price column wasn't detected or empty, look for any cell with numeric price
      if (isNaN(rawProductPrice) || rawProductPrice <= 0) {
        for (let col = 0; col < cells.length; col++) {
          if (col !== skuIdx && col !== stockIdx) {
            const candidatePrice = parseNumericPrice(cells[col] || '');
            if (!isNaN(candidatePrice) && candidatePrice > 0) {
              rawProductPrice = candidatePrice;
              break;
            }
          }
        }
      }

      let rawCompareAt =
        hasValidSale && hasValidRegular && rawRegular > rawSale
          ? rawRegular
          : compareAtPriceIdx !== -1
          ? parseNumericPrice(cells[compareAtPriceIdx] || '')
          : undefined;

      let finalPrice = isNaN(rawProductPrice) ? 0 : rawProductPrice;
      let finalCompareAt = rawCompareAt;

      // Currency conversion:
      // 'PKR': CSV has Pakistani Rupees (e.g., Rs. 2,500) -> converts to USD ($8.98) -> customer sees PKR 2,500 ($8.98)
      // 'USD': CSV has US Dollars (e.g., $25) -> stored as $25
      // 'DIRECT': Exact store price without any conversion
      if (activeCurrency === 'PKR' && finalPrice > 0) {
        finalPrice = Number((finalPrice / USD_TO_PKR_RATE).toFixed(2));
        if (finalCompareAt && !isNaN(finalCompareAt) && finalCompareAt > 0) {
          finalCompareAt = Number((finalCompareAt / USD_TO_PKR_RATE).toFixed(2));
        }
      }

      // Stock handling (numeric stock vs WooCommerce "In stock?" 1/0)
      let parsedStock = 15;
      let isStockDefaulted = false;
      if (stockIdx !== -1 && cells[stockIdx]?.trim()) {
        const res = parseNumericStock(cells[stockIdx], 15);
        parsedStock = res.stock;
        isStockDefaulted = res.isDefault;
      } else if (inStockIdx !== -1 && cells[inStockIdx]?.trim()) {
        const val = cells[inStockIdx].trim();
        if (val === '1' || val.toLowerCase() === 'yes' || val.toLowerCase() === 'instock') {
          parsedStock = 25;
        } else if (val === '0' || val.toLowerCase() === 'no' || val.toLowerCase() === 'outofstock') {
          parsedStock = 0;
        }
      } else {
        isStockDefaulted = true;
      }

      // Category extraction (filtering WooCommerce "Simple" product types)
      let rawCategory = categoryIdx !== -1 ? (cells[categoryIdx] || '').trim() : '';
      if (['simple', 'variable', 'grouped', 'external'].includes(rawCategory.toLowerCase())) {
        rawCategory = '';
      }
      if (!rawCategory) {
        const altIdx = normalizedHeaders.findIndex(
          (h, i) => i !== categoryIdx && (h.includes('cat') || h.includes('group') || h.includes('collection'))
        );
        if (altIdx !== -1) {
          rawCategory = (cells[altIdx] || '').trim();
        }
      }
      if (rawCategory) {
        rawCategory = rawCategory
          .replace(/&amp;/g, '&')
          .replace(/&gt;/g, '>')
          .replace(/<[^>]*>/g, '');
        const parts = rawCategory.split(/[,>]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          rawCategory = parts[parts.length - 1] || parts[0];
        }
      }
      const category = rawCategory || 'General';

      const brand = (brandIdx !== -1 && cells[brandIdx]?.trim()) || 'Atelier Aurelia';

      // Clean HTML from short description
      let shortDescription = descIdx !== -1 ? (cells[descIdx] || '').trim() : '';
      if (shortDescription) {
        shortDescription = shortDescription
          .replace(/<[^>]*>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 490);
      }

      const seoTitle = (seoTitleIdx !== -1 && cells[seoTitleIdx]?.trim()) || '';
      const seoDescription = (seoDescIdx !== -1 && cells[seoDescIdx]?.trim()) || '';
      const costPrice = costPriceIdx !== -1 ? parseNumericPrice(cells[costPriceIdx] || '') : undefined;

      // Extract image URL (WooCommerce multiple comma-separated images)
      let primaryImage: string | undefined = undefined;
      if (imageIdx !== -1 && cells[imageIdx]?.trim()) {
        const rawImg = cells[imageIdx].trim();
        const firstUrl = rawImg.split(/[\s,]+/)[0]?.trim();
        if (firstUrl && (firstUrl.startsWith('http://') || firstUrl.startsWith('https://'))) {
          primaryImage = firstUrl;
        }
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      if (malformedQuotes && index === allRows.length - 2) {
        warnings.push('Encountered unclosed quote in file');
      }

      // Name handling with auto-fallback
      let finalName = rawName;
      if (!finalName) {
        // Fallback: use first cell that looks like text
        const textCell = cells.find((c) => c && c.trim().length > 2 && isNaN(Number(c)));
        finalName = textCell ? textCell.trim() : `Catalog Piece #${index + 1}`;
        warnings.push(`Name auto-assigned: ${finalName}`);
      }

      // Price handling
      if (isNaN(rawProductPrice) || rawProductPrice <= 0) {
        errors.push('Missing valid price');
      }

      if (rawSku && rawSku !== cleanedSku) {
        warnings.push(`Sanitized SKU: ${cleanedSku}`);
      } else if (!rawSku) {
        warnings.push(`Auto-assigned SKU: ${cleanedSku}`);
      }

      if (isStockDefaulted) {
        warnings.push('Stock defaulted to 15');
      }

      // Disambiguate duplicate SKUs instead of blocking import
      let finalSku = cleanedSku;
      const lowerSku = finalSku.toLowerCase();
      if (seenSkusInBatch.has(lowerSku)) {
        finalSku = `${cleanedSku}-${index + 1}`;
        warnings.push(`Auto-disambiguated duplicate SKU: ${finalSku}`);
      }
      seenSkusInBatch.add(finalSku.toLowerCase());

      const duplicate = products.some((p) => p.sku.toLowerCase() === finalSku.toLowerCase());

      return {
        rowNumber: index + 2,
        sku: finalSku,
        name: finalName,
        price: finalPrice,
        originalCsvPrice: isNaN(rawProductPrice) ? 0 : rawProductPrice,
        csvCurrency: activeCurrency,
        stock: parsedStock,
        category,
        brand,
        shortDescription,
        ...(seoTitle ? { seoTitle } : {}),
        ...(seoDescription ? { seoDescription } : {}),
        ...(finalCompareAt && !isNaN(finalCompareAt) ? { compareAtPrice: finalCompareAt } : {}),
        ...(costPrice && !isNaN(costPrice) ? { costPrice } : {}),
        ...(primaryImage ? { primaryImage } : {}),
        valid: errors.length === 0,
        errors,
        warnings,
        duplicate,
      };
    });

    setParsedCsvRows(rows);
    setCsvImportSummary(null);
    return rows;
  };

  // AI Enrich CSV Rows (Generates missing descriptions & SEO before import)
  const handleAIEnrichCsv = async (inputRows?: ParsedCsvRow[]): Promise<ParsedCsvRow[]> => {
    const baseRows =
      inputRows && inputRows.length > 0
        ? inputRows
        : parsedCsvRows.length > 0
        ? parsedCsvRows
        : handleParseCsv(csvRawText);
    if (baseRows.length === 0) return [];

    setCsvEnriching(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/ai/enrich-csv-rows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rows: baseRows, tone: settings.aiTone || 'Luxury' }),
      });
      const data = await res.json();
      if (Array.isArray(data.enriched)) {
        const nextRows: ParsedCsvRow[] = baseRows.map((row) => {
          const match = data.enriched.find((e: any) => e.sku === row.sku || e.name === row.name);
          if (!match) return row;
          return {
            ...row,
            shortDescription: match.shortDescription || row.shortDescription,
            seoTitle: match.seoTitle || row.seoTitle,
            seoDescription: match.seoDescription || row.seoDescription,
          };
        });
        setParsedCsvRows(nextRows);
        showToast('AI enriched CSV rows with luxury descriptions & SEO metadata.');
        return nextRows;
      }
      return baseRows;
    } catch {
      showToast('AI enrichment failed. Using existing row data.');
      return baseRows;
    } finally {
      setCsvEnriching(false);
    }
  };

  // Auto-Fix All CSV Validation Issues (sanitizes SKUs, auto-assigns names, repairs prices)
  const handleAutoFixAllRows = () => {
    if (parsedCsvRows.length === 0) return;
    const seen = new Set<string>();
    const fixed = parsedCsvRows.map((r, i) => {
      let sku = (r.sku || `AA-ITEM-${r.rowNumber}`).replace(/[^a-zA-Z0-9_\-\.]/g, '-');
      if (seen.has(sku.toLowerCase())) {
        sku = `${sku}-${i + 1}`;
      }
      seen.add(sku.toLowerCase());

      const name = r.name && r.name !== 'Untitled Product' ? r.name : `Catalog Piece #${i + 1}`;
      const price = !isNaN(r.price) && r.price > 0 ? r.price : 25;
      const stock = !isNaN(r.stock) && r.stock >= 0 ? r.stock : 15;

      return {
        ...r,
        sku,
        name,
        price,
        stock,
        category: r.category || 'General',
        brand: r.brand || 'Atelier Aurelia',
        valid: true,
        errors: [],
        warnings: [...r.warnings, 'Auto-repaired for instant catalog import'],
      };
    });
    setParsedCsvRows(fixed);
    showToast(`Auto-repaired all ${fixed.length} rows. Ready to import!`);
  };

  // Execute CSV Import into Store Database
  const handleCommitCsvImport = async (inputRows?: ParsedCsvRow[]) => {
    let rowsToCommit = inputRows && inputRows.length > 0 ? inputRows : parsedCsvRows;
    if (rowsToCommit.length === 0) {
      showToast('No parsed rows to import. Please stage or upload CSV data.');
      return { imported: 0, updated: 0, failed: 0 };
    }

    setCsvImporting(true);
    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errorDetails: string[] = [];

    const taskId = `task-csv-${Date.now()}`;
    try {
      await createOrUpdateAITask({
        id: taskId,
        name: `CSV Product Catalog Import (${rowsToCommit.length} rows)`,
        toolName: 'importCSV',
        status: 'RUNNING',
        totalItems: rowsToCommit.length,
        completedItems: 0,
      });
    } catch {
      // Background task telemetry should never block catalog import
    }

    try {
      // Step 1: Collect external images to download & archive locally so links never expire
      const externalImageUrls = Array.from(
        new Set(
          rowsToCommit
            .map((r) => r.primaryImage)
            .filter((img): img is string => Boolean(img && (img.startsWith('http://') || img.startsWith('https://'))))
        )
      );

      let localImageMap: Record<string, string> = {};
      if (externalImageUrls.length > 0) {
        showToast(`Downloading & archiving ${externalImageUrls.length} images to local store storage...`);
        try {
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
          const batchRes = await fetch('/api/media/batch-download', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ urls: externalImageUrls }),
          });
          if (batchRes.ok) {
            const batchData = await batchRes.json();
            localImageMap = batchData.results || {};
            showToast(`Permanently saved ${Object.keys(localImageMap).length} images to store storage!`);
          }
        } catch (err) {
          console.warn('Batch image archiver fallback:', err);
        }
      }

      const productsToBatch: Product[] = [];
      const now = new Date().toISOString();

      for (const row of rowsToCommit) {
        // Safe on-the-fly sanitization so small issues never reject valid products
        const cleanSku = (row.sku || `AA-ITEM-${row.rowNumber}`)
          .replace(/[^a-zA-Z0-9_\-]/g, '-')
          .slice(0, 60);
        const cleanName = (row.name && row.name !== 'Untitled Product' ? row.name : `Catalog Piece #${row.rowNumber}`).slice(0, 190);
        const cleanPrice = !isNaN(row.price) && row.price > 0 ? row.price : 10;
        const cleanStock = !isNaN(row.stock) && row.stock >= 0 ? Math.round(row.stock) : 15;
        const finalImage = (row.primaryImage && localImageMap[row.primaryImage]) ? localImageMap[row.primaryImage] : (row.primaryImage || IMG_HANDBAG);

        try {
          const existing = products.find((p) => p.sku.toLowerCase() === cleanSku.toLowerCase());
          const prodId = existing?.id || sanitizeDocId(`prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

          const prepared: Product = {
            id: prodId,
            sku: sanitizeSku(cleanSku),
            name: cleanName,
            slug: sanitizeSlug(cleanName || prodId),
            price: cleanPrice,
            compareAtPrice: row.compareAtPrice ? Math.max(0, Number(row.compareAtPrice)) : Math.round(cleanPrice * 1.15),
            costPrice: row.costPrice ? Math.max(0, Number(row.costPrice)) : Math.round(cleanPrice * 0.35),
            stock: cleanStock,
            reservedStock: 0,
            lowStockThreshold: 5,
            category: (row.category || 'General').slice(0, 75),
            subcategory: 'Catalog Collection',
            brand: (row.brand || 'Atelier Aurelia').slice(0, 75),
            shortDescription: (row.shortDescription || `Exclusive piece: ${cleanName}`).slice(0, 480),
            description: (row.shortDescription || `Handcrafted ${cleanName} from our catalog collection.`).slice(0, 4800),
            status: 'ACTIVE',
            featured: false,
            bestSeller: false,
            newArrival: true,
            seoTitle: (row.seoTitle || `${cleanName} | Atelier Aurelia`).slice(0, 150),
            seoDescription: (row.seoDescription || `Discover ${cleanName} from our store.`).slice(0, 310),
            seoKeywords: `${(row.category || 'luxury').toLowerCase()}, catalog`,
            primaryImage: finalImage.slice(0, 980),
            rating: 5.0,
            reviewCount: 1,
            weightKg: 0.8,
            dimensions: 'Standard Edition',
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          };

          productsToBatch.push(prepared);
          if (existing) updated++;
          else imported++;
        } catch (err: any) {
          failed++;
          errorDetails.push(`SKU ${cleanSku}: ${err?.message || 'Save error'}`);
        }
      }

      if (productsToBatch.length > 0) {
        await importProductsBatch(productsToBatch);
      }

      try {
        await createOrUpdateAITask({
          id: taskId,
          name: `CSV Product Catalog Import (${rowsToCommit.length} rows)`,
          toolName: 'importCSV',
          status: failed === rowsToCommit.length ? 'FAILED' : 'COMPLETED',
          totalItems: rowsToCommit.length,
          completedItems: imported + updated,
          failedItems: failed,
          summary: `Imported: ${imported}, Updated: ${updated}, Failed: ${failed}${errorDetails.length > 0 ? ` (${errorDetails.slice(0, 3).join(', ')})` : ''}`,
        });
      } catch {
        // Ignore telemetry errors
      }

      const summary = { imported, updated, failed };
      setCsvImportSummary(summary);
      showToast(`CSV Import complete: ${imported} created, ${updated} updated, ${failed} failed.`);
      return summary;
    } catch (globalErr: any) {
      showToast(`CSV import error: ${globalErr?.message || 'Please retry.'}`);
      return { imported, updated, failed: rowsToCommit.length - (imported + updated) };
    } finally {
      setCsvImporting(false);
    }
  };

  // Export Orders to CSV file download
  const handleExportOrdersCsv = () => {
    const headers = ['orderNumber', 'customerName', 'customerEmail', 'status', 'paymentStatus', 'paymentMethod', 'total', 'trackingNumber', 'createdAt'];
    const csvLines = [
      headers.join(','),
      ...orders.map((o) =>
        [
          o.orderNumber,
          `"${(o.customerName || '').replace(/"/g, '""')}"`,
          `"${(o.customerEmail || '').replace(/"/g, '""')}"`,
          o.status,
          o.paymentStatus,
          o.paymentMethod,
          o.total,
          `"${(o.trackingNumber || '').replace(/"/g, '""')}"`,
          o.createdAt,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-aurelia-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditLog('CSV_EXPORTED', 'Orders', `Exported ${orders.length} orders to CSV`);
    showToast(`Exported ${orders.length} orders to CSV.`);
  };

  // Export Products to CSV file download
  const handleExportProductsCsv = () => {
    const headers = ['sku', 'name', 'price', 'compareAtPrice', 'costPrice', 'stock', 'category', 'brand', 'shortDescription', 'status', 'seoTitle'];
    const csvLines = [
      headers.join(','),
      ...products.map((p) =>
        [
          p.sku,
          `"${(p.name || '').replace(/"/g, '""')}"`,
          p.price,
          p.compareAtPrice || '',
          p.costPrice || '',
          p.stock,
          `"${(p.category || '').replace(/"/g, '""')}"`,
          `"${(p.brand || '').replace(/"/g, '""')}"`,
          `"${(p.shortDescription || '').replace(/"/g, '""')}"`,
          p.status,
          `"${(p.seoTitle || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-aurelia-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditLog('CSV_EXPORTED', 'Products', `Exported ${products.length} products to CSV`);
    showToast(`Exported ${products.length} products to CSV.`);
  };

  // Download Ready-to-use Sample CSV Template
  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-sample-catalog.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded sample CSV template.');
  };

  // Load sample template into staging area
  const handleLoadSampleTemplate = () => {
    setCsvRawText(SAMPLE_CSV_TEMPLATE);
    setCsvUploadedFileName('sample-product-catalog.csv');
    handleParseCsv(SAMPLE_CSV_TEMPLATE);
    showToast('Loaded sample luxury catalog template.');
  };

  // Generate AI Content inside Product Modal
  const handleGenerateModalContent = async () => {
    if (!editingProduct?.name) {
      showToast('Enter a product name first.');
      return;
    }
    setGeneratingContent(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/ai/generate-product-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: editingProduct.name,
          category: editingProduct.category || 'Leather Goods',
          brand: editingProduct.brand || 'Atelier Aurelia',
          price: editingProduct.price || 850,
          tone: settings.aiTone || 'Luxury',
        }),
      });
      const data = await res.json();
      setEditingProduct((prev) => ({
        ...prev,
        shortDescription: data.shortDescription || prev?.shortDescription,
        description: data.description || prev?.description,
        seoTitle: data.seoTitle || prev?.seoTitle,
        seoDescription: data.seoDescription || prev?.seoDescription,
        seoKeywords: data.seoKeywords || prev?.seoKeywords,
      }));
      showToast('AI generated complete product copy & SEO metadata.');
    } catch {
      showToast('AI generation failed. Please retry.');
    } finally {
      setGeneratingContent(false);
    }
  };

  // Generate 5 Studio Shot Variations for a Product
  const handleGenerateStudioShots = async (productName: string, category: string) => {
    setGeneratingShots(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/ai/generate-product-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ productName, category }),
      });
      const data = await res.json();
      if (Array.isArray(data.shots)) {
        setStudioShots(data.shots);
        showToast(`Generated 5 studio shot variations for ${productName}.`);
      }
    } catch {
      showToast('Studio shot generation failed.');
    } finally {
      setGeneratingShots(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#FBFBF9] text-[#141413]">
      {/* Fixed 256px SaaS Workspace Sidebar */}
      <aside className="w-64 shrink-0 border-r border-black/[0.08] bg-white flex flex-col justify-between">
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-lg font-display font-semibold tracking-tight text-[#141413]">
              {settings.storeName}
            </span>
            <button
              onClick={onReturnToStore}
              className="text-xs text-[#575653] hover:text-[#141413] flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Store</span>
            </button>
          </div>

          <nav className="space-y-1 text-xs">
            {(
              [
                { id: 'AI_COMMAND_CENTER', label: 'AI Command Center', icon: Terminal },
                { id: 'DASHBOARD', label: 'Executive Analytics', icon: LayoutDashboard },
                { id: 'PRODUCTS', label: 'New Listing', icon: Package },
                { id: 'INVENTORY', label: 'Inventory Control', icon: Boxes },
                { id: 'CSV_WORKFLOW', label: 'CSV Import / Export', icon: FileSpreadsheet },
                { id: 'ORDERS', label: 'Orders & Fulfillment', icon: ShoppingCart },
                { id: 'COUPONS', label: 'Promotions & Coupons', icon: Tag },
                { id: 'REVIEWS', label: 'Client Reviews', icon: MessageSquare },
                { id: 'AI_TASKS', label: 'AI Background Tasks', icon: Cpu },
                { id: 'AUDIT_LOGS', label: 'Security Audit Log', icon: ShieldAlert },
                { id: 'NOTIFICATIONS', label: 'Inbox', icon: Inbox },
                { id: 'SETTINGS', label: 'Store & AI Settings', icon: Settings },
              ] as { id: AdminTab; label: string; icon: any }[]
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              const isInbox = item.id === 'NOTIFICATIONS';
              const totalUnread = unreadTicketsCount + unreadAlertsCount;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    try {
                      localStorage.setItem('atelier_admin_tab', item.id);
                    } catch {}
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer rounded-sm ${
                    active
                      ? 'bg-[#C5A059] text-black font-extrabold shadow-sm'
                      : 'text-black font-bold hover:text-black hover:bg-black/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0 text-[#141413]" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {isInbox && totalUnread > 0 && (
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        active ? 'bg-black text-[#FBFBF9]' : 'bg-[#C5A059] text-black'
                      }`}
                      title={`${unreadTicketsCount} open inquiries, ${unreadAlertsCount} unread alerts`}
                    >
                      {totalUnread}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User / Role Status */}
        <div className="p-4 border-t border-black/[0.08] space-y-3 text-xs">
          {firebaseUser ? (
            <div>
              <div className="font-medium text-[#141413] truncate">{userProfile?.name}</div>
              <div className="text-[11px] font-mono text-[#C5A059] mt-0.5">
                Role: {userProfile?.role}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] text-amber-300">
                Sign in with Google ({userProfile?.email || 'mralun683@gmail.com'}) to persist catalog mutations to Cloud Firestore.
              </div>
              <button
                onClick={signInWithGoogle}
                className="w-full py-2 bg-[#C5A059] text-[#0B0F17] font-semibold text-xs cursor-pointer"
              >
                Admin Google Sign-In
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left | Actions Right */}
        <header className="h-16 border-b border-black/[0.08] px-8 flex items-center justify-between bg-white/90 backdrop-blur-xs">
          <div className="flex items-center gap-2 text-xs text-[#575653]">
            <span>Admin Console</span>
            <span>/</span>
            <span className="text-[#141413] font-medium">{activeTab.replace(/_/g, ' ')}</span>
            {selectedAdminProduct && (
              <>
                <span>/</span>
                <span className="text-[#C5A059] font-mono">
                  Context: {selectedAdminProduct.sku} ({selectedAdminProduct.name})
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {activeTab !== 'AI_COMMAND_CENTER' && (
              <button
                onClick={() => setCopilotDrawerOpen((o) => !o)}
                className="px-3.5 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>AI Copilot</span>
              </button>
            )}
            <button
              onClick={handleExportProductsCsv}
              className="px-3.5 py-2 border border-black/[0.12] text-xs text-[#2A2A28] hover:border-black/40 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Catalog CSV</span>
            </button>
            <button
              onClick={onReturnToStore}
              className="px-3.5 py-2 border border-black/[0.12] text-xs text-[#2A2A28] hover:border-black/40 cursor-pointer"
            >
              View Live Storefront
            </button>
          </div>
        </header>

        {/* Confirmation Banner Gate for High-Risk AI Actions */}
        {pendingConfirmations.length > 0 && (
          <div className="bg-amber-950/80 border-b border-amber-500/40 px-8 py-4 space-y-3">
            {pendingConfirmations.map((conf) => (
              <div
                key={conf.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>AI Safety Confirmation Required:</strong> {conf.description}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      const summary = await conf.onConfirm();
                      setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id));
                      setAiMessages((prev) => [
                        ...prev,
                        {
                          id: `conf-done-${Date.now()}`,
                          role: 'assistant',
                          content: `Confirmed & Executed: ${summary}`,
                          timestamp: new Date().toISOString(),
                        },
                      ]);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Approve & Execute
                  </button>
                  <button
                    onClick={() =>
                      setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id))
                    }
                    className="px-3.5 py-1.5 border border-black/15 text-xs text-[#454441] cursor-pointer"
                  >
                    Cancel Action
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Workspace Content */}
        <div className="flex-1 p-8 overflow-y-auto space-y-8">
          {/* ======================== TAB 1: AI COMMAND CENTER ======================== */}
          {activeTab === 'AI_COMMAND_CENTER' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 8 Cols: Natural Language Chat & Execution Log */}
              <div className="lg:col-span-8 bg-white border border-black/[0.08] flex flex-col h-[680px]">
                <div className="p-4 border-b border-black/[0.08] flex items-center justify-between">
                  <div>
                    <h1 className="text-base font-semibold text-[#141413]">
                      Autonomous Store Operator (Gemini Function Calling)
                    </h1>
                    <p className="text-xs text-[#575653]">
                      Executes real database mutations, SEO generation, pricing updates, and order workflows.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#C5A059]">
                    Tone: {settings.aiTone || 'Luxury'}
                  </span>
                </div>

                {/* Message History */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 border ${
                        msg.role === 'user'
                          ? 'bg-[#F5F4F0] border-black/[0.12] ml-12'
                          : 'bg-[#FBFBF9] border-black/[0.08] mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#575653] mb-2 font-mono">
                        <span>{msg.role === 'user' ? 'ADMIN INSTRUCTION' : 'AI OPERATOR'}</span>
                        <span>{msg.timestamp.slice(11, 19)}</span>
                      </div>
                      <p className="text-xs text-[#2A2A28] leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>

                      {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-black/[0.08] space-y-2">
                          <div className="text-[11px] font-mono uppercase text-[#C5A059]">
                            Executed Store Tools ({msg.toolExecutions.length}):
                          </div>
                          {msg.toolExecutions.map((t, i) => (
                            <div
                              key={i}
                              className="p-2.5 bg-white border border-black/[0.08] text-xs font-mono space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-emerald-400 font-semibold">{t.name}()</span>
                                <span className="text-[11px] text-[#575653]">{t.status}</span>
                              </div>
                              <div className="text-[#454441] text-[11px]">{t.resultSummary}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {aiBusy && (
                    <div className="p-4 bg-[#FBFBF9] border border-black/[0.08] text-xs text-[#575653] font-mono">
                      Analyzing store telemetry and executing authorized tools...
                    </div>
                  )}
                </div>

                {/* Prompt Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendAICommand();
                  }}
                  className="p-4 border-t border-black/[0.08] flex gap-3 bg-[#FBFBF9]"
                >
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Tell the AI what to do (e.g., 'Create a new product for Nike Air Max 270 price $180' or 'Increase price of Leather Goods by 10%')..."
                    className="flex-1 px-4 py-3 bg-white border border-black/[0.12] text-xs text-[#141413] focus:outline-none focus:border-[#C5A059]"
                  />
                  <button
                    type="submit"
                    disabled={aiBusy}
                    className="px-6 py-3 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 hover:bg-[#d4b26a] disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Execute</span>
                  </button>
                </form>
              </div>

              {/* Right 4 Cols: Built-in Demo Commands & Store Context */}
              <div className="lg:col-span-4 space-y-6">
                <div className="p-5 bg-white border border-black/[0.08] space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#C5A059]">
                    One-Click Demo AI Commands
                  </h2>
                  <p className="text-xs text-[#575653]">
                    Click any instruction below to watch the AI execute real database changes:
                  </p>
                  <div className="space-y-2">
                    {DEMO_AI_COMMANDS.map((cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendAICommand(cmd)}
                        disabled={aiBusy}
                        className="w-full text-left p-3 bg-[#FBFBF9] border border-black/[0.08] hover:border-[#C5A059] text-xs text-[#2A2A28] transition-colors cursor-pointer"
                      >
                        “{cmd}”
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-5 bg-white border border-black/[0.08] space-y-3 text-xs">
                  <h3 className="font-semibold uppercase tracking-wider text-[#141413]">
                    Live Store Memory Context
                  </h3>
                  <div className="space-y-1.5 text-[#575653] font-mono tabular-nums">
                    <div>Active Products: {products.length}</div>
                    <div>Low Stock Alerts: {lowStockProducts.length}</div>
                    <div>Missing SEO Metadata: {missingSeoProducts.length}</div>
                    <div>Unshipped Orders: {unshippedOrders.length}</div>
                    <div>Active Coupons: {coupons.length}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 2: EXECUTIVE DASHBOARD ======================== */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display font-medium text-[#141413]">
                    Store Telemetry & Financial Overview
                  </h1>
                  <p className="text-xs text-[#575653]">
                    Real-time metrics computed directly from active orders and inventory records.
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-white p-1 border border-black/[0.08]">
                  {(['TODAY', '7D', '30D', 'ALL'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateFilter(range)}
                      className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                        dateFilter === range
                          ? 'bg-[#C5A059] text-[#0B0F17] font-semibold'
                          : 'text-[#575653] hover:text-[#141413]'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 Key KPI Stat Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Gross Revenue (USD & PKR)</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#C5A059]">
                    {formatPKR(totalRevenue)}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-mono">
                    {orders.length} settled / active orders
                  </div>
                </div>

                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Average Order Value (AOV)</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    ${avgOrderValue.toFixed(2)}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#C5A059]">
                    {formatPKR(avgOrderValue)}
                  </div>
                  <div className="text-[11px] text-[#575653] font-mono">
                    Tax Rate: {settings.taxRate}%
                  </div>
                </div>

                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Catalog SKUs & Inventory</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    {products.length} SKUs
                  </div>
                  <div className="text-[11px] text-amber-400 font-mono">
                    {lowStockProducts.length} low-stock alerts (&le;5 units)
                  </div>
                </div>

                <div className="p-6 bg-white border border-black/[0.08] space-y-1">
                  <div className="text-xs text-[#575653]">Unshipped Fulfillment Queue</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                    {unshippedOrders.length} Orders
                  </div>
                  <div className="text-[11px] text-[#575653] font-mono">
                    {coupons.filter((c) => c.active).length} active promotions
                  </div>
                </div>
              </div>

              {/* Category Valuation Chart & Low Stock Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-6 p-6 bg-white border border-black/[0.08] space-y-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                    Inventory Valuation by Category
                  </h2>
                  <div className="space-y-4">
                    {categoryRevenueBreakdown.map((item) => {
                      const maxVal = Math.max(
                        ...categoryRevenueBreakdown.map((c) => c.stockValue),
                        1
                      );
                      const widthPct = Math.min(100, Math.round((item.stockValue / maxVal) * 100));
                      return (
                        <div key={item.name} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-[#2A2A28] font-medium">
                              {item.name} ({item.count} SKUs)
                            </span>
                            <span className="font-mono tabular-nums text-[#C5A059]">
                              ${item.stockValue.toLocaleString()} ({formatPKR(item.stockValue)})
                            </span>
                          </div>
                          <div className="w-full h-2 bg-black/[0.04] overflow-hidden">
                            <div
                              className="h-full bg-[#C5A059]"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-6 p-6 bg-white border border-black/[0.08] space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                      Low Stock Priority Attention ({lowStockProducts.length})
                    </h2>
                    <button
                      onClick={() => setActiveTab('INVENTORY')}
                      className="text-xs text-[#C5A059] hover:underline cursor-pointer"
                    >
                      Manage Inventory →
                    </button>
                  </div>
                  <div className="divide-y divide-black/[0.08]">
                    {lowStockProducts.slice(0, 5).map((p) => (
                      <div key={p.id} className="py-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium text-[#141413]">{p.name}</div>
                          <div className="text-[11px] font-mono text-[#575653]">
                            {p.sku} · {p.category}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono tabular-nums text-amber-400 font-semibold">
                            {p.stock} left
                          </span>
                          <button
                            onClick={() => adjustInventory(p.id, p.stock + 10, 'Quick Restock +10')}
                            className="px-2.5 py-1 bg-[#F5F4F0] hover:bg-[#EBEAE5] text-[#141413] font-mono text-[11px] cursor-pointer"
                          >
                            +10 Stock
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 3: PRODUCT CATALOG MANAGEMENT ======================== */}
          {activeTab === 'PRODUCTS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Filter by SKU, title, category, status..."
                    className="px-3.5 py-2 bg-white border border-black/[0.12] text-xs text-[#141413] w-72"
                  />
                  {selectedProductIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={async () => {
                          for (const id of selectedProductIds) {
                            const p = products.find((item) => item.id === id);
                            if (p) {
                              await saveProduct(
                                { ...p, price: Math.round(p.price * 1.1) },
                                'BULK_PRICE_+10%'
                              );
                            }
                          }
                          setSelectedProductIds([]);
                          showToast(`Increased price by 10% for ${selectedProductIds.length} products.`);
                        }}
                        className="px-3 py-2 bg-[#F5F4F0] text-xs text-[#141413] hover:bg-[#EBEAE5] cursor-pointer"
                      >
                        Bulk +10% Price ({selectedProductIds.length})
                      </button>
                      <button
                        onClick={async () => {
                          for (const id of selectedProductIds) {
                            const p = products.find((item) => item.id === id);
                            if (p) {
                              await saveProduct(
                                { ...p, status: p.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' },
                                'BULK_ARCHIVE_TOGGLE'
                              );
                            }
                          }
                          setSelectedProductIds([]);
                          showToast(`Updated archive status for ${selectedProductIds.length} products.`);
                        }}
                        className="px-3 py-2 bg-amber-500/20 border border-amber-500/40 text-xs text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                      >
                        Bulk Archive/Unarchive ({selectedProductIds.length})
                      </button>
                      <button
                        onClick={async () => {
                          const count = selectedProductIds.length;
                          for (const id of selectedProductIds) {
                            await removeProduct(id);
                          }
                          setSelectedProductIds([]);
                          showToast(`Deleted ${count} selected products.`);
                        }}
                        className="px-3 py-2 bg-rose-500/20 border border-rose-500/40 text-xs text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                      >
                        Bulk Delete ({selectedProductIds.length})
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() =>
                    setEditingProduct({
                      name: '',
                      sku: `AA-NEW-${Math.floor(100 + Math.random() * 899)}`,
                      price: 950,
                      stock: 15,
                      category: 'Leather Goods',
                      brand: 'Atelier Aurelia',
                      status: 'ACTIVE',
                      shortDescription: '',
                      description: '',
                      seoTitle: '',
                      seoDescription: '',
                    })
                  }
                  className="px-4 py-2.5 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Product</span>
                </button>
              </div>

              {/* High-Density Product Table */}
              <div className="bg-white border border-black/20 overflow-x-auto shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-black/30 bg-[#F0EFEA] text-black font-mono font-bold uppercase text-[12px]">
                      <th className="py-3 px-4 font-bold text-black">Select</th>
                      <th className="py-3 px-4 font-bold text-black">SKU</th>
                      <th className="py-3 px-4 font-bold text-black">Product Name</th>
                      <th className="py-3 px-4 font-bold text-black">Category / Status</th>
                      <th className="py-3 px-4 text-right font-bold text-black">Price</th>
                      <th className="py-3 px-4 text-right font-bold text-black">Stock</th>
                      <th className="py-3 px-4 font-bold text-black">SEO Status</th>
                      <th className="py-3 px-4 text-right font-bold text-black">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/15">
                    {products
                      .filter(
                        (p) =>
                          !productSearch.trim() ||
                          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.category.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.status.toLowerCase().includes(productSearch.toLowerCase())
                      )
                      .map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedAdminProduct(p)}
                          className={`hover:bg-[#F5F4EF] cursor-pointer transition-colors ${
                            selectedAdminProduct?.id === p.id ? 'bg-[#C5A059]/15' : ''
                          }`}
                        >
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedProductIds.includes(p.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProductIds((prev) => [...prev, p.id]);
                                } else {
                                  setSelectedProductIds((prev) => prev.filter((id) => id !== p.id));
                                }
                              }}
                            />
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-black">{p.sku}</td>
                          <td className="py-3 px-4 font-bold text-black text-sm">{p.name}</td>
                          <td className="py-3 px-4 text-black">
                            <div className="font-bold text-black">{p.category}</div>
                            <div className="text-[10px] font-mono uppercase text-stone-800 font-bold">
                              {p.status}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-black">
                            <div className="font-extrabold text-black text-sm">{formatPKR(p.price)}</div>
                            <div className="text-[11px] text-stone-900 font-semibold">${p.price.toLocaleString()} USD</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <span
                              className={
                                p.stock <= (p.lowStockThreshold || 5)
                                  ? 'text-amber-800 font-extrabold text-sm'
                                  : 'text-emerald-800 font-extrabold text-sm'
                              }
                            >
                              {p.stock}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {p.seoDescription ? (
                              <span className="text-emerald-800 font-mono font-bold text-[11px]">
                                Optimized
                              </span>
                            ) : (
                              <span className="text-amber-800 font-mono font-bold text-[11px]">
                                Missing SEO
                              </span>
                            )}
                          </td>
                          <td
                            className="py-3 px-4 text-right space-x-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setEditingProduct(p);
                                setStudioShots([]);
                              }}
                              className="px-2.5 py-1 border border-black/30 text-black font-bold hover:bg-black/10 cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                await saveProduct(
                                  {
                                    ...p,
                                    id: undefined,
                                    sku: `${p.sku}-COPY`,
                                    name: `${p.name} (Copy)`,
                                  },
                                  'DUPLICATE_PRODUCT'
                                );
                                showToast(`Duplicated ${p.name} (${p.sku}-COPY).`);
                              }}
                              className="px-2.5 py-1 border border-black/30 text-black font-bold hover:bg-black/10 cursor-pointer"
                            >
                              Duplicate
                            </button>
                            <button
                              onClick={async () => {
                                const nextStatus = p.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
                                await saveProduct({ ...p, status: nextStatus }, 'ARCHIVE_PRODUCT');
                                showToast(`${p.name} status set to ${nextStatus}.`);
                              }}
                              className="px-2.5 py-1 border border-amber-600 text-amber-900 font-bold hover:bg-amber-100 cursor-pointer"
                            >
                              {p.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
                            </button>
                            <button
                              onClick={() => removeProduct(p.id)}
                              className="px-2 py-1 text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                              aria-label="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Product Create/Edit & AI Image Studio Modal */}
              {editingProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 overflow-y-auto">
                  <div className="bg-white border border-black/[0.12] w-full max-w-3xl p-6 space-y-6 my-8">
                    <div className="flex items-center justify-between border-b border-black/[0.08] pb-4">
                      <h2 className="text-lg font-display text-[#141413]">
                        {editingProduct.id ? `Edit ${editingProduct.name}` : 'Create New Product'}
                      </h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGenerateModalContent}
                          disabled={generatingContent}
                          className="px-3 py-1.5 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
                        >
                          {generatingContent ? 'Generating...' : 'AI Auto-Write Copy & SEO'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleGenerateStudioShots(
                              editingProduct.name || 'Atelier Piece',
                              editingProduct.category || 'Leather Goods'
                            )
                          }
                          disabled={generatingShots}
                          className="px-3 py-1.5 border border-[#C5A059] text-[#C5A059] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>{generatingShots ? 'Rendering...' : 'Generate 5 Studio Shots'}</span>
                        </button>
                        <button
                          onClick={() => setEditingProduct(null)}
                          className="p-1 text-[#575653] hover:text-[#141413] cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div className="sm:col-span-2">
                        <label className="block text-[#575653] mb-1">Product Name</label>
                        <input
                          type="text"
                          value={editingProduct.name || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, name: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                        />
                      </div>
                      <div>
                        <label className="block text-[#575653] mb-1">SKU</label>
                        <input
                          type="text"
                          value={editingProduct.sku || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, sku: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[#575653] mb-1">
                          Price (USD) — <span className="text-[#C5A059] font-mono">{formatPKR(editingProduct.price || 0)}</span>
                        </label>
                        <input
                          type="number"
                          value={editingProduct.price ?? 0}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, price: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[#575653] mb-1">Stock Quantity</label>
                        <input
                          type="number"
                          value={editingProduct.stock ?? 0}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[#575653] mb-1">Category</label>
                        <input
                          type="text"
                          value={editingProduct.category || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, category: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[#575653] mb-1">Short Description</label>
                        <input
                          type="text"
                          value={editingProduct.shortDescription || ''}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              shortDescription: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                        />
                      </div>
                      <div>
                        <label className="block text-[#575653] mb-1">Full Editorial Description</label>
                        <textarea
                          rows={3}
                          value={editingProduct.description || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, description: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[#575653] mb-1">SEO Title</label>
                          <input
                            type="text"
                            value={editingProduct.seoTitle || ''}
                            onChange={(e) =>
                              setEditingProduct({ ...editingProduct, seoTitle: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                          />
                        </div>
                        <div>
                          <label className="block text-[#575653] mb-1">SEO Meta Description</label>
                          <input
                            type="text"
                            value={editingProduct.seoDescription || ''}
                            onChange={(e) =>
                              setEditingProduct({
                                ...editingProduct,
                                seoDescription: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 5 Generated Studio Shots Preview */}
                    {studioShots.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-black/[0.08]">
                        <div className="text-xs font-semibold text-[#C5A059]">
                          AI Product Photography Studio — 5 Variations
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                          {studioShots.map((shot, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 bg-[#FBFBF9] border border-black/[0.08] space-y-2 text-[11px]"
                            >
                              <div
                                className="h-16 w-full flex items-center justify-center font-mono text-[10px] text-[#141413]"
                                style={{
                                  background: `linear-gradient(135deg, ${shot.primaryHex || '#1e293b'}, ${
                                    shot.secondaryHex || '#0f172a'
                                  })`,
                                }}
                              >
                                {shot.shotType}
                              </div>
                              <div className="font-medium text-[#141413] line-clamp-1">
                                {shot.shotType}
                              </div>
                              <div className="text-[#575653] line-clamp-2">{shot.lightingSetup}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-black/[0.08]">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(null)}
                        className="px-4 py-2 border border-black/[0.12] text-xs text-[#454441] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const v = validateProductPayload({
                            name: editingProduct.name,
                            sku: editingProduct.sku,
                            price: Number(editingProduct.price ?? 0),
                            stock: Number(editingProduct.stock ?? 0),
                            category: editingProduct.category || 'Leather Goods',
                          });
                          if (!v.valid) {
                            showToast(v.errors[0]);
                            return;
                          }
                          await saveProduct({
                            ...editingProduct,
                            name: editingProduct.name!,
                            price: Number(editingProduct.price || 0),
                            category: editingProduct.category || 'Leather Goods',
                          });
                          setEditingProduct(null);
                          showToast('Product saved to store catalog.');
                        }}
                        className="px-6 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
                      >
                        Save Product
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 4: INVENTORY CONTROL ======================== */}
          {activeTab === 'INVENTORY' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-display text-[#141413]">
                  Real-Time Inventory & Stock Ledger
                </h1>
                <p className="text-xs text-[#575653]">
                  Negative stock is strictly prevented. Adjust stock counts or trigger low-stock alerts.
                </p>
              </div>

              <div className="bg-white border border-black/[0.08] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.08] text-[#575653] font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4 text-right">Available Stock</th>
                      <th className="py-3 px-4 text-right">Reserved</th>
                      <th className="py-3 px-4 text-right">Low Threshold</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Quick Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.08]">
                    {products.map((p) => {
                      const isLow = p.stock <= (p.lowStockThreshold || 5);
                      return (
                        <tr key={p.id} className="hover:bg-[#FAF9F5]">
                          <td className="py-3 px-4 font-mono text-[#454441]">{p.sku}</td>
                          <td className="py-3 px-4 text-[#141413] font-medium">{p.name}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#141413]">
                            {p.stock}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#575653]">
                            {p.reservedStock || 0}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#575653]">
                            {p.lowStockThreshold || 5}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px]">
                            {p.stock === 0 ? (
                              <span className="text-rose-400">OUT OF STOCK</span>
                            ) : isLow ? (
                              <span className="text-amber-400">LOW STOCK ALERT</span>
                            ) : (
                              <span className="text-emerald-400">NOMINAL</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5">
                            <button
                              onClick={() => adjustInventory(p.id, Math.max(0, p.stock - 1), '-1 Unit')}
                              className="px-2 py-1 border border-black/[0.12] font-mono text-[#141413] hover:bg-[#EBEAE5] cursor-pointer"
                            >
                              -1
                            </button>
                            <button
                              onClick={() => adjustInventory(p.id, p.stock + 1, '+1 Unit')}
                              className="px-2 py-1 border border-black/[0.12] font-mono text-[#141413] hover:bg-[#EBEAE5] cursor-pointer"
                            >
                              +1
                            </button>
                            <button
                              onClick={() => adjustInventory(p.id, p.stock + 25, 'Restock Batch +25')}
                              className="px-2.5 py-1 bg-[#C5A059] text-[#0B0F17] font-mono font-semibold cursor-pointer"
                            >
                              +25 Restock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================== TAB 5: CSV IMPORT / EXPORT WORKFLOW ======================== */}
          {activeTab === 'CSV_WORKFLOW' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display text-[#141413]">
                    CSV & TSV Catalog Import & AI Enrichment Pipeline
                  </h1>
                  <p className="text-xs text-[#575653]">
                    Upload or paste any product catalog (.csv, .tsv, .txt). Supports Excel exports, automatic delimiter detection (comma, semicolon, tab), flexible column headers, and AI luxury copy enrichment.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={handleLoadSampleTemplate}
                    className="px-3.5 py-2 border border-black/15 text-xs text-[#2A2A28] hover:border-black/40 hover:text-[#141413] cursor-pointer"
                  >
                    Load Sample Data
                  </button>
                  <button
                    onClick={handleDownloadSampleCsv}
                    className="px-3.5 py-2 border border-black/15 text-xs text-[#2A2A28] hover:border-black/40 hover:text-[#141413] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Template</span>
                  </button>
                  <label className="px-4 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 cursor-pointer hover:bg-[#d6b26b]">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload CSV / TSV</span>
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        e.target.value = ''; // Reset input to allow re-selecting same file
                        const check = validateCsvFileUpload(file);
                        if (!check.valid) {
                          showToast(check.errors.join(' '));
                          return;
                        }
                        const isPkrHint =
                          file.name.toLowerCase().includes('woocommerce') ||
                          file.name.toLowerCase().includes('pkr') ||
                          file.name.toLowerCase().includes('pakistan');
                        const targetCurrency = isPkrHint ? 'PKR' : csvCurrency;
                        if (isPkrHint) {
                          setCsvCurrency('PKR');
                        }
                        setCsvUploadedFileName(file.name);
                        setCsvParsing(true);
                        setCsvPreviewPage(1);
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const content = String(ev.target?.result || '');
                          setCsvRawText(content);
                          setTimeout(() => {
                            handleParseCsv(content, undefined, targetCurrency);
                            setCsvParsing(false);
                            showToast(`Loaded ${file.name} (Currency: ${targetCurrency})`);
                          }, 16);
                        };
                        reader.readAsText(file, 'utf-8');
                      }}
                    />
                  </label>
                  <button
                    onClick={handleExportProductsCsv}
                    className="px-4 py-2 bg-[#F5F4F0] text-xs text-[#141413] flex items-center gap-2 hover:bg-[#EBEAE5] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Live Catalog CSV</span>
                  </button>
                </div>
              </div>

              {/* Currency Mode Selection */}
              <div className="p-3.5 bg-[#FBFBF9] border border-black/[0.08] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#141413] flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#C5A059]" />
                    Currency in CSV File:
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setCsvCurrency('PKR');
                        handleParseCsv(csvRawText, undefined, 'PKR');
                        showToast('CSV currency set to PKR (Pakistani Rupees). Converted at 1 USD = 278.5 PKR.');
                      }}
                      className={`px-3 py-1 font-semibold cursor-pointer border transition-all ${
                        csvCurrency === 'PKR'
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                          : 'bg-black/[0.04] border-black/[0.08] text-[#454441] hover:border-black/20'
                      }`}
                    >
                      🇵🇰 PKR (Pakistani Rupees — Rs.)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvCurrency('USD');
                        handleParseCsv(csvRawText, undefined, 'USD');
                        showToast('CSV currency set to USD ($).');
                      }}
                      className={`px-3 py-1 font-semibold cursor-pointer border transition-all ${
                        csvCurrency === 'USD'
                          ? 'bg-[#C5A059] border-[#C5A059] text-[#0B0F17] shadow-sm'
                          : 'bg-black/[0.04] border-black/[0.08] text-[#454441] hover:border-black/20'
                      }`}
                    >
                      🇺🇸 USD ($ US Dollars)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvCurrency('DIRECT');
                        handleParseCsv(csvRawText, undefined, 'DIRECT');
                        showToast('CSV currency set to Direct (exact numbers as-is, no conversion).');
                      }}
                      className={`px-3 py-1 font-semibold cursor-pointer border transition-all ${
                        csvCurrency === 'DIRECT'
                          ? 'bg-sky-600 border-sky-500 text-[#141413] shadow-sm'
                          : 'bg-black/[0.04] border-black/[0.08] text-[#454441] hover:border-black/20'
                      }`}
                    >
                      🔢 Direct (As-Is / No Conversion)
                    </button>
                  </div>
                </div>
                <div className="text-xs text-[#454441] font-mono">
                  {csvCurrency === 'PKR' ? (
                    <span className="text-emerald-400">
                      ✓ Active: Pakistani Rupees (e.g., Rs. 2,500 in CSV → $8.98 USD in catalog, customer sees PKR 2,500)
                    </span>
                  ) : csvCurrency === 'DIRECT' ? (
                    <span className="text-sky-400">
                      ✓ Active: Direct Values (e.g., 250 in CSV → 250 in catalog without conversion)
                    </span>
                  ) : (
                    <span className="text-amber-400">
                      ✓ Active: Direct USD (e.g., 45 in CSV → $45.00 USD in catalog)
                    </span>
                  )}
                </div>
              </div>

              {/* High Price Detection Banner */}
              {csvCurrency !== 'PKR' && parsedCsvRows.some((r) => r.price > 400) && (
                <div className="p-3 bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Notice:</strong> High price values detected in CSV (e.g. {Math.round(parsedCsvRows.reduce((m, r) => Math.max(m, r.price || 0), 0)).toLocaleString()}). If these prices are in <strong>Pakistani Rupees (Rs.)</strong>, switch to PKR mode for proper conversion.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvCurrency('PKR');
                      handleParseCsv(csvRawText, undefined, 'PKR');
                      showToast('Switched to PKR mode! Prices converted accurately.');
                    }}
                    className="px-3 py-1 bg-amber-500 text-black text-xs font-bold cursor-pointer hover:bg-amber-400 shrink-0"
                  >
                    ⚡ Switch to PKR Mode Now
                  </button>
                </div>
              )}

              {/* Supported Columns Guide Banner */}
              <div className="p-3.5 bg-[#FBFBF9] border border-black/[0.08] text-xs text-[#454441] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#141413]">Supported Columns:</span>
                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">
                    Name / Title *
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">
                    Price * ($ / PKR)
                  </span>
                  <span className="px-2 py-0.5 bg-black/[0.04] border border-black/[0.12] text-[#454441] font-mono text-[11px]">
                    SKU (Auto-created if omitted)
                  </span>
                  <span className="px-2 py-0.5 bg-black/[0.04] border border-black/[0.12] text-[#454441] font-mono text-[11px]">
                    Stock (Defaults to 15)
                  </span>
                  <span className="px-2 py-0.5 bg-black/[0.04] border border-black/[0.12] text-[#454441] font-mono text-[11px]">
                    Category
                  </span>
                  <span className="px-2 py-0.5 bg-black/[0.04] border border-black/[0.12] text-[#454441] font-mono text-[11px]">
                    Brand
                  </span>
                  <span className="px-2 py-0.5 bg-black/[0.04] border border-black/[0.12] text-[#454441] font-mono text-[11px]">
                    Description
                  </span>
                </div>
                {csvUploadedFileName && (
                  <div className="flex items-center gap-2 text-xs font-mono text-[#C5A059]">
                    <span>File: {csvUploadedFileName}</span>
                    <button
                      onClick={() => {
                        setCsvUploadedFileName(null);
                        setCsvRawText('');
                        setParsedCsvRows([]);
                      }}
                      className="text-[#575653] hover:text-[#141413]"
                      title="Clear file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white border border-black/[0.08] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[#141413]">
                      1. Raw CSV / TSV Payload
                    </h2>
                    <div className="flex items-center gap-2">
                      {csvRawText && (
                        <button
                          onClick={() => {
                            setCsvRawText('');
                            setParsedCsvRows([]);
                            setCsvUploadedFileName(null);
                          }}
                          className="text-[11px] text-[#575653] hover:text-[#141413] cursor-pointer px-1.5 py-0.5"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        onClick={() => handleParseCsv(csvRawText)}
                        className="px-3 py-1 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer hover:bg-[#d6b26b]"
                      >
                        Parse & Validate
                      </button>
                    </div>
                  </div>

                  {/* Delimiter Selector */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-black/[0.04]">
                    <span className="text-[#575653]">Delimiter Format:</span>
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      {(
                        [
                          { id: 'auto', label: 'Auto' },
                          { id: ',', label: 'Comma (,)' },
                          { id: ';', label: 'Semicolon (;)' },
                          { id: '\t', label: 'Tab' },
                          { id: '|', label: 'Pipe (|)' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedDelimiter(item.id);
                            handleParseCsv(
                              csvRawText,
                              item.id === 'auto' ? undefined : item.id
                            );
                          }}
                          className={`px-2 py-0.5 border cursor-pointer ${
                            selectedDelimiter === item.id
                              ? 'border-[#C5A059] text-[#C5A059] bg-[#C5A059]/10'
                              : 'border-black/[0.08] text-[#575653] hover:text-[#2A2A28]'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Drag and Drop Zone Container */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      const check = validateCsvFileUpload(file);
                      if (!check.valid) {
                        showToast(check.errors.join(' '));
                        return;
                      }
                      const isPkrHint =
                        file.name.toLowerCase().includes('woocommerce') ||
                        file.name.toLowerCase().includes('pkr') ||
                        file.name.toLowerCase().includes('pakistan');
                      const targetCurrency = isPkrHint ? 'PKR' : csvCurrency;
                      if (isPkrHint) {
                        setCsvCurrency('PKR');
                      }
                      setCsvUploadedFileName(file.name);
                      setCsvParsing(true);
                      setCsvPreviewPage(1);
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const content = String(ev.target?.result || '');
                        setCsvRawText(content);
                        setTimeout(() => {
                          handleParseCsv(content, undefined, targetCurrency);
                          setCsvParsing(false);
                          showToast(`Loaded ${file.name} (Currency: ${targetCurrency})`);
                        }, 16);
                      };
                      reader.readAsText(file, 'utf-8');
                    }}
                    className="relative"
                  >
                    <textarea
                      rows={14}
                      value={csvRawText}
                      onChange={(e) => setCsvRawText(e.target.value)}
                      placeholder="Paste CSV rows here or drag & drop a .csv file directly onto this box..."
                      className="w-full p-3 bg-[#FBFBF9] border-2 border-black/30 text-xs font-mono font-bold text-black placeholder:text-stone-600 focus:outline-none focus:border-black shadow-inner"
                    />
                    <div className="text-xs text-black font-bold text-right mt-1 font-mono">
                      {csvRawText.trim() ? `${csvRawText.split(/\r?\n/).length} lines staged` : 'Drag & drop file or paste text'}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-white border border-black/20 p-5 space-y-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-extrabold uppercase tracking-wider text-black">
                      2. Validation & Preview ({parsedCsvRows.length} rows staged)
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      {parsedCsvRows.length > 0 && (
                        <button
                          type="button"
                          onClick={handleAutoFixAllRows}
                          className="px-3 py-1.5 border border-amber-600 bg-amber-100 text-amber-950 text-xs font-bold cursor-pointer hover:bg-amber-200"
                          title="Auto-repair all SKUs, prices, and names so every row is valid"
                        >
                          Auto-Fix & Clean All Rows
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAIEnrichCsv()}
                        disabled={csvEnriching || parsedCsvRows.length === 0}
                        className="px-3 py-1.5 border-2 border-black bg-stone-100 text-black text-xs font-bold disabled:opacity-40 cursor-pointer hover:bg-stone-200"
                      >
                        {csvEnriching ? 'AI Enriching...' : 'AI Enrich Copy & SEO'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCommitCsvImport()}
                        disabled={csvImporting || parsedCsvRows.length === 0}
                        className="px-4 py-1.5 bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 cursor-pointer hover:bg-emerald-600 shadow-md"
                      >
                        {csvImporting
                          ? 'Importing...'
                          : `Import All ${parsedCsvRows.length} Pieces to Catalog`}
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Badges */}
                  {parsedCsvRows.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-center text-xs">
                      <div className="p-2.5 bg-[#F5F4EF] border-2 border-black/20">
                        <div className="text-black font-bold text-[11px]">TOTAL</div>
                        <div className="text-black font-extrabold text-base">{parsedCsvRows.length}</div>
                      </div>
                      <div className="p-2.5 bg-emerald-100 border-2 border-emerald-500">
                        <div className="text-emerald-950 font-bold text-[11px]">VALID</div>
                        <div className="text-emerald-950 font-extrabold text-base">
                          {parsedCsvRows.filter((r) => r.valid).length}
                        </div>
                      </div>
                      <div className="p-2.5 bg-amber-100 border-2 border-amber-500">
                        <div className="text-amber-950 font-bold text-[11px]">UPDATES</div>
                        <div className="text-amber-950 font-extrabold text-base">
                          {parsedCsvRows.filter((r) => r.duplicate && r.valid).length}
                        </div>
                      </div>
                      <div className="p-2.5 bg-rose-100 border-2 border-rose-500">
                        <div className="text-rose-950 font-bold text-[11px]">ERRORS</div>
                        <div className="text-rose-950 font-extrabold text-base">
                          {parsedCsvRows.filter((r) => !r.valid).length}
                        </div>
                      </div>
                    </div>
                  )}

                  {parsedCsvRows.length > 0 && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          <strong>Permanent Local Asset Archiving Active:</strong> External image URLs in this CSV will be automatically downloaded and stored permanently on your store server (<code className="font-mono text-[11px] bg-emerald-100 px-1 py-0.5">/uploads/</code>). Even if original image links are deleted elsewhere, your store images will never break!
                        </span>
                      </div>
                    </div>
                  )}

                  {csvImportSummary && (
                    <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 text-xs font-mono text-emerald-200">
                      Import Completed — Created: {csvImportSummary.imported} · Updated:{' '}
                      {csvImportSummary.updated} · Failed: {csvImportSummary.failed}
                    </div>
                  )}

                  {csvParsing ? (
                    <div className="py-16 text-center space-y-3">
                      <RefreshCw className="w-6 h-6 text-[#C5A059] animate-spin mx-auto" />
                      <p className="text-xs font-medium text-[#141413]">Parsing & validating catalog rows...</p>
                      <p className="text-[11px] text-[#575653]">Processing column mappings, prices, and SKUs smoothly without freezing.</p>
                    </div>
                  ) : parsedCsvRows.length === 0 ? (
                    <div className="py-14 text-center text-xs text-[#575653] space-y-2">
                      <p>No rows parsed yet.</p>
                      <p className="text-[#73726E] text-[11px]">
                        Click “Load Sample Data” above or upload your CSV to preview column mapping, auto-generated SKUs, and pricing validation.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[500px] border border-black/20">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 bg-[#F0EFEA] border-b-2 border-black/30 z-10">
                          <tr className="text-black font-mono font-bold text-[12px] uppercase">
                            <th className="py-2.5 px-3">Row</th>
                            <th className="py-2.5 px-3">SKU</th>
                            <th className="py-2.5 px-3">Product Name</th>
                            <th className="py-2.5 px-3 text-right">CSV Price</th>
                            <th className="py-2.5 px-3 text-right">Storefront Display</th>
                            <th className="py-2.5 px-3 text-right">Stock</th>
                            <th className="py-2.5 px-3">Category</th>
                            <th className="py-2.5 px-3">Validation Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/15">
                          {parsedCsvRows
                            .slice((csvPreviewPage - 1) * 50, csvPreviewPage * 50)
                            .map((r) => (
                            <tr
                              key={r.rowNumber}
                              className={!r.valid ? 'bg-rose-50' : 'hover:bg-[#F9F8F5]'}
                            >
                              <td className="py-2.5 px-3 font-mono font-bold text-black">#{r.rowNumber}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-black">
                                {r.sku}
                                {r.warnings && r.warnings.some((w) => w.startsWith('Auto-assigned')) && (
                                  <span className="block text-[10px] text-amber-800 font-sans font-semibold">
                                    auto-generated
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-black">
                                <div className="font-bold text-black text-sm line-clamp-1">{r.name}</div>
                                {r.shortDescription && (
                                  <div className="text-[11px] text-stone-900 font-medium line-clamp-1">
                                    {r.shortDescription}
                                  </div>
                                )}
                                {r.seoTitle && (
                                  <span className="block text-[11px] text-amber-900 font-semibold">
                                    SEO: {r.seoTitle}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                <div className="font-extrabold text-black">
                                  {r.originalCsvPrice !== undefined && r.originalCsvPrice > 0
                                    ? r.originalCsvPrice.toLocaleString()
                                    : r.price.toLocaleString()}
                                </div>
                                <div className="text-[11px] text-stone-900 font-semibold">
                                  {r.csvCurrency === 'PKR'
                                    ? 'in PKR (Rs.)'
                                    : r.csvCurrency === 'DIRECT'
                                    ? 'Direct'
                                    : 'in USD ($)'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                {r.csvCurrency === 'PKR' ? (
                                  <div>
                                    <div className="font-extrabold text-emerald-800">
                                      PKR {(r.originalCsvPrice ?? Math.round(r.price * USD_TO_PKR_RATE)).toLocaleString()}
                                    </div>
                                    <div className="text-[11px] text-stone-900 font-semibold">${r.price.toFixed(2)} USD catalog</div>
                                  </div>
                                ) : r.csvCurrency === 'DIRECT' ? (
                                  <div>
                                    <div className="font-extrabold text-sky-800">
                                      {r.price.toLocaleString()}
                                    </div>
                                    <div className="text-[11px] text-stone-900 font-semibold">Direct Value</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-extrabold text-black">${r.price.toLocaleString()} USD</div>
                                    <div className="text-[11px] text-stone-900 font-semibold">{formatPKR(r.price)}</div>
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-black">
                                {r.stock}
                                {r.warnings && r.warnings.some((w) => w.includes('defaulted')) && (
                                  <span className="block text-[10px] text-stone-800 font-sans font-medium">
                                    default
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-black">
                                {r.category}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                {!r.valid ? (
                                  <span className="text-rose-700 block font-sans text-xs font-bold">
                                    ✕ {r.errors.join(', ')}
                                  </span>
                                ) : r.duplicate ? (
                                  <span className="text-amber-800 font-bold">Update Existing SKU</span>
                                ) : (
                                  <span className="text-emerald-800 font-bold">Ready to Create</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {parsedCsvRows.length > 50 && (
                        <div className="p-3 border-t border-black/[0.08] flex items-center justify-between text-xs bg-[#FAF9F5]">
                          <span className="text-[#575653] font-mono">
                            Showing {(csvPreviewPage - 1) * 50 + 1}–{Math.min(parsedCsvRows.length, csvPreviewPage * 50)} of {parsedCsvRows.length} rows (Page {csvPreviewPage} of {Math.ceil(parsedCsvRows.length / 50)})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={csvPreviewPage <= 1}
                              onClick={() => setCsvPreviewPage((p) => Math.max(1, p - 1))}
                              className="px-2.5 py-1 border border-black/15 bg-white text-[#141413] disabled:opacity-40 cursor-pointer text-xs"
                            >
                              Previous 50
                            </button>
                            <button
                              type="button"
                              disabled={csvPreviewPage >= Math.ceil(parsedCsvRows.length / 50)}
                              onClick={() => setCsvPreviewPage((p) => Math.min(Math.ceil(parsedCsvRows.length / 50), p + 1))}
                              className="px-2.5 py-1 border border-black/15 bg-white text-[#141413] disabled:opacity-40 cursor-pointer text-xs"
                            >
                              Next 50
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 6: ORDERS MANAGEMENT ======================== */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display text-[#141413]">
                    Order Fulfillment, Tracking & Refunds ({orders.length})
                  </h1>
                  <p className="text-xs text-[#575653]">
                    Click any row to bind it to AI Copilot context. Update fulfillment status, verify incoming payments, or assign tracking numbers.
                  </p>
                </div>
                <button
                  onClick={handleExportOrdersCsv}
                  className="px-4 py-2 bg-[#F5F4F0] text-xs text-[#141413] flex items-center gap-2 hover:bg-[#EBEAE5] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Orders CSV</span>
                </button>
              </div>

              {/* Prominent Verification Alert Banner for Store Admin */}
              {pendingVerificationOrders.length > 0 && (
                <div className="p-4 bg-amber-950/70 border border-amber-500/70 rounded flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-amber-400 font-bold text-base">⚠️</span>
                    <div>
                      <strong className="text-amber-200 block text-sm">
                        {pendingVerificationOrders.length} Order(s) Awaiting Payment Verification (ادائیگی کی تصدیق درکار ہے)
                      </strong>
                      <span className="text-amber-300/80 text-[11px]">
                        Customer account se paise khud-bakhud deduct nahi hue. Barah-e-karam apna Easypaisa / JazzCash / Bank account check karke raqam tasdeeq karain, phir &apos;Confirm Received (Mark Paid)&apos; click karain.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setOrderPaymentFilter('PENDING_VERIFICATION')}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs rounded cursor-pointer shrink-0 shadow-xs"
                  >
                    View Unverified Orders ({pendingVerificationOrders.length})
                  </button>
                </div>
              )}

              {/* Filter Tabs for Orders */}
              <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.08] pb-3">
                <button
                  onClick={() => setOrderPaymentFilter('ALL')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                    orderPaymentFilter === 'ALL'
                      ? 'bg-white text-black font-semibold'
                      : 'bg-black/[0.04] text-[#454441] hover:bg-[#EBEAE5]'
                  }`}
                >
                  All Orders ({orders.length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('PENDING_VERIFICATION')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                    orderPaymentFilter === 'PENDING_VERIFICATION'
                      ? 'bg-amber-500 text-black font-bold'
                      : 'bg-amber-950/50 text-amber-300 hover:bg-amber-900/60 border border-amber-600/40'
                  }`}
                >
                  <span>⏳ Awaiting Verification ({pendingVerificationOrders.length})</span>
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('PAID')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                    orderPaymentFilter === 'PAID'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                  }`}
                >
                  ✓ Verified & Paid ({orders.filter((o) => o.paymentStatus === 'PAID').length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('COD')}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                    orderPaymentFilter === 'COD'
                      ? 'bg-sky-600 text-[#141413] font-bold'
                      : 'bg-sky-950/40 text-sky-300 hover:bg-sky-900/50'
                  }`}
                >
                  Cash on Delivery ({orders.filter((o) => o.paymentMethod === 'COD').length})
                </button>
              </div>

              <div className="bg-white border border-black/[0.08] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.08] text-[#575653] font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Client & Destination</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Fulfillment Status</th>
                      <th className="py-3 px-4">Courier Service & Tracking Update</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.08]">
                    {displayedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-[#575653] text-xs">
                          No orders matching the selected filter ({orderPaymentFilter}).
                        </td>
                      </tr>
                    ) : (
                      displayedOrders.map((ord) => (
                      <tr
                        key={ord.id}
                        onClick={() => setSelectedAdminOrder(ord)}
                        className={`hover:bg-[#FAF9F5] cursor-pointer ${
                          selectedAdminOrder?.id === ord.id ? 'bg-[#C5A059]/10' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-[#141413]">
                          <div>{ord.orderNumber}</div>
                          <div className="text-[10px] text-[#575653] font-normal">
                            {ord.createdAt.slice(0, 10)}
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="text-[#141413] font-medium">{ord.customerName}</div>
                          <div className="text-[11px] text-[#575653]">{ord.customerEmail}</div>
                          {ord.shippingAddressSummary && (
                            <div className="text-[10px] text-[#575653] mt-0.5 line-clamp-2">
                              {ord.shippingAddressSummary}
                            </div>
                          )}
                          {(ord.district || ord.tehsil) && (
                            <div className="text-[10px] text-emerald-400 mt-0.5">
                              {ord.district ? `District: ${ord.district}` : ''} {ord.tehsil ? `· Tehsil: ${ord.tehsil}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
                                ord.paymentStatus === 'PAID'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                  : ord.paymentStatus === 'PENDING_VERIFICATION'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                                  : 'bg-slate-800 text-[#454441]'
                              }`}
                            >
                              {ord.paymentStatus}
                            </span>
                            <span className="text-[#575653]">({ord.paymentMethod})</span>
                          </div>
                          {ord.paymentReference && (
                            <div className="text-[10px] text-[#C5A059] mt-1">
                              Ref: {ord.paymentReference}
                            </div>
                          )}
                          {ord.paymentProofDetails && (
                            <div className="text-[10px] text-[#575653]">
                              {ord.paymentProofDetails}
                            </div>
                          )}
                          {ord.paymentVerifiedBy && (
                            <div className="text-[9px] text-[#73726E] mt-0.5">
                              Verified by: {ord.paymentVerifiedBy}
                            </div>
                          )}
                          {ord.paymentStatus === 'PENDING_VERIFICATION' && (
                            <div className="mt-2 p-2 bg-amber-950/70 border border-amber-600/60 rounded space-y-1.5">
                              <div className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                                <span>⚠️ Verify Account Credit:</span>
                              </div>
                              <div className="text-[9px] text-amber-200/90 leading-tight">
                                Customer was NOT automatically charged. Check your Easypaisa/JazzCash/Bank account before confirming.
                              </div>
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    verifyManualPayment(ord.id, 'APPROVE');
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer rounded"
                                >
                                  ✓ Confirm Funds (Mark Paid)
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    verifyManualPayment(ord.id, 'REJECT');
                                  }}
                                  className="px-2 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-200 text-[10px] font-semibold cursor-pointer rounded"
                                >
                                  ✕ Not Received
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={ord.status}
                            onChange={(e) =>
                              updateOrderState(ord.id, e.target.value as OrderStatus, ord.trackingNumber)
                            }
                            className="bg-[#FBFBF9] border border-black/[0.12] px-2.5 py-1 text-xs font-mono text-[#141413]"
                          >
                            {[
                              'PENDING',
                              'CONFIRMED',
                              'PROCESSING',
                              'PACKED',
                              'SHIPPED',
                              'OUT_FOR_DELIVERY',
                              'DELIVERED',
                              'CANCELLED',
                              'REFUNDED',
                              'RETURNED',
                              'QUOTE_REQUESTED',
                              'QUOTE_READY',
                              'QUOTE_ACCEPTED',
                              'QUOTE_REJECTED',
                            ].map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const formData = new FormData(e.currentTarget);
                              const carrier = String(formData.get('carrier') || 'TCS');
                              const trackNum = String(formData.get('tracking') || '').trim();
                              const formattedTracking = trackNum
                                ? trackNum.includes(':') || trackNum.includes('-')
                                  ? trackNum
                                  : `${carrier}-${trackNum}`
                                : `${carrier}-${Math.floor(10000000 + Math.random() * 90000000)}`;
                              updateOrderState(ord.id, 'SHIPPED', formattedTracking);
                              showToast(`Updated tracking for ${ord.orderNumber}: ${formattedTracking}`);
                            }}
                            className="flex items-center gap-1.5"
                          >
                            <select
                              name="carrier"
                              defaultValue="TCS"
                              className="bg-[#FBFBF9] border border-black/[0.12] px-2 py-1 text-[11px] font-mono text-[#141413]"
                            >
                              <option value="TCS">TCS</option>
                              <option value="Leopards">Leopards</option>
                              <option value="M&P">M&amp;P</option>
                              <option value="PakistanPost">Pak Post</option>
                              <option value="DHL">DHL Express</option>
                              <option value="FedEx">FedEx International</option>
                            </select>
                            <input
                              type="text"
                              name="tracking"
                              defaultValue={ord.trackingNumber || ''}
                              placeholder="Tracking # (or auto)"
                              className="w-36 px-2 py-1 bg-[#FBFBF9] border border-black/[0.12] text-[11px] font-mono text-[#141413]"
                            />
                            <button
                              type="submit"
                              className="px-2.5 py-1 bg-[#C5A059] text-[#0B0F17] font-semibold text-[11px] cursor-pointer whitespace-nowrap"
                            >
                              Update Tracking
                            </button>
                          </form>
                          {ord.trackingNumber && (
                            <div className="text-[10px] font-mono text-emerald-400 mt-1">
                              Active Tracking: {ord.trackingNumber}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#141413]">
                          <div>${ord.total.toFixed(2)}</div>
                          <div className="text-[11px] text-[#C5A059]">{formatPKR(ord.total)}</div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingReceiptOrder(ord);
                            }}
                            className="px-2.5 py-1 bg-red-950 hover:bg-red-900 border border-red-700/60 text-red-200 text-[11px] font-medium cursor-pointer"
                            title="View customer Gmail receipt"
                          >
                            ✉️ Gmail Receipt
                          </button>
                          {ord.status === 'QUOTE_REQUESTED' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setQuotingOrder(ord);
                                setQuoteFreightAmount(8500);
                                setQuoteCourierChoice('DHL Express International');
                                setQuoteDeliveryTime('4–6 business days');
                                setQuoteCustomsRule('DAP');
                                setQuoteSpecialInstructions('Assessed based on actual volumetric weight.');
                              }}
                              className="px-2.5 py-1 bg-[#C5A059] text-[#0B0F17] font-semibold text-[11px] cursor-pointer"
                            >
                              Issue Quote
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateOrderState(ord.id, 'REFUNDED');
                            }}
                            className="px-2.5 py-1 border border-rose-500/40 text-rose-300 text-[11px] cursor-pointer"
                          >
                            Refund
                          </button>
                        </td>
                      </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Interactive Freight Quotation Modal */}
              {quotingOrder && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-black/15 p-6 max-w-lg w-full space-y-5 text-xs">
                    <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#141413]">
                          Issue International Freight Quote — {quotingOrder.orderNumber}
                        </h3>
                        <p className="text-[11px] text-[#575653]">
                          Destination: {quotingOrder.destCountryIso || 'International'}
                        </p>
                      </div>
                      <button
                        onClick={() => setQuotingOrder(null)}
                        className="text-[#575653] hover:text-[#141413] cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-[#575653] mb-1">Freight Fee (PKR)</label>
                        <input
                          type="number"
                          step="100"
                          min="0"
                          value={quoteFreightAmount}
                          onChange={(e) => setQuoteFreightAmount(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[#575653] mb-1">Carrier / Courier</label>
                          <select
                            value={quoteCourierChoice}
                            onChange={(e) => setQuoteCourierChoice(e.target.value)}
                            className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                          >
                            <option value="DHL Express International">DHL Express International</option>
                            <option value="FedEx International Priority">FedEx International Priority</option>
                            <option value="Pakistan Post EMS">Pakistan Post EMS</option>
                            <option value="Custom Courier Concierge">Custom Courier Concierge</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[#575653] mb-1">Customs Mode</label>
                          <select
                            value={quoteCustomsRule}
                            onChange={(e) => setQuoteCustomsRule(e.target.value as any)}
                            className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                          >
                            <option value="DAP">DAP (Delivered at Place - Buyer pays tariff)</option>
                            <option value="DDP">DDP (Delivered Duty Paid - Prepaid customs)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[#575653] mb-1">Estimated Delivery Transit</label>
                        <input
                          type="text"
                          value={quoteDeliveryTime}
                          onChange={(e) => setQuoteDeliveryTime(e.target.value)}
                          placeholder="e.g. 4–6 business days"
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                        />
                      </div>

                      <div>
                        <label className="block text-[#575653] mb-1">Administrative / Customs Guidance Notes</label>
                        <textarea
                          rows={2}
                          value={quoteSpecialInstructions}
                          onChange={(e) => setQuoteSpecialInstructions(e.target.value)}
                          placeholder="Assessed based on actual volumetric weight."
                          className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-black/[0.08]">
                      <button
                        type="button"
                        onClick={() => setQuotingOrder(null)}
                        className="px-4 py-2 border border-black/[0.12] text-[#454441] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!quoteFreightAmount || quoteFreightAmount <= 0) {
                            showToast('Please enter a valid shipping quote amount.');
                            return;
                          }
                          await updateShippingQuote(quotingOrder.id, {
                            quoteAmount: quoteFreightAmount,
                            quoteCourier: quoteCourierChoice,
                            quoteEstimatedDays: quoteDeliveryTime,
                            quoteCustomsMode: quoteCustomsRule,
                            quoteAdminNotes: quoteSpecialInstructions,
                          });
                          setQuotingOrder(null);
                        }}
                        className="px-5 py-2 bg-[#C5A059] text-[#0B0F17] font-semibold cursor-pointer"
                      >
                        Dispatch Binding Freight Quote
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Transactional Gmail Receipt Inspector Modal for Admin */}
              {viewingReceiptOrder && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-black/15 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl text-xs rounded-lg overflow-hidden">
                    <div className="bg-[#F5F4F0] border-b border-black/[0.08] px-5 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 bg-red-600 text-white rounded flex items-center justify-center font-bold text-xs">
                          M
                        </div>
                        <div>
                          <h3 className="font-semibold text-[#141413]">
                            Gmail Receipt Inspector — {viewingReceiptOrder.orderNumber}
                          </h3>
                          <p className="text-[10px] text-[#575653]">
                            Sent to: {viewingReceiptOrder.customerEmail}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingReceiptOrder(null)}
                        className="text-[#575653] hover:text-[#141413] cursor-pointer px-2 py-1"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-4 bg-[#FBFBF9]">
                      {viewingReceiptOrder.paymentStatus === 'PAID' ? (
                        <div className="p-4 bg-emerald-950/60 border border-emerald-500/40 space-y-1 rounded">
                          <div className="flex items-center justify-between">
                            <strong className="text-emerald-300 font-semibold">
                              ✓ Payment Verified &amp; Received!
                            </strong>
                            <span className="text-[10px] font-mono bg-emerald-700 text-white px-2 py-0.5 rounded">
                              STATUS: PAID
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-200">
                            This transactional receipt was generated and delivered to the customer upon payment completion.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-amber-950/70 border border-amber-500/60 space-y-2 rounded">
                          <div className="flex items-center justify-between">
                            <strong className="text-amber-200 font-semibold flex items-center gap-1.5">
                              <span>⏳ Payment Awaiting Verification</span>
                            </strong>
                            <span className="text-[10px] font-mono bg-amber-700 text-white px-2 py-0.5 rounded">
                              STATUS: {viewingReceiptOrder.paymentStatus}
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-300/90 leading-relaxed">
                            Customer was NOT automatically charged. Check your official bank/wallet account for TID: <strong>{viewingReceiptOrder.paymentReference || 'N/A'}</strong>. Once confirmed, you can approve the payment below.
                          </p>
                          {viewingReceiptOrder.paymentStatus === 'PENDING_VERIFICATION' && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  verifyManualPayment(viewingReceiptOrder.id, 'APPROVE');
                                  setViewingReceiptOrder((prev) => prev ? { ...prev, paymentStatus: 'PAID', status: 'CONFIRMED' } : null);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded cursor-pointer"
                              >
                                ✓ Confirm Received in Account (Mark Paid)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  verifyManualPayment(viewingReceiptOrder.id, 'REJECT');
                                  setViewingReceiptOrder((prev) => prev ? { ...prev, paymentStatus: 'FAILED', status: 'CANCELLED' } : null);
                                }}
                                className="px-3 py-1.5 bg-rose-900 hover:bg-rose-800 text-rose-200 text-xs font-semibold rounded cursor-pointer"
                              >
                                ✕ Payment Not Received
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="p-4 bg-black/[0.04] border border-black/[0.08] space-y-2 font-mono text-[#454441]">
                        <div className="flex justify-between border-b border-black/[0.08] pb-1.5">
                          <span className="text-[#73726E]">Subject:</span>
                          <span className="text-[#141413] font-medium">
                            Payment Recieved: Order #{viewingReceiptOrder.orderNumber} | {settings.storeName || 'Atelier Aurelia'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-black/[0.08] pb-1.5">
                          <span className="text-[#73726E]">Store Name:</span>
                          <span className="text-[#141413] font-bold">{settings.storeName || 'Atelier Aurelia'}</span>
                        </div>
                        <div className="flex justify-between border-b border-black/[0.08] pb-1.5">
                          <span className="text-[#73726E]">Order ID:</span>
                          <span className="text-[#141413]">{viewingReceiptOrder.orderNumber}</span>
                        </div>
                        <div className="flex justify-between border-b border-black/[0.08] pb-1.5">
                          <span className="text-[#73726E]">Customer:</span>
                          <span className="text-[#141413]">{viewingReceiptOrder.customerName} ({viewingReceiptOrder.customerEmail})</span>
                        </div>
                        <div className="flex justify-between border-b border-black/[0.08] pb-1.5">
                          <span className="text-[#73726E]">Payment Protocol:</span>
                          <span className="text-[#C5A059]">{viewingReceiptOrder.paymentMethod}</span>
                        </div>
                        {viewingReceiptOrder.paymentReference && (
                          <div className="flex justify-between border-b border-black/[0.08] pb-1.5">
                            <span className="text-[#73726E]">Transaction ID (TID):</span>
                            <span className="text-[#C5A059] font-bold">{viewingReceiptOrder.paymentReference}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-b border-black/[0.08] pb-1.5">
                          <span className="text-[#73726E]">Total Amount:</span>
                          <span className="text-emerald-400 font-bold">
                            PKR {formatPKR(viewingReceiptOrder.total)} (${viewingReceiptOrder.total.toFixed(2)})
                          </span>
                        </div>
                        {viewingReceiptOrder.district && (
                          <div className="flex justify-between border-b border-black/[0.08] pb-1.5">
                            <span className="text-[#73726E]">District:</span>
                            <span className="text-[#141413] font-medium">{viewingReceiptOrder.district}</span>
                          </div>
                        )}
                        {viewingReceiptOrder.tehsil && (
                          <div className="flex justify-between border-b border-black/[0.08] pb-1.5">
                            <span className="text-[#73726E]">Tehsil:</span>
                            <span className="text-[#141413] font-medium">{viewingReceiptOrder.tehsil}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-[#73726E]">Destination:</span>
                          <span className="text-[#141413] text-right truncate max-w-xs">
                            {viewingReceiptOrder.shippingAddressSummary || 'Direct Pickup'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#F5F4F0] border-t border-black/[0.08] px-5 py-3 flex items-center justify-between">
                      <span className="text-[11px] text-[#575653] font-mono">
                        ✓ Dispatched via Store Treasury Gateway
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewingReceiptOrder(null)}
                        className="px-4 py-1.5 bg-white text-black font-semibold text-xs cursor-pointer hover:bg-slate-200"
                      >
                        Close Inspector
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 7: COUPONS & DISCOUNTS ======================== */}
          {activeTab === 'COUPONS' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const v = validateCouponPayload({
                    code: newCouponCode,
                    type: newCouponType,
                    value: newCouponValue,
                    minCartAmount: newCouponMinAmount,
                  });
                  if (!v.valid) {
                    showToast(v.errors[0]);
                    return;
                  }
                  await saveCoupon({
                    code: newCouponCode,
                    type: newCouponType,
                    value: newCouponValue,
                    minCartAmount: newCouponMinAmount,
                  });
                  setNewCouponCode('');
                  showToast('Promotional coupon created.');
                }}
                className="lg:col-span-4 bg-white border border-black/[0.08] p-6 space-y-4 h-fit"
              >
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                  Create Promotional Code
                </h2>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[#575653] mb-1">Coupon Code</label>
                    <input
                      type="text"
                      required
                      value={newCouponCode}
                      onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                      placeholder="SUMMER20"
                      className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[#575653] mb-1">Discount Type</label>
                    <select
                      value={newCouponType}
                      onChange={(e) => setNewCouponType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413]"
                    >
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIXED">Fixed Amount ($)</option>
                      <option value="FREE_SHIPPING">Complimentary Shipping</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[#575653] mb-1">Discount Value</label>
                    <input
                      type="number"
                      value={newCouponValue}
                      onChange={(e) => setNewCouponValue(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#575653] mb-1">Minimum Cart Subtotal ($)</label>
                    <input
                      type="number"
                      value={newCouponMinAmount}
                      onChange={(e) => setNewCouponMinAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-[#141413] font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#C5A059] text-[#0B0F17] font-semibold cursor-pointer"
                  >
                    Save Coupon
                  </button>
                </div>
              </form>

              <div className="lg:col-span-8 bg-white border border-black/[0.08] p-6 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                  Active Promotional Codes ({coupons.length})
                </h2>
                <div className="divide-y divide-black/[0.08]">
                  {coupons.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-semibold text-[#C5A059] text-sm">
                          {c.code}
                        </span>
                        <span className="text-[#575653] ml-3">
                          {c.type === 'PERCENTAGE'
                            ? `${c.value}% OFF`
                            : c.type === 'FIXED'
                            ? `${formatDualPrice(c.value)} OFF`
                            : 'FREE SHIPPING'}{' '}
                          (Min Order: {formatDualPrice(c.minCartAmount || 0)})
                        </span>
                      </div>
                      <button
                        onClick={() => deleteCouponById(c.id)}
                        className="text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 8: REVIEWS MODERATION ======================== */}
          {activeTab === 'REVIEWS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-[#141413]">
                Client Reviews & Moderation ({reviews.length})
              </h1>
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    className="p-5 bg-white border border-black/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-mono text-[#C5A059]">
                        ★ {r.rating}.0 / 5.0 · {r.productName || r.productId} · Status: {r.status}
                      </div>
                      <div className="font-semibold text-[#141413]">{r.title}</div>
                      <p className="text-[#454441]">{r.comment}</p>
                      <div className="text-[#73726E]">— {r.authorName}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => moderateReview(r.id, 'APPROVED')}
                        className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => moderateReview(r.id, 'REJECTED')}
                        className="px-3 py-1.5 bg-rose-600/20 border border-rose-500/40 text-rose-300 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ======================== TAB 9: AI BACKGROUND TASKS ======================== */}
          {activeTab === 'AI_TASKS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-[#141413]">
                Long-Running AI Tasks & Batch Queue ({aiTasks.length})
              </h1>
              {aiTasks.length === 0 ? (
                <div className="p-8 bg-white border border-black/[0.08] text-xs text-[#575653]">
                  No background AI tasks have been triggered yet. Run a bulk SEO generation, bulk price change, or CSV import to monitor progress here.
                </div>
              ) : (
                <div className="space-y-3">
                  {aiTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-5 bg-white border border-black/[0.08] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-[#141413]">{task.name}</span>
                          <span className="ml-2 font-mono text-[11px] text-[#575653]">
                            (ID: {task.id} · Actor: {task.actorUid})
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[#C5A059]">{task.status}</span>
                          {(task.status === 'QUEUED' || task.status === 'RUNNING') && (
                            <button
                              onClick={() => cancelAITask(task.id)}
                              className="px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[11px] cursor-pointer"
                            >
                              Cancel Task
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-[#575653] font-mono">
                        Tool: {task.toolName} · Progress: {task.completedItems} / {task.totalItems}{' '}
                        items · Failed: {task.failedItems} · Started: {task.createdAt.slice(0, 19).replace('T', ' ')}
                      </div>
                      {task.summary && <div className="text-[#454441]">{task.summary}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 10: AUDIT LOGS ======================== */}
          {activeTab === 'AUDIT_LOGS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-[#141413]">
                Immutable Security & AI Execution Audit Trail ({auditLogs.length})
              </h1>
              <div className="bg-white border border-black/[0.08] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.08] text-[#575653] font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Resource</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.08] font-mono">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2.5 px-4 text-[#575653]">
                          {log.createdAt.slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="py-2.5 px-4 text-[#141413]">{log.actorName || log.actorUid}</td>
                        <td className="py-2.5 px-4 text-[#C5A059]">{log.action}</td>
                        <td className="py-2.5 px-4 text-[#454441]">{log.resource}</td>
                        <td className="py-2.5 px-4 text-[#575653]">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================== TAB 11: INBOX & AI AUTO-REPLY ======================== */}
          {activeTab === 'NOTIFICATIONS' && (
            <div className="space-y-6">
              {/* Inbox Header & AI Engine Status */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/10 pb-5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-2xl font-display text-[#141413]">Client Communications Inbox</h1>
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      AI Auto-Reply Active 24/7
                    </span>
                  </div>
                  <p className="text-xs text-[#575653] mt-1">
                    Live customer inquiries, instant AI Autonomous Auto-Replies (Urdu / Roman Urdu / English), and store operational alerts.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSimulatedResult(null);
                      setShowSimulateModal(true);
                    }}
                    className="px-3 py-1.5 bg-[#C5A059] text-black text-xs font-bold flex items-center gap-1.5 hover:bg-[#B38F48] transition-colors cursor-pointer shadow-sm rounded-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-black" />
                    <span>Test Customer Message &amp; AI Reply</span>
                  </button>
                  <button
                    onClick={fetchInboxTickets}
                    disabled={inboxLoading}
                    className="px-3 py-1.5 bg-white border border-black/20 text-[#141413] text-xs font-medium flex items-center gap-1.5 hover:bg-black/5 transition-colors cursor-pointer rounded-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${inboxLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Sub-Tabs: Customer Messages vs Store Alerts */}
              <div className="flex items-center gap-2 border-b border-black/10">
                <button
                  onClick={() => setInboxTab('MESSAGES')}
                  className={`pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                    inboxTab === 'MESSAGES'
                      ? 'border-[#C5A059] text-black font-extrabold'
                      : 'border-transparent text-[#575653] hover:text-black'
                  }`}
                >
                  <Inbox className="w-4 h-4 text-[#C5A059]" />
                  <span>Customer Inquiries &amp; Messages</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 text-[#141413]">
                    {inboxTickets.length}
                  </span>
                  {unreadTicketsCount > 0 && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[#C5A059] text-black">
                      {unreadTicketsCount} Open
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setInboxTab('ALERTS')}
                  className={`pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                    inboxTab === 'ALERTS'
                      ? 'border-[#C5A059] text-black font-extrabold'
                      : 'border-transparent text-[#575653] hover:text-black'
                  }`}
                >
                  <Bell className="w-4 h-4 text-[#575653]" />
                  <span>Operational &amp; Store Alerts</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-black/10 text-[#141413]">
                    {notifications.length}
                  </span>
                  {unreadAlertsCount > 0 && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white">
                      {unreadAlertsCount} Unread
                    </span>
                  )}
                </button>
              </div>

              {/* VIEW 1: CUSTOMER INQUIRIES & AI AUTO-REPLIES */}
              {inboxTab === 'MESSAGES' && (
                <div className="space-y-5">
                  {/* KPI Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-white border border-black/10 rounded-sm">
                      <div className="text-[11px] text-[#575653] uppercase tracking-wider font-semibold">Total Inquiries</div>
                      <div className="text-xl font-display font-bold text-[#141413] mt-1">{inboxTickets.length}</div>
                    </div>
                    <div className="p-3.5 bg-white border border-black/10 rounded-sm">
                      <div className="text-[11px] text-[#575653] uppercase tracking-wider font-semibold">Instant AI Auto-Replied</div>
                      <div className="text-xl font-display font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#C5A059]" />
                        <span>{inboxTickets.filter((t) => t.aiAutoReply).length}</span>
                        <span className="text-xs font-normal text-emerald-600 font-mono">(100%)</span>
                      </div>
                    </div>
                    <div className="p-3.5 bg-white border border-black/10 rounded-sm">
                      <div className="text-[11px] text-[#575653] uppercase tracking-wider font-semibold">Open Tickets</div>
                      <div className="text-xl font-display font-bold text-amber-600 mt-1">{unreadTicketsCount}</div>
                    </div>
                    <div className="p-3.5 bg-white border border-black/10 rounded-sm">
                      <div className="text-[11px] text-[#575653] uppercase tracking-wider font-semibold">Resolved Inquiries</div>
                      <div className="text-xl font-display font-bold text-[#141413] mt-1">
                        {inboxTickets.filter((t) => t.status === 'RESOLVED').length}
                      </div>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-black/10 rounded-sm">
                    <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                      {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setTicketStatusFilter(st)}
                          className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                            ticketStatusFilter === st
                              ? 'bg-black text-[#FBFBF9]'
                              : 'bg-black/5 text-[#575653] hover:text-black'
                          }`}
                        >
                          {st === 'ALL'
                            ? `All (${inboxTickets.length})`
                            : st === 'OPEN'
                            ? `Open (${unreadTicketsCount})`
                            : st === 'IN_PROGRESS'
                            ? `In Progress (${inboxTickets.filter((t) => t.status === 'IN_PROGRESS').length})`
                            : `Resolved (${inboxTickets.filter((t) => t.status === 'RESOLVED').length})`}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        value={ticketSearchQuery}
                        onChange={(e) => setTicketSearchQuery(e.target.value)}
                        placeholder="Search customer, email, ticket..."
                        className="w-full sm:w-64 bg-[#FBFBF9] border border-black/15 px-3 py-1.5 text-xs rounded focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>

                  {/* Customer Tickets List */}
                  {inboxLoading && inboxTickets.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#575653] bg-white border border-black/10">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#C5A059] mb-2" />
                      Loading communications inbox...
                    </div>
                  ) : inboxTickets.length === 0 ? (
                    <div className="p-10 text-center bg-white border border-black/10 space-y-3">
                      <Inbox className="w-8 h-8 text-[#C5A059] mx-auto opacity-60" />
                      <div className="text-sm font-semibold text-[#141413]">No customer messages received yet</div>
                      <p className="text-xs text-[#575653] max-w-md mx-auto">
                        Customer inquiries submitted via the Storefront Helpline, Live AI Chat, or contact form will appear here with instant AI auto-replies.
                      </p>
                      <button
                        onClick={() => setShowSimulateModal(true)}
                        className="px-3.5 py-1.5 bg-[#C5A059] text-black text-xs font-bold hover:bg-[#B38F48] transition-colors rounded-sm cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Simulate First Customer Message</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {inboxTickets
                        .filter((t) => {
                          if (ticketStatusFilter !== 'ALL' && t.status !== ticketStatusFilter) return false;
                          if (ticketSearchQuery.trim()) {
                            const q = ticketSearchQuery.toLowerCase();
                            return (
                              t.name.toLowerCase().includes(q) ||
                              t.email.toLowerCase().includes(q) ||
                              t.ticketNumber.toLowerCase().includes(q) ||
                              (t.phone && t.phone.toLowerCase().includes(q)) ||
                              (t.orderNumber && t.orderNumber.toLowerCase().includes(q)) ||
                              t.message.toLowerCase().includes(q) ||
                              (t.aiAutoReply && t.aiAutoReply.toLowerCase().includes(q))
                            );
                          }
                          return true;
                        })
                        .map((ticket) => {
                          const isOpen = ticket.status === 'OPEN';
                          const isResolved = ticket.status === 'RESOLVED';
                          const isReplyActive = activeReplyTicketId === ticket.id;

                          return (
                            <div
                              key={ticket.id}
                              className={`bg-white border rounded-sm transition-all shadow-sm ${
                                isOpen ? 'border-amber-400/80 ring-1 ring-amber-400/20' : 'border-black/15'
                              }`}
                            >
                              {/* Card Header */}
                              <div className="p-4 border-b border-black/5 bg-[#FAFAF8] flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-xs bg-black text-[#FBFBF9] px-2 py-0.5 rounded">
                                    {ticket.ticketNumber}
                                  </span>
                                  <span className="font-mono text-[11px] bg-black/5 text-[#575653] px-2 py-0.5 rounded">
                                    {ticket.category}
                                  </span>
                                  <span className="text-[11px] bg-[#C5A059]/20 text-[#8F7029] font-medium px-2 py-0.5 rounded flex items-center gap-1">
                                    <MessageCircle className="w-3 h-3" />
                                    {ticket.channel === 'AI_CHAT'
                                      ? 'Live AI Chat'
                                      : ticket.channel === 'WHATSAPP'
                                      ? 'WhatsApp'
                                      : 'Helpline Form'}
                                  </span>
                                  <span className="text-[11px] text-[#575653] flex items-center gap-1 font-mono">
                                    <Clock className="w-3 h-3" />
                                    {new Date(ticket.createdAt).toLocaleString([], {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <select
                                    value={ticket.status}
                                    onChange={(e) =>
                                      handleUpdateTicketStatus(
                                        ticket.id,
                                        e.target.value as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
                                      )
                                    }
                                    className={`px-2 py-1 text-[11px] font-bold rounded border cursor-pointer ${
                                      isOpen
                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                        : isResolved
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : 'bg-blue-100 text-blue-800 border-blue-300'
                                    }`}
                                  >
                                    <option value="OPEN">Status: OPEN</option>
                                    <option value="IN_PROGRESS">Status: IN PROGRESS</option>
                                    <option value="RESOLVED">Status: RESOLVED</option>
                                  </select>
                                </div>
                              </div>

                              {/* Customer Contact Info Bar */}
                              <div className="px-4 py-2.5 bg-white border-b border-black/5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#575653]">
                                <div className="flex items-center gap-1.5 text-[#141413] font-semibold">
                                  <User className="w-3.5 h-3.5 text-[#C5A059]" />
                                  <span>{ticket.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Mail className="w-3.5 h-3.5 text-[#575653]" />
                                  <a href={`mailto:${ticket.email}`} className="hover:underline text-black">
                                    {ticket.email}
                                  </a>
                                </div>
                                {ticket.phone && (
                                  <div className="flex items-center gap-1.5">
                                    <Phone className="w-3.5 h-3.5 text-[#575653]" />
                                    <a href={`tel:${ticket.phone}`} className="hover:underline text-black">
                                      {ticket.phone}
                                    </a>
                                    <a
                                      href={`https://wa.me/${ticket.phone.replace(/[^0-9]/g, '')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded hover:bg-emerald-100 border border-emerald-300 ml-1"
                                    >
                                      Chat WhatsApp
                                    </a>
                                  </div>
                                )}
                                {ticket.orderNumber && (
                                  <div className="flex items-center gap-1.5 font-mono text-[11px] bg-[#EFEFEA] px-2 py-0.5 rounded text-black font-bold">
                                    <Package className="w-3 h-3 text-[#C5A059]" />
                                    <span>Order: {ticket.orderNumber}</span>
                                  </div>
                                )}
                              </div>

                              {/* Message Content & AI Auto-Reply */}
                              <div className="p-4 space-y-4">
                                {/* Customer Original Query */}
                                <div className="space-y-1.5">
                                  <div className="text-[11px] uppercase tracking-wider font-bold text-[#575653]">
                                    Customer Message / Query:
                                  </div>
                                  <div className="p-3 bg-[#FBFBF9] border border-black/10 rounded-sm text-xs text-[#141413] leading-relaxed font-sans">
                                    {ticket.subject && (
                                      <div className="font-bold text-[#141413] mb-1">{ticket.subject}</div>
                                    )}
                                    <div className="whitespace-pre-line">{ticket.message}</div>
                                  </div>
                                </div>

                                {/* Instant AI Autonomous Auto-Reply */}
                                {ticket.aiAutoReply && (
                                  <div className="p-3.5 bg-[#FAF8F5] border border-[#C5A059]/40 rounded-sm space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                      <div className="flex items-center gap-1.5 font-bold text-[#8F7029]">
                                        <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                                        <span>Instant AI Autonomous Auto-Reply (Dispatched)</span>
                                      </div>
                                      <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-bold border border-emerald-300 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Sent in &lt; 2.0s
                                      </span>
                                    </div>
                                    <div className="text-xs text-[#2A2927] whitespace-pre-line leading-relaxed pl-1 border-l-2 border-[#C5A059]/60">
                                      {ticket.aiAutoReply}
                                    </div>
                                    {ticket.aiAutoRepliedAt && (
                                      <div className="text-[10px] text-[#575653] font-mono">
                                        Dispatched at:{' '}
                                        {new Date(ticket.aiAutoRepliedAt).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          second: '2-digit',
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Merchant Reply (if any) */}
                                {ticket.merchantReply && (
                                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-sm space-y-1 text-xs">
                                    <div className="font-bold text-blue-900 flex items-center gap-1.5">
                                      <User className="w-3.5 h-3.5" />
                                      <span>Merchant Direct Follow-up Note:</span>
                                    </div>
                                    <p className="text-blue-950 whitespace-pre-line">{ticket.merchantReply}</p>
                                    {ticket.merchantRepliedAt && (
                                      <div className="text-[10px] text-blue-700 font-mono">
                                        Replied: {new Date(ticket.merchantRepliedAt).toLocaleString()}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Action Buttons: Follow-up / Status change */}
                                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-black/5">
                                  <div className="flex items-center gap-2">
                                    {!isReplyActive ? (
                                      <button
                                        onClick={() => {
                                          setActiveReplyTicketId(ticket.id);
                                          setMerchantReplyText('');
                                        }}
                                        className="px-2.5 py-1 bg-black text-[#FBFBF9] text-xs font-medium rounded hover:bg-black/80 transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <Send className="w-3 h-3" />
                                        <span>Send Merchant Follow-up</span>
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => setActiveReplyTicketId(null)}
                                        className="px-2.5 py-1 bg-black/5 text-[#141413] text-xs rounded hover:bg-black/10 transition-colors cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    )}

                                    {isOpen && (
                                      <button
                                        onClick={() => handleUpdateTicketStatus(ticket.id, 'RESOLVED')}
                                        className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold rounded hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>Mark Resolved</span>
                                      </button>
                                    )}
                                  </div>

                                  <div className="text-[11px] text-[#575653]">
                                    Channel: <strong>{ticket.channel}</strong> &bull; Ticket ID:{' '}
                                    <span className="font-mono">{ticket.id}</span>
                                  </div>
                                </div>

                                {/* Inline Merchant Reply Box */}
                                {isReplyActive && (
                                  <div className="p-3 bg-[#FBFBF9] border border-black/15 rounded-sm space-y-2 mt-2">
                                    <label className="block text-xs font-bold text-[#141413]">
                                      Write Direct Merchant Follow-up to {ticket.name}:
                                    </label>
                                    <textarea
                                      rows={3}
                                      value={merchantReplyText}
                                      onChange={(e) => setMerchantReplyText(e.target.value)}
                                      placeholder={`Dear ${ticket.name}, thank you for contacting us...`}
                                      className="w-full bg-white border border-black/15 p-2 text-xs rounded focus:outline-none focus:border-black"
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => setActiveReplyTicketId(null)}
                                        className="px-3 py-1 bg-black/5 text-xs rounded cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleSendMerchantReply(ticket.id)}
                                        disabled={isSendingMerchantReply || !merchantReplyText.trim()}
                                        className="px-3.5 py-1 bg-black text-[#FBFBF9] text-xs font-bold rounded cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                      >
                                        <Send className="w-3 h-3" />
                                        <span>{isSendingMerchantReply ? 'Sending...' : 'Send & Mark Resolved'}</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: OPERATIONAL & STORE NOTIFICATIONS */}
              {inboxTab === 'ALERTS' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[#141413]">
                      Store Alerts &amp; Operational Events ({notifications.length})
                    </h2>
                    {unreadAlertsCount > 0 && (
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {unreadAlertsCount} unread system notifications
                      </span>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#575653] bg-white border border-black/10">
                      No operational alerts at this time. All store systems operating normally.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-4 border flex items-center justify-between text-xs rounded-sm transition-colors ${
                            n.read
                              ? 'bg-black/[0.02] border-black/[0.08] text-[#575653]'
                              : 'bg-white border-[#C5A059]/60 text-[#141413] shadow-xs'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-[#C5A059] font-bold">[{n.type}]</span>
                              <strong className="text-[#141413]">{n.title}</strong>
                            </div>
                            <p className="text-xs text-[#454441]">{n.message}</p>
                          </div>
                          {!n.read && (
                            <button
                              onClick={() => markNotificationRead(n.id)}
                              className="px-2.5 py-1 bg-[#F5F4F0] text-[11px] font-semibold text-black hover:bg-black/10 transition-colors cursor-pointer rounded"
                            >
                              Mark Read
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SIMULATE INCOMING CUSTOMER MESSAGE MODAL */}
              {showSimulateModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                  <div className="bg-white border border-black/20 w-full max-w-lg rounded-md shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-black/10 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#C5A059]" />
                        <h2 className="text-base font-display font-bold text-[#141413]">
                          Test Live Customer Message &amp; AI Auto-Reply
                        </h2>
                      </div>
                      <button
                        onClick={() => setShowSimulateModal(false)}
                        className="p-1 text-[#575653] hover:text-[#141413] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-[#575653]">
                      Simulate a customer sending a message in Roman Urdu, Urdu, or English. As soon as received, Gemini AI will autonomously generate a luxury personalized reply in real time and deliver it to this Inbox!
                    </p>

                    {/* Quick Fill Templates */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-[#141413]">Quick-fill realistic samples:</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setSimForm({
                              name: 'Babar Azam',
                              email: 'babar.a@example.pk',
                              phone: '+92 321 9988776',
                              orderNumber: 'AA-ORD-9021',
                              category: 'ORDER_TRACKING',
                              subject: 'Delivery time in Lahore DHA & TCS tracking',
                              message:
                                'Assalam o Alaikum, mera order AA-ORD-9021 Lahore DHA Phase 5 kab tak pohnchay ga? TCS tracking details SMS kab aayengi?',
                            })
                          }
                          className="px-2 py-1 text-[11px] bg-black/5 hover:bg-black/10 rounded cursor-pointer text-[#141413]"
                        >
                          📦 Lahore Delivery (Roman Urdu)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSimForm({
                              name: 'Sara Khan',
                              email: 'sara.k@example.com',
                              phone: '+92 300 4433221',
                              orderNumber: '',
                              category: 'PAYMENT_COD',
                              subject: 'Cash on Delivery rules in Karachi',
                              message:
                                'Do you offer Cash on Delivery for luxury handbags in Karachi? What is the maximum order limit?',
                            })
                          }
                          className="px-2 py-1 text-[11px] bg-black/5 hover:bg-black/10 rounded cursor-pointer text-[#141413]"
                        >
                          💳 COD Rules (English)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSimForm({
                              name: 'Zeeshan Ali',
                              email: 'zeeshan@example.pk',
                              phone: '+92 333 7788990',
                              orderNumber: 'AA-ORD-9044',
                              category: 'BESPOKE_REQUEST',
                              subject: 'Watch dial custom engraving request',
                              message:
                                'Kia Swiss Chronographe watch ke back case par initials Z.A gold foil mein likh saktay hain?',
                            })
                          }
                          className="px-2 py-1 text-[11px] bg-black/5 hover:bg-black/10 rounded cursor-pointer text-[#141413]"
                        >
                          ✨ Bespoke Engraving (Roman Urdu)
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleSimulateIncomingMessage} className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-[#141413] mb-1">Customer Name</label>
                          <input
                            type="text"
                            required
                            value={simForm.name}
                            onChange={(e) => setSimForm({ ...simForm, name: e.target.value })}
                            className="w-full bg-[#FBFBF9] border border-black/15 px-2.5 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#141413] mb-1">Customer Email</label>
                          <input
                            type="email"
                            required
                            value={simForm.email}
                            onChange={(e) => setSimForm({ ...simForm, email: e.target.value })}
                            className="w-full bg-[#FBFBF9] border border-black/15 px-2.5 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-[#141413] mb-1">Phone / WhatsApp</label>
                          <input
                            type="tel"
                            value={simForm.phone}
                            onChange={(e) => setSimForm({ ...simForm, phone: e.target.value })}
                            className="w-full bg-[#FBFBF9] border border-black/15 px-2.5 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#141413] mb-1">Order # (Optional)</label>
                          <input
                            type="text"
                            value={simForm.orderNumber}
                            onChange={(e) => setSimForm({ ...simForm, orderNumber: e.target.value })}
                            className="w-full bg-[#FBFBF9] border border-black/15 px-2.5 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#141413] mb-1">Customer Message</label>
                        <textarea
                          rows={3}
                          required
                          value={simForm.message}
                          onChange={(e) => setSimForm({ ...simForm, message: e.target.value })}
                          className="w-full bg-[#FBFBF9] border border-black/15 p-2 rounded focus:outline-none focus:border-black"
                        />
                      </div>

                      {/* Display live result inside modal if completed */}
                      {simulatedResult && (
                        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded space-y-2">
                          <div className="flex items-center gap-2 text-emerald-900 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>AI Auto-Reply Successfully Generated!</span>
                          </div>
                          <div className="text-[11px] text-emerald-800 font-mono">
                            Ticket: {simulatedResult.ticketNumber}
                          </div>
                          <div className="p-2.5 bg-white border border-emerald-200 rounded text-xs text-[#141413] whitespace-pre-line">
                            {simulatedResult.aiAutoReply}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/10">
                        <button
                          type="button"
                          onClick={() => setShowSimulateModal(false)}
                          className="px-3 py-1.5 bg-black/5 text-[#141413] rounded cursor-pointer"
                        >
                          Close
                        </button>
                        <button
                          type="submit"
                          disabled={isSimulating}
                          className="px-4 py-1.5 bg-[#C5A059] text-black font-bold rounded flex items-center gap-1.5 hover:bg-[#B38F48] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{isSimulating ? 'AI is Auto-Replying...' : 'Submit & Trigger AI Reply'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 12: STORE, MERCHANT, PAYMENT & LOGISTICS SETTINGS ======================== */}
          {activeTab === 'SETTINGS' && (
            <div className="max-w-4xl bg-white border border-black/15 p-6 sm:p-8 space-y-8">
              <div>
                <h1 className="text-2xl font-display font-bold text-[#141413]">
                  Merchant, Payment, Shipping &amp; Currency Configuration
                </h1>
                <p className="text-xs font-semibold text-[#141413] mt-1.5">
                  Centrally configure store operations operated from Pakistan (PK) with dual-currency display and worldwide shipping zones.
                </p>
              </div>

              {/* 1. Merchant Identity & Dual-Currency */}
              <div className="space-y-4">
                <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-wider text-[#141413]">
                    01. Central Merchant &amp; Dual-Currency Settings
                  </h2>
                  <span className="text-[11px] font-mono font-bold text-[#141413] bg-[#EFEFEA] px-2.5 py-0.5 border border-black/20 rounded">
                    PKR Base Currency
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Merchant Operating Country</label>
                    <input
                      type="text"
                      disabled
                      value={`${settings.merchantCountry || 'PK'} (Pakistan)`}
                      className="w-full px-3.5 py-2.5 bg-[#EFEFEA] border-2 border-black/25 text-[#141413] font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Store Base Currency</label>
                    <input
                      type="text"
                      disabled
                      value={`${settings.currency || 'PKR'} (Base)`}
                      className="w-full px-3.5 py-2.5 bg-[#EFEFEA] border-2 border-black/25 text-[#141413] font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Secondary Display Currency</label>
                    <input
                      type="text"
                      disabled
                      value={`${settings.secondaryDisplayCurrency || 'USD'} (Display)`}
                      className="w-full px-3.5 py-2.5 bg-[#EFEFEA] border-2 border-black/25 text-[#141413] font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">USD to PKR Store Valuation Rate</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.usdToPkrRate || 278.5}
                      onChange={(e) => updateStoreSettings({ usdToPkrRate: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                    <span className="block text-[11px] font-bold text-[#855B14] mt-1.5">
                      Static Configured Store Rate (Not live automated market ticker)
                    </span>
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Domestic Sales Tax (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.taxRate}
                      onChange={(e) => updateStoreSettings({ taxRate: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Store Legal Name</label>
                    <input
                      type="text"
                      value={settings.storeName}
                      onChange={(e) => updateStoreSettings({ storeName: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-semibold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Domestic Pakistan Logistics Configuration */}
              <div className="space-y-4">
                <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-wider text-[#141413]">
                    02. Pakistan Domestic Shipping Calculator
                  </h2>
                  <span className="text-[11px] font-mono font-bold text-emerald-900 bg-emerald-100 px-2.5 py-0.5 border border-emerald-300 rounded">
                    TCS / Leopards Active
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Base Shipping Fee (PKR)</label>
                    <input
                      type="number"
                      value={settings.domesticBaseFee ?? 250}
                      onChange={(e) => updateStoreSettings({ domesticBaseFee: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Included Weight (kg)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={settings.domesticIncludedWeightKg ?? 1.0}
                      onChange={(e) => updateStoreSettings({ domesticIncludedWeightKg: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Additional Per Kg (PKR)</label>
                    <input
                      type="number"
                      value={settings.domesticAdditionalPerKg ?? 120}
                      onChange={(e) => updateStoreSettings({ domesticAdditionalPerKg: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">Free Shipping Threshold (PKR)</label>
                    <input
                      type="number"
                      value={settings.domesticFreeShippingThreshold ?? 10000}
                      onChange={(e) => updateStoreSettings({ domesticFreeShippingThreshold: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                </div>
                <div className="p-3.5 bg-[#F2F1EC] border-2 border-black/20 text-xs text-[#141413] font-semibold">
                  <strong className="text-black font-black">Couriers Configured:</strong> TCS, Leopards Courier, M&amp;P Courier, Pakistan Post. Manual tracking dispatch supported.
                </div>
              </div>

              {/* 3. Payment Gateways & API Credentials (JazzCash, Easypaisa, Google Maps, Bank & COD) */}
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between border-b-2 border-black pb-3 gap-2">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-wider text-[#141413]">
                      03. Payment Gateways &amp; API Credentials
                    </h2>
                    <p className="text-xs text-[#141413] font-semibold mt-1">
                      Configure your official JazzCash, Easypaisa, Google Maps, and banking credentials. You can update these anytime when ready.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-bold text-amber-950 bg-amber-100 border-2 border-amber-400 rounded">
                    <ShieldCheck className="w-4 h-4 text-amber-800" />
                    Treasury Security Center
                  </span>
                </div>

                {/* 3A. JazzCash Merchant Gateway */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-4 rounded-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded bg-red-600/15 text-red-700 flex items-center justify-center font-black text-xs">
                        JC
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#141413]">JazzCash Merchant Gateway</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-bold ${settings.jazzcashMerchantId ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-neutral-200 text-[#141413]'}`}>
                            {settings.jazzcashMerchantId ? 'Configured' : 'Credentials Pending'}
                          </span>
                        </div>
                        <p className="text-xs text-[#141413] font-semibold mt-0.5">
                          Accept direct JazzCash payments via official Merchant API.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.jazzcashEnabled)}
                        onChange={(e) => updateStoreSettings({ jazzcashEnabled: e.target.checked })}
                        className="rounded accent-black w-4 h-4"
                      />
                      <span className={settings.jazzcashEnabled ? 'text-emerald-700 font-bold' : 'text-[#575653]'}>
                        {settings.jazzcashEnabled ? 'Active' : 'Disabled'}
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-3 border-t-2 border-black/10">
                    {/* Environment */}
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Gateway Environment</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateStoreSettings({ jazzcashEnvironment: 'sandbox' })}
                          className={`px-3.5 py-2 text-xs font-mono font-bold border-2 transition-colors cursor-pointer ${
                            (settings.jazzcashEnvironment || 'sandbox') === 'sandbox'
                              ? 'bg-[#141413] text-[#FBFBF9] border-[#141413]'
                              : 'bg-white text-[#141413] border-black/30 hover:bg-black/5'
                          }`}
                        >
                          Sandbox (Testing)
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStoreSettings({ jazzcashEnvironment: 'production' })}
                          className={`px-3.5 py-2 text-xs font-mono font-bold border-2 transition-colors cursor-pointer ${
                            settings.jazzcashEnvironment === 'production'
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-[#141413] border-black/30 hover:bg-black/5'
                          }`}
                        >
                          Production (Live)
                        </button>
                      </div>
                    </div>

                    {/* Merchant ID */}
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Merchant ID</label>
                      <input
                        type="text"
                        value={settings.jazzcashMerchantId || ''}
                        onChange={(e) => updateStoreSettings({ jazzcashMerchantId: e.target.value })}
                        placeholder="e.g. MC12345 (From JazzCash Portal)"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                      />
                    </div>

                    {/* Gateway API Password */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[#141413] font-bold text-xs">Gateway API Password</label>
                        <span className="text-[11px] text-amber-900 font-bold bg-amber-100 px-1.5 py-0.5 rounded">Not personal MPIN</span>
                      </div>
                      <div className="relative">
                        <input
                          type={showJazzPassword ? 'text' : 'password'}
                          value={settings.jazzcashPassword || ''}
                          onChange={(e) => updateStoreSettings({ jazzcashPassword: e.target.value })}
                          placeholder="JazzCash API Merchant Password"
                          className="w-full pl-3.5 pr-10 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowJazzPassword(!showJazzPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141413] hover:text-black cursor-pointer"
                        >
                          {showJazzPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-[#141413] font-semibold mt-1">
                        Issued in JazzCash Developer Portal for automated merchant requests.
                      </p>
                    </div>

                    {/* Integrity Salt */}
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Integrity Salt / Secret Hash Key</label>
                      <div className="relative">
                        <input
                          type={showJazzSalt ? 'text' : 'password'}
                          value={settings.jazzcashIntegritySalt || ''}
                          onChange={(e) => updateStoreSettings({ jazzcashIntegritySalt: e.target.value })}
                          placeholder="Hexadecimal Integrity Salt"
                          className="w-full pl-3.5 pr-10 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowJazzSalt(!showJazzSalt)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141413] hover:text-black cursor-pointer"
                        >
                          {showJazzSalt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-[#141413] font-semibold mt-1">
                        Used to calculate secure SHA-256 HMAC checksums.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3B. Easypaisa Merchant Gateway */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-4 rounded-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded bg-emerald-600/15 text-emerald-800 flex items-center justify-center font-black text-xs">
                        EP
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#141413]">Easypaisa Merchant Gateway</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-bold ${settings.easypaisaStoreId ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-neutral-200 text-[#141413]'}`}>
                            {settings.easypaisaStoreId ? 'Configured' : 'Credentials Pending'}
                          </span>
                        </div>
                        <p className="text-xs text-[#141413] font-semibold mt-0.5">
                          Accept direct Easypaisa wallet and online checkout payments.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.easypaisaEnabled)}
                        onChange={(e) => updateStoreSettings({ easypaisaEnabled: e.target.checked })}
                        className="rounded accent-black w-4 h-4"
                      />
                      <span className={settings.easypaisaEnabled ? 'text-emerald-700 font-bold' : 'text-[#575653]'}>
                        {settings.easypaisaEnabled ? 'Active' : 'Disabled'}
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-3 border-t-2 border-black/10">
                    {/* Environment */}
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Gateway Environment</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateStoreSettings({ easypaisaEnvironment: 'sandbox' })}
                          className={`px-3.5 py-2 text-xs font-mono font-bold border-2 transition-colors cursor-pointer ${
                            (settings.easypaisaEnvironment || 'sandbox') === 'sandbox'
                              ? 'bg-[#141413] text-[#FBFBF9] border-[#141413]'
                              : 'bg-white text-[#141413] border-black/30 hover:bg-black/5'
                          }`}
                        >
                          Sandbox
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStoreSettings({ easypaisaEnvironment: 'production' })}
                          className={`px-3.5 py-2 text-xs font-mono font-bold border-2 transition-colors cursor-pointer ${
                            settings.easypaisaEnvironment === 'production'
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-[#141413] border-black/30 hover:bg-black/5'
                          }`}
                        >
                          Live
                        </button>
                      </div>
                    </div>

                    {/* Store ID */}
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Store ID</label>
                      <input
                        type="text"
                        value={settings.easypaisaStoreId || ''}
                        onChange={(e) => updateStoreSettings({ easypaisaStoreId: e.target.value })}
                        placeholder="e.g. 102938 (From Easypaisa)"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                      />
                    </div>

                    {/* Hash Key */}
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Hash Key</label>
                      <div className="relative">
                        <input
                          type={showEasypaisaHash ? 'text' : 'password'}
                          value={settings.easypaisaHashKey || ''}
                          onChange={(e) => updateStoreSettings({ easypaisaHashKey: e.target.value })}
                          placeholder="Secret Hash Key"
                          className="w-full pl-3.5 pr-10 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEasypaisaHash(!showEasypaisaHash)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141413] hover:text-black cursor-pointer"
                        >
                          {showEasypaisaHash ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3C. Google Maps Platform API Key */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded bg-blue-600/15 text-blue-800 flex items-center justify-center font-black text-xs">
                        <Globe className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#141413]">Google Maps Platform API Key</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-bold ${settings.googleMapsApiKey ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-blue-100 text-blue-900 border border-blue-300'}`}>
                            {settings.googleMapsApiKey ? 'Custom Key Active' : 'Default Prototype Key Active'}
                          </span>
                        </div>
                        <p className="text-xs text-[#141413] font-semibold mt-0.5">
                          Powers interactive map pinning, street address autocomplete, and GPS coordinates during customer checkout.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t-2 border-black/10 text-xs space-y-2">
                    <label className="block text-[#141413] font-bold text-xs">Google Maps API Key (Starts with AIza...)</label>
                    <div className="relative">
                      <input
                        type={showGoogleMapsKey ? 'text' : 'password'}
                        value={settings.googleMapsApiKey || ''}
                        onChange={(e) => updateStoreSettings({ googleMapsApiKey: e.target.value })}
                        placeholder="Paste your Google Maps API Key here..."
                        className="w-full pl-3.5 pr-10 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGoogleMapsKey(!showGoogleMapsKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141413] hover:text-black cursor-pointer"
                      >
                        {showGoogleMapsKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#141413] font-semibold">
                      Leave empty to continue using the built-in prototype key, or paste your own Google Cloud key to use your quota.
                    </p>
                  </div>
                </div>

                {/* 3D. Cash on Delivery Settings */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#141413]">Cash on Delivery (COD)</span>
                      <p className="text-xs text-[#141413] font-semibold mt-0.5">Available for Pakistan domestic shipping with courier reconciliation.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.codEnabled)}
                        onChange={(e) => updateStoreSettings({ codEnabled: e.target.checked })}
                        className="rounded accent-black w-4 h-4"
                      />
                      <span className={settings.codEnabled ? 'text-emerald-700 font-bold' : 'text-[#575653]'}>
                        {settings.codEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>
                  {settings.codEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t-2 border-black/10">
                      <div>
                        <label className="block text-[#141413] font-bold text-xs mb-1.5">Minimum COD Order (PKR)</label>
                        <input
                          type="number"
                          value={settings.codMinOrder ?? 500}
                          onChange={(e) => updateStoreSettings({ codMinOrder: Number(e.target.value) })}
                          className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[#141413] font-bold text-xs mb-1.5">Maximum COD Order (PKR)</label>
                        <input
                          type="number"
                          value={settings.codMaxOrder ?? 150000}
                          onChange={(e) => updateStoreSettings({ codMaxOrder: Number(e.target.value) })}
                          className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3E. NayaPay Configuration */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#141413]">NayaPay Merchant Wallet</span>
                      <p className="text-xs text-[#141413] font-semibold mt-0.5">Manual TID verification. Displays at checkout only when enabled and details configured.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.nayapayEnabled)}
                        onChange={(e) => updateStoreSettings({ nayapayEnabled: e.target.checked })}
                        className="rounded accent-black w-4 h-4"
                      />
                      <span className={settings.nayapayEnabled ? 'text-emerald-700 font-bold' : 'text-[#575653]'}>
                        {settings.nayapayEnabled ? 'Active' : 'Inactive'}
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t-2 border-black/10">
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">NayaPay Account Title</label>
                      <input
                        type="text"
                        value={settings.nayapayAccountTitle || ''}
                        onChange={(e) => updateStoreSettings({ nayapayAccountTitle: e.target.value })}
                        placeholder="Registered business or merchant name"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">NayaPay Registered Mobile / ID</label>
                      <input
                        type="text"
                        value={settings.nayapayNumber || ''}
                        onChange={(e) => updateStoreSettings({ nayapayNumber: e.target.value })}
                        placeholder="e.g. 03XXXXXXXXX"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Merchant Payment Instructions (Shown at Checkout)</label>
                      <input
                        type="text"
                        value={settings.nayapayInstructions || ''}
                        onChange={(e) => updateStoreSettings({ nayapayInstructions: e.target.value })}
                        placeholder="Specific instructions for customer to transfer exact PKR and provide TID"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-semibold focus:border-black focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 3F. RAAST & Bank Transfer Configuration */}
                <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-3 rounded-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#141413]">RAAST Instant &amp; Bank Transfer (Domestic &amp; International)</span>
                      <p className="text-xs text-[#141413] font-semibold mt-0.5">Manual ledger reconciliation. Displays at checkout only when enabled and account details exist.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.raastEnabled)}
                        onChange={(e) => updateStoreSettings({ raastEnabled: e.target.checked })}
                        className="rounded accent-black w-4 h-4"
                      />
                      <span className={settings.raastEnabled ? 'text-emerald-700 font-bold' : 'text-[#575653]'}>
                        {settings.raastEnabled ? 'Active' : 'Inactive'}
                      </span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t-2 border-black/10">
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Beneficiary Account Title</label>
                      <input
                        type="text"
                        value={settings.raastAccountTitle || ''}
                        onChange={(e) => updateStoreSettings({ raastAccountTitle: e.target.value })}
                        placeholder="Official treasury or entity account title"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Bank Name</label>
                      <input
                        type="text"
                        value={settings.bankName || ''}
                        onChange={(e) => updateStoreSettings({ bankName: e.target.value })}
                        placeholder="Scheduled bank name"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">RAAST IBAN / Account Number</label>
                      <input
                        type="text"
                        value={settings.raastIban || ''}
                        onChange={(e) => updateStoreSettings({ raastIban: e.target.value })}
                        placeholder="e.g. PKXXBANKXXXXXXXXXXXXXXXX"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[#141413] font-bold text-xs mb-1.5">Wire &amp; RAAST Transfer Instructions (Shown at Checkout)</label>
                      <input
                        type="text"
                        value={settings.bankTransferInstructions || ''}
                        onChange={(e) => updateStoreSettings({ bankTransferInstructions: e.target.value })}
                        placeholder="Clear instructions for transfer and reference submission"
                        className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-semibold focus:border-black focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Save Credentials Notification Bar */}
                <div className="flex items-center justify-between p-4 sm:p-5 bg-[#141413] text-[#FBFBF9] border-2 border-black rounded-xs shadow-md">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-[#FBFBF9]">Store Treasury Settings Active</div>
                    <p className="text-xs text-[#EFEFEA] font-semibold mt-0.5">
                      All changes are automatically saved to your store configuration and live at checkout.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateStoreSettings({});
                      showToast('✅ All payment gateway settings and API credentials saved.');
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C5A059] text-[#141413] text-xs font-bold rounded-xs hover:bg-[#D4B36D] transition-colors cursor-pointer shadow-sm"
                  >
                    <Save className="w-4 h-4" />
                    Save All Settings
                  </button>
                </div>
              </div>

              {/* 4. International Zones & Manual Quote Rules */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-black/[0.08] pb-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#C5A059]">
                    04. International Shipping Zones &amp; Freight Rates ({settings.internationalZones?.length || 0} Zones)
                  </h2>
                  <span className="text-[11px] font-mono text-emerald-400">
                    Customs Mode: DAP (Delivered at Place)
                  </span>
                </div>
                <div className="divide-y divide-black/[0.08] bg-[#FBFBF9] border border-black/[0.08] p-4 space-y-3">
                  {settings.internationalZones?.map((z) => (
                    <div key={z.id} className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <strong className="text-[#141413]">{z.name}</strong>
                        <div className="text-[11px] text-[#575653] font-mono">
                          Countries: {z.countries.join(', ')} · Courier: {z.courier}
                        </div>
                      </div>
                      <div className="font-mono text-right">
                        <div className="text-[#141413] font-semibold">PKR {z.baseFee.toLocaleString()} base</div>
                        <div className="text-[10px] text-[#575653]">+PKR {z.perAdditionalKgFee}/kg additional</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. 24/7 Client Helpline, WhatsApp & AI Concierge Configuration */}
              <div className="space-y-4">
                <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-wider text-[#141413]">
                    05. 24/7 Client Helpline &amp; WhatsApp Concierge Configuration
                  </h2>
                  <span className="text-[11px] font-mono font-bold text-emerald-900 bg-emerald-100 px-2.5 py-0.5 border border-emerald-300 rounded">
                    Active Multi-Channel Helpline
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      WhatsApp Display Number
                    </label>
                    <input
                      type="text"
                      value={settings.helplineWhatsAppFormatted || '+92 300 8472911'}
                      onChange={(e) => updateStoreSettings({ helplineWhatsAppFormatted: e.target.value })}
                      placeholder="+92 300 8472911"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      WhatsApp Raw Number (with country code, no +)
                    </label>
                    <input
                      type="text"
                      value={settings.helplineWhatsApp || '923008472911'}
                      onChange={(e) => updateStoreSettings({ helplineWhatsApp: e.target.value })}
                      placeholder="923008472911"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      Helpline Email Address
                    </label>
                    <input
                      type="email"
                      value={settings.helplineEmail || 'concierge@atelieraurelia.com'}
                      onChange={(e) => updateStoreSettings({ helplineEmail: e.target.value })}
                      placeholder="concierge@atelieraurelia.com"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      VIP Phone / UAN Number
                    </label>
                    <input
                      type="text"
                      value={settings.helplinePhone || '+92 (042) 3578-9000'}
                      onChange={(e) => updateStoreSettings({ helplinePhone: e.target.value })}
                      placeholder="+92 (042) 3578-9000"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-mono font-bold focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#141413] font-bold text-xs mb-1.5">
                      Helpline Operating Hours
                    </label>
                    <input
                      type="text"
                      value={settings.helplineHours || '24/7 VIP Concierge & Assistance'}
                      onChange={(e) => updateStoreSettings({ helplineHours: e.target.value })}
                      placeholder="24/7 VIP Concierge & Assistance"
                      className="w-full px-3.5 py-2.5 bg-white border-2 border-black/30 text-[#141413] font-semibold focus:border-black focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Persistent Floating AI Copilot Drawer when on non-AI tabs */}
      {copilotDrawerOpen && activeTab !== 'AI_COMMAND_CENTER' && (
        <div className="w-96 border-l border-black/[0.08] bg-white flex flex-col h-screen sticky top-0">
          <div className="p-4 border-b border-black/[0.08] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#C5A059]">
              AI Store Copilot
            </span>
            <button
              onClick={() => setCopilotDrawerOpen(false)}
              className="text-[#575653] hover:text-[#141413] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {aiMessages.slice(-6).map((m) => (
              <div
                key={m.id}
                className={`p-3 border ${
                  m.role === 'user'
                    ? 'bg-[#F5F4F0] border-black/[0.12]'
                    : 'bg-[#FBFBF9] border-black/[0.08]'
                }`}
              >
                <div className="text-[#2A2A28] whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendAICommand();
            }}
            className="p-3 border-t border-black/[0.08] flex gap-2"
          >
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Command this page..."
              className="flex-1 px-3 py-2 bg-[#FBFBF9] border border-black/[0.12] text-xs text-[#141413]"
            />
            <button
              type="submit"
              disabled={aiBusy}
              className="px-3 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
            >
              Run
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
