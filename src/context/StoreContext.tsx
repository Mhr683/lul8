import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  UserProfile,
  Product,
  Category,
  CartItem,
  Order,
  Coupon,
  Review,
  AuditLog,
  AITask,
  StoreNotification,
  StoreSettings,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
} from '../types/store';
import {
  INITIAL_CATEGORIES,
  INITIAL_COUPONS,
  INITIAL_PRODUCTS,
  INITIAL_REVIEWS,
  INITIAL_SETTINGS,
  IMG_HANDBAG,
} from '../data/seedData';
import {
  PaymentGatewayService,
  sanitizeDocId,
  sanitizeSku,
  sanitizeSlug,
} from '../services/abstractions';
import { ShippingCalculationService } from '../services/shippingService';

interface StoreContextValue {
  // Auth
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  authReady: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;

  // Store Data
  products: Product[];
  categories: Category[];
  coupons: Coupon[];
  reviews: Review[];
  orders: Order[];
  auditLogs: AuditLog[];
  aiTasks: AITask[];
  notifications: StoreNotification[];
  settings: StoreSettings;

  // Cart & Wishlist
  cart: CartItem[];
  wishlist: string[];
  appliedCoupon: Coupon | null;
  addToCart: (product: Product, quantity?: number, variantLabel?: string) => void;
  removeFromCart: (productId: string, variantLabel?: string) => void;
  updateCartQuantity: (productId: string, quantity: number, variantLabel?: string) => void;
  clearCart: () => void;
  applyCouponCode: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;
  toggleWishlist: (productId: string) => void;

  // Storefront & Admin Operations
  placeOrder: (payload: {
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    destCountryIso?: string;
    shippingAddressSummary: string;
    shippingMethodId: string;
    shippingFee: number;
    paymentMethod: PaymentMethod;
    paymentSubMethod?: string;
    paymentReference?: string;
    paymentProofDetails?: string;
    district?: string;
    tehsil?: string;
    notes?: string;
    isQuoteRequest?: boolean;
    directAutoDebit?: boolean;
    authCredentials?: {
      accountNumber?: string;
      pinOrPassword?: string;
      authType?: 'MPIN' | 'PASSWORD' | 'OTP' | '3DS';
      verified?: boolean;
    };
  }) => Promise<Order>;
  verifyManualPayment: (orderId: string, action: 'APPROVE' | 'REJECT', note?: string) => Promise<void>;
  updateShippingQuote: (orderId: string, payload: {
    quoteAmount: number;
    quoteCourier: string;
    quoteEstimatedDays: string;
    quoteCustomsMode: 'DAP' | 'DDP' | 'NOT_APPLICABLE';
    quoteAdminNotes?: string;
  }) => Promise<void>;
  acceptOrRejectShippingQuote: (orderId: string, accept: boolean) => Promise<void>;
  submitReview: (payload: {
    productId: string;
    productName: string;
    rating: number;
    title: string;
    comment: string;
  }) => Promise<void>;

  // Admin & AI Mutators (Persisted to Firestore + Audit Log)
  saveProduct: (product: Partial<Product> & { name: string; price: number; category: string }, actionLabel?: string) => Promise<Product>;
  importProductsBatch: (items: Product[]) => Promise<{ count: number }>;
  removeProduct: (productId: string) => Promise<void>;
  saveCategory: (cat: Partial<Category> & { name: string }) => Promise<Category>;
  adjustInventory: (productId: string, newStock: number, reason?: string) => Promise<void>;
  updateOrderState: (orderId: string, status: OrderStatus, trackingNumber?: string) => Promise<void>;
  saveCoupon: (coupon: Partial<Coupon> & { code: string; type: Coupon['type']; value: number }) => Promise<Coupon>;
  deleteCouponById: (couponId: string) => Promise<void>;
  moderateReview: (reviewId: string, status: Review['status']) => Promise<void>;
  updateStoreSettings: (updated: Partial<StoreSettings>) => Promise<void>;
  recordAuditLog: (action: string, resource: string, details?: string) => Promise<void>;
  createOrUpdateAITask: (task: Partial<AITask> & { id: string; name: string; toolName: string }) => Promise<AITask>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  seedInitialDatabaseIfEmpty: () => Promise<void>;

  // Active Context for AI Memory
  selectedAdminProduct: Product | null;
  setSelectedAdminProduct: (p: Product | null) => void;
  selectedAdminOrder: Order | null;
  setSelectedAdminOrder: (o: Order | null) => void;
  cancelAITask: (taskId: string) => Promise<void>;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

const CART_STORAGE_KEY = 'atelier_aurelia_cart_v1';
const WISHLIST_STORAGE_KEY = 'atelier_aurelia_wishlist_v1';
const PRODUCTS_STORAGE_KEY = 'atelier_aurelia_products_v1';
const CATEGORIES_STORAGE_KEY = 'atelier_aurelia_categories_v1';

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(PRODUCTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_PRODUCTS;
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_CATEGORIES;
  });

  const [coupons, setCoupons] = useState<Coupon[]>(INITIAL_COUPONS);
  const [reviews, setReviews] = useState<Review[]>(INITIAL_REVIEWS);
  const [orders, setOrders] = useState<Order[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [aiTasks, setAiTasks] = useState<AITask[]>([]);
  const [notifications, setNotifications] = useState<StoreNotification[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem('atelier_aurelia_store_settings');
      return saved ? { ...INITIAL_SETTINGS, ...JSON.parse(saved) } : INITIAL_SETTINGS;
    } catch {
      return INITIAL_SETTINGS;
    }
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(WISHLIST_STORAGE_KEY);
      return saved ? JSON.parse(saved) : ['prod-01', 'prod-02'];
    } catch {
      return ['prod-01', 'prod-02'];
    }
  });

  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [selectedAdminProduct, setSelectedAdminProduct] = useState<Product | null>(null);
  const [selectedAdminOrder, setSelectedAdminOrder] = useState<Order | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      // ignore
    }
  }, [wishlist]);

  // Continuously sync products to local storage so catalog never disappears on refresh
  useEffect(() => {
    try {
      if (products && products.length > 0) {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
      }
    } catch {
      // ignore
    }
  }, [products]);

  // Continuously sync categories to local storage
  useEffect(() => {
    try {
      if (categories && categories.length > 0) {
        localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
      }
    } catch {
      // ignore
    }
  }, [categories]);

  // 0. Persistent Server Catalog Hydration (Guarantees CSV imports and products never disappear on refresh)
  useEffect(() => {
    const hydrateServerCatalog = async () => {
      try {
        const prodRes = await fetch('/api/catalog/products');
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          if (Array.isArray(prodData.products) && prodData.products.length > 0) {
            setProducts((prev) => {
              const serverMap = new Map<string, Product>();
              prodData.products.forEach((p: Product) => {
                if (p && p.id) serverMap.set(p.id, p);
              });
              prev.forEach((p) => {
                if (p && p.id && !serverMap.has(p.id)) {
                  serverMap.set(p.id, p);
                }
              });
              const merged = Array.from(serverMap.values());
              try {
                localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        }
      } catch (e) {
        console.warn('Server catalog hydration fallback:', e);
      }

      try {
        const catRes = await fetch('/api/catalog/categories');
        if (catRes.ok) {
          const catData = await catRes.json();
          if (Array.isArray(catData.categories) && catData.categories.length > 0) {
            setCategories((prev) => {
              const catMap = new Map<string, Category>();
              prev.forEach((c) => catMap.set(c.id, c));
              catData.categories.forEach((c: Category) => catMap.set(c.id, c));
              const merged = Array.from(catMap.values());
              try {
                localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        }
      } catch (e) {
        console.warn('Server categories hydration fallback:', e);
      }
    };

    hydrateServerCatalog();
  }, []);

  const isAdmin = Boolean(
    userProfile &&
      ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'PRODUCT_MANAGER', 'ORDER_MANAGER'].includes(
        userProfile.role
      )
  );

  // 1. Auth Listener & Profile Synchronization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        try {
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const existingProfile = snap.data() as UserProfile;
            setUserProfile(existingProfile);
          } else {
            const newProfile: UserProfile = {
              uid: user.uid,
              email: (user.email || 'client@atelieraurelia.com').slice(0, 250),
              name: (user.displayName || user.email?.split('@')[0] || 'Atelier Client').slice(0, 110),
              role: 'CUSTOMER',
              createdAt: new Date().toISOString(),
            };
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile);
          }
        } catch (err) {
          console.error('Error syncing user profile:', err);
        }
      } else {
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // 2. Seed initial catalog into Firestore if empty when Admin signs in
  const seedInitialDatabaseIfEmpty = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(collection(db, 'products'), where('status', '==', 'ACTIVE'));
      const snap = await getDocs(q);
      if (snap.empty && isAdmin) {
        // Seed Settings
        await setDoc(doc(db, 'settings', INITIAL_SETTINGS.id), INITIAL_SETTINGS);
        // Seed Categories
        for (const cat of INITIAL_CATEGORIES) {
          await setDoc(doc(db, 'categories', cat.id), cat);
        }
        // Seed Coupons
        for (const coup of INITIAL_COUPONS) {
          await setDoc(doc(db, 'coupons', coup.id), coup);
        }
        // Seed Products
        for (const prod of INITIAL_PRODUCTS) {
          await setDoc(doc(db, 'products', prod.id), prod);
        }
        // Seed Reviews
        for (const rev of INITIAL_REVIEWS) {
          await setDoc(doc(db, 'reviews', rev.id), rev);
        }
        // Seed Sample Orders for real analytics
        const demoOrders: Order[] = [
          {
            id: 'ord-1041',
            orderNumber: 'ORD-1041',
            userId: auth.currentUser.uid,
            customerName: 'Clara Vance',
            customerEmail: 'clara.vance@zurich-arch.ch',
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            paymentMethod: 'BANK_TRANSFER',
            subtotal: 1480,
            discount: 0,
            tax: 125.8,
            shippingFee: 0,
            total: 1605.8,
            shippingAddressSummary: 'Bahnhofstrasse 42, 8001 Zürich, Switzerland',
            trackingNumber: 'DHL-994827104',
            createdAt: '2026-10-03T11:30:00.000Z',
          },
          {
            id: 'ord-1042',
            orderNumber: 'ORD-1042',
            userId: auth.currentUser.uid,
            customerName: 'Henrik Lindqvist',
            customerEmail: 'h.lindqvist@nordicventures.se',
            status: 'PROCESSING',
            paymentStatus: 'PAID',
            paymentMethod: 'BANK_TRANSFER',
            subtotal: 4250,
            discount: 100,
            tax: 352.75,
            shippingFee: 0,
            total: 4502.75,
            couponCode: 'PRIVATE100',
            shippingAddressSummary: 'Strandvägen 7A, 114 56 Stockholm, Sweden',
            createdAt: '2026-10-06T16:45:00.000Z',
          },
          {
            id: 'ord-1043',
            orderNumber: 'ORD-1043',
            userId: auth.currentUser.uid,
            customerName: 'Julien Marchand',
            customerEmail: 'j.marchand@galerie-paris.fr',
            status: 'PENDING',
            paymentStatus: 'PENDING',
            paymentMethod: 'COD',
            subtotal: 1185,
            discount: 0,
            tax: 100.73,
            shippingFee: 0,
            total: 1285.73,
            shippingAddressSummary: '24 Rue du Faubourg Saint-Honoré, 75008 Paris',
            createdAt: '2026-10-07T08:15:00.000Z',
          },
        ];
        for (const ord of demoOrders) {
          await setDoc(doc(db, 'orders', ord.id), ord);
        }
        showToast('Store database initialized with luxury catalog & telemetry.');
      }
    } catch (error) {
      console.warn('Database seed check skipped or already populated:', error);
    }
  };

  // 3. Public Catalog Listeners (Products, Categories, Coupons, Approved Reviews, Settings)
  useEffect(() => {
    if (!authReady) return;

    const prodQuery = isAdmin
      ? collection(db, 'products')
      : query(collection(db, 'products'), where('status', '==', 'ACTIVE'));

    const unsubProducts = onSnapshot(
      prodQuery,
      (snap) => {
        if (!snap.empty) {
          const firestoreList = snap.docs.map((d) => d.data() as Product);
          setProducts((prev) => {
            const firestoreIds = new Set(firestoreList.map((p) => p.id));
            const firestoreSkus = new Set(firestoreList.map((p) => p.sku.toLowerCase()));
            const localOnly = prev.filter(
              (p) => !firestoreIds.has(p.id) && !firestoreSkus.has(p.sku.toLowerCase())
            );
            const merged = [...firestoreList, ...localOnly];
            merged.sort((a, b) => a.id.localeCompare(b.id));
            try {
              localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(merged));
            } catch {}
            return merged;
          });
        } else if (isAdmin) {
          seedInitialDatabaseIfEmpty();
        }
      },
      (err) => {
        console.warn('Products listener fallback to cached/initial catalog:', err.message);
      }
    );

    const unsubCategories = onSnapshot(
       query(collection(db, 'categories'), where('slug', '>=', '')),
      (snap) => {
        if (!snap.empty) {
          setCategories(snap.docs.map((d) => d.data() as Category));
        }
      },
      () => {}
    );

    const coupQuery = isAdmin
      ? collection(db, 'coupons')
      : query(collection(db, 'coupons'), where('active', '==', true));

    const unsubCoupons = onSnapshot(
      coupQuery,
      (snap) => {
        if (!snap.empty) {
          setCoupons(snap.docs.map((d) => d.data() as Coupon));
        }
      },
      () => {}
    );

    const revQuery = isAdmin
      ? collection(db, 'reviews')
      : query(collection(db, 'reviews'), where('status', '==', 'APPROVED'));

    const unsubReviews = onSnapshot(
      revQuery,
      (snap) => {
        if (!snap.empty) {
          setReviews(snap.docs.map((d) => d.data() as Review));
        }
      },
      () => {}
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'store_config'),
      (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as StoreSettings);
        }
      },
      () => {}
    );

    return () => {
      unsubProducts();
      unsubCategories();
      unsubCoupons();
      unsubReviews();
      unsubSettings();
    };
  }, [authReady, isAdmin]);

  // 4. Authenticated Listeners (Orders, Audit Logs, AI Tasks, Notifications)
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setOrders([]);
      setAuditLogs([]);
      setAiTasks([]);
      setNotifications([]);
      return;
    }

    const ordersQ = isAdmin
      ? collection(db, 'orders')
      : query(collection(db, 'orders'), where('userId', '==', firebaseUser.uid));

    const unsubOrders = onSnapshot(
      ordersQ,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const notifQ = isAdmin
      ? collection(db, 'notifications')
      : query(collection(db, 'notifications'), where('userId', '==', firebaseUser.uid));

    const unsubNotifs = onSnapshot(
      notifQ,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StoreNotification);
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setNotifications(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    let unsubAudit = () => {};
    let unsubTasks = () => {};

    if (isAdmin) {
      unsubAudit = onSnapshot(
        collection(db, 'audit_logs'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as AuditLog);
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setAuditLogs(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
      );

      unsubTasks = onSnapshot(
        collection(db, 'ai_tasks'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as AITask);
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setAiTasks(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'ai_tasks')
      );
    }

    return () => {
      unsubOrders();
      unsubNotifs();
      unsubAudit();
      unsubTasks();
    };
  }, [authReady, firebaseUser, isAdmin]);

  // Auth Actions
  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in to Atelier Aurelia.');
    } catch (error: any) {
      console.error('Sign-in failed:', error);
      showToast(error?.message || 'Authentication cancelled.');
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    showToast('Signed out.');
  };

  // Cart & Wishlist Actions
  const addToCart = (product: Product, quantity = 1, variantLabel = 'Standard Edition') => {
    if (product.stock <= 0) {
      showToast(`${product.name} is currently out of stock.`);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex(
        (item) => item.productId === product.id && item.variantLabel === variantLabel
      );
      if (idx > -1) {
        const updated = [...prev];
        const nextQty = Math.min(product.stock, updated[idx].quantity + quantity);
        updated[idx] = { ...updated[idx], quantity: nextQty };
        return updated;
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          quantity: Math.min(product.stock, quantity),
          variantLabel,
          primaryImage: product.primaryImage,
          category: product.category,
        },
      ];
    });
    showToast(`Added ${product.name} to shopping bag.`);
  };

  const removeFromCart = (productId: string, variantLabel = 'Standard Edition') => {
    setCart((prev) =>
      prev.filter(
        (item) => !(item.productId === productId && item.variantLabel === variantLabel)
      )
    );
  };

  const updateCartQuantity = (
    productId: string,
    quantity: number,
    variantLabel = 'Standard Edition'
  ) => {
    if (quantity <= 0) {
      removeFromCart(productId, variantLabel);
      return;
    }
    const product = products.find((p) => p.id === productId);
    const maxStock = product ? product.stock : 99;
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId && item.variantLabel === variantLabel
          ? { ...item, quantity: Math.min(maxStock, quantity) }
          : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
    setAppliedCoupon(null);
  };

  const applyCouponCode = (rawCode: string): { success: boolean; message: string } => {
    const clean = rawCode.trim().toUpperCase();
    const found = coupons.find((c) => c.code.toUpperCase() === clean && c.active);
    if (!found) {
      return { success: false, message: 'Invalid or expired promotional code.' };
    }
    const subtotal = cart.reduce((sum, item) => {
      const liveProd = products.find((p) => p.id === item.productId);
      const trustedUnitPrice = liveProd ? liveProd.price : item.price;
      return sum + trustedUnitPrice * item.quantity;
    }, 0);
    if (found.minCartAmount && subtotal < found.minCartAmount) {
      return {
        success: false,
        message: `Coupon ${found.code} requires a minimum order of $${found.minCartAmount}.`,
      };
    }
    setAppliedCoupon(found);
    return { success: true, message: `Coupon ${found.code} applied.` };
  };

  const removeCoupon = () => setAppliedCoupon(null);

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => {
      if (prev.includes(productId)) {
        showToast('Removed from saved pieces.');
        return prev.filter((id) => id !== productId);
      }
      showToast('Saved to wishlist.');
      return [...prev, productId];
    });
  };

  // Audit Log Helper
  const recordAuditLog = async (action: string, resource: string, details?: string) => {
    if (!auth.currentUser || !isAdmin) return;
    const logId = sanitizeDocId(`log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const entry: AuditLog = {
      id: logId,
      actorUid: auth.currentUser.uid,
      actorName: (userProfile?.name || auth.currentUser.email || 'Admin').slice(0, 110),
      action: action.slice(0, 115),
      resource: resource.slice(0, 115),
      ...(details ? { details: details.slice(0, 1950) } : {}),
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'audit_logs', logId), entry);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `audit_logs/${logId}`);
    }
  };

  // Notification Helper
  const pushNotification = async (
    type: StoreNotification['type'],
    title: string,
    message: string
  ) => {
    if (!auth.currentUser) return;
    const notifId = sanitizeDocId(`notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const notif: StoreNotification = {
      id: notifId,
      userId: auth.currentUser.uid,
      type,
      title: title.slice(0, 150),
      message: message.slice(0, 580),
      read: false,
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'notifications', notifId), notif);
    } catch (err) {
      console.warn('Could not persist notification:', err);
    }
  };

  // Place Order Flow (Revalidating prices & stock against trusted catalog records)
  const placeOrder: StoreContextValue['placeOrder'] = async (payload) => {
    const destCountryIso = (payload.destCountryIso || 'PK').toUpperCase();
    const isDomestic = destCountryIso === 'PK';

    // Strict validation: Reject COD outside Pakistan
    if (payload.paymentMethod === 'COD' && !isDomestic) {
      throw new Error('Cash on Delivery (COD) is strictly restricted to Pakistan domestic destinations. International orders require advance payment or logistics quote.');
    }

    // 1. Calculate and re-verify shipping fee using server-aligned ShippingCalculationService
    const shippingCalc = ShippingCalculationService.calculate({
      destinationCountryIso: destCountryIso,
      items: cart,
      catalogProducts: products,
      settings,
      selectedCourier: payload.shippingMethodId,
      hasFreeShippingCoupon: appliedCoupon?.type === 'FREE_SHIPPING',
    });
    const shippingSnapshot = ShippingCalculationService.createSnapshot(shippingCalc);

    // If destination requires manual quote and user submitted a quote request
    const isQuoteRequest = Boolean(payload.isQuoteRequest || shippingCalc.requiresManualQuote || payload.paymentMethod === 'MANUAL_QUOTE');

    // Trusted subtotal revalidation
    const subtotal = cart.reduce((sum, item) => {
      const liveProd = products.find((p) => p.id === item.productId);
      const trustedPrice = liveProd ? liveProd.price : item.price;
      return sum + trustedPrice * item.quantity;
    }, 0);

    let discount = 0;
    if (appliedCoupon && !isQuoteRequest) {
      if (appliedCoupon.type === 'PERCENTAGE') {
        discount = (subtotal * appliedCoupon.value) / 100;
        if (appliedCoupon.maxDiscount) {
          discount = Math.min(discount, appliedCoupon.maxDiscount);
        }
      } else if (appliedCoupon.type === 'FIXED') {
        discount = Math.min(subtotal, appliedCoupon.value);
      }
    }
    const taxable = Math.max(0, subtotal - discount);
    // Tax applies to domestic sales, or as configured
    const taxRate = isDomestic ? settings.taxRate : 0;
    const tax = Number(((taxable * taxRate) / 100).toFixed(2));
    
    // Trusted shipping fee calculation
    const verifiedShippingFee = isQuoteRequest ? 0 : shippingCalc.finalShippingFee;
    const total = Number((taxable + tax + verifiedShippingFee).toFixed(2));

    const orderNum = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const orderId = sanitizeDocId(`ord-${Date.now()}`);

    const paymentResult = await PaymentGatewayService.processPayment({
      orderNumber: orderNum,
      amount: total,
      currency: settings.currency,
      method: payload.paymentMethod,
      customerEmail: payload.customerEmail,
      maskedInstrumentSummary: payload.paymentReference || payload.paymentProofDetails,
      directAutoDebit: payload.directAutoDebit,
      authCredentials: payload.authCredentials,
    });

    const itemsManifest = cart
      .map((item) => `${item.sku}x${item.quantity}`)
      .join(', ');
    const combinedNotes = [
      `[Items: ${itemsManifest}]`,
      payload.notes || '',
      `[Shipping: ${shippingCalc.zoneName} via ${shippingCalc.carrier} (${shippingCalc.customsMode})]`,
      `[Payment: ${paymentResult.providerMessage}]`,
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 950);

    const initialOrderStatus: OrderStatus = isQuoteRequest
      ? 'QUOTE_REQUESTED'
      : paymentResult.paymentStatus === 'PAID'
      ? 'CONFIRMED'
      : 'PENDING';

    const isAdvancePaymentPaid = !isQuoteRequest && paymentResult.paymentStatus === 'PAID';
    let emailReceiptHtml = '';
    let emailReceiptSubject = `Payment Recieved: Order #${orderNum} | ${settings.storeName || 'Atelier Aurelia'}`;

    if (isAdvancePaymentPaid) {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        const emailRes = await fetch('/api/email/send-payment-receipt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            toEmail: payload.customerEmail,
            customerName: payload.customerName,
            orderNumber: orderNum,
            storeName: settings.storeName || 'Atelier Aurelia',
            paymentMethod: payload.paymentMethod,
            paymentSubMethod: payload.paymentSubMethod,
            paymentReference: payload.paymentReference || paymentResult.transactionId,
            totalAmount: total,
            currency: settings.currency,
            items: cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
            shippingAddress: payload.shippingAddressSummary,
            district: payload.district,
            tehsil: payload.tehsil,
          }),
        });
        if (emailRes.ok) {
          const emailData = await emailRes.json();
          emailReceiptHtml = emailData.htmlPreview || '';
          if (emailData.subject) emailReceiptSubject = emailData.subject;
        }
      } catch (err) {
        console.warn('Payment receipt email dispatch error:', err);
      }
    }

    const newOrder: Order = {
      id: orderId,
      orderNumber: orderNum,
      userId: firebaseUser?.uid || 'guest-checkout',
      customerName: payload.customerName.slice(0, 140),
      customerEmail: payload.customerEmail.slice(0, 250),
      ...(payload.customerPhone ? { customerPhone: payload.customerPhone.slice(0, 40) } : {}),
      destCountryIso,
      status: initialOrderStatus,
      paymentStatus: isQuoteRequest ? 'PENDING' : paymentResult.paymentStatus,
      paymentMethod: payload.paymentMethod,
      ...(payload.paymentSubMethod ? { paymentSubMethod: payload.paymentSubMethod.slice(0, 50) } : {}),
      ...(payload.paymentReference ? { paymentReference: payload.paymentReference.slice(0, 100) } : {}),
      ...(payload.paymentProofDetails ? { paymentProofDetails: payload.paymentProofDetails.slice(0, 300) } : {}),
      subtotal: Number(subtotal.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      tax,
      shippingFee: Number(verifiedShippingFee.toFixed(2)),
      total,
      currency: settings.currency,
      exchangeRateSnapshot: settings.usdToPkrRate || 278.5,
      ...(appliedCoupon && !isQuoteRequest ? { couponCode: appliedCoupon.code } : {}),
      ...(payload.district ? { district: payload.district.slice(0, 80) } : {}),
      ...(payload.tehsil ? { tehsil: payload.tehsil.slice(0, 80) } : {}),
      shippingAddressSummary: payload.shippingAddressSummary.slice(0, 480),
      shippingCalculationSnapshot: shippingSnapshot,
      notes: combinedNotes,
      createdAt: new Date().toISOString(),
      ...(isAdvancePaymentPaid
        ? {
            paymentReceiptEmailSent: true,
            paymentReceiptEmailSentAt: new Date().toISOString(),
            paymentReceiptEmailSubject: emailReceiptSubject,
            paymentReceiptEmailRecipient: payload.customerEmail,
            paymentReceiptEmailHtml: emailReceiptHtml,
          }
        : {}),
    };

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'orders', orderId), newOrder);
        await pushNotification(
          isAdvancePaymentPaid ? 'PAYMENT_RECEIVED' : 'NEW_ORDER',
          isAdvancePaymentPaid
            ? `Payment Recieved · ${orderNum} | ${settings.storeName || 'Atelier Aurelia'}`
            : isQuoteRequest
            ? `Quote Request ${orderNum}`
            : `Order ${orderNum} Confirmed`,
          isAdvancePaymentPaid
            ? `Apki payment ba-hifazat recieve ho chuki hy. Amount: ${settings.currency} ${total.toLocaleString()}. Gmail confirmation sent to ${payload.customerEmail} from ${settings.storeName || 'Atelier Aurelia'}.`
            : `${payload.customerName} submitted ${isQuoteRequest ? 'an International Quote Request' : `an order for ${total.toFixed(2)} ${settings.currency}`}.`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}`);
      }
    } else {
      // Guest order saved in local state so guest sees immediate confirmation & order timeline
      setOrders((prev) => [newOrder, ...prev]);
    }

    // Decrement stock only if not a pending quote request
    if (!isQuoteRequest) {
      for (const item of cart) {
        const targetProd = products.find((p) => p.id === item.productId);
        if (targetProd) {
          const nextStock = Math.max(0, targetProd.stock - item.quantity);
          if (isAdmin && firebaseUser) {
            try {
              await setDoc(doc(db, 'products', targetProd.id), {
                ...targetProd,
                stock: nextStock,
                updatedAt: new Date().toISOString(),
              });
            } catch {
              // ignore
            }
          } else {
            setProducts((prev) =>
              prev.map((p) => (p.id === targetProd.id ? { ...p, stock: nextStock } : p))
            );
          }
        }
      }
    }

    clearCart();
    return newOrder;
  };

  // Verify Manual Payment Workflow (Admin Only, Server and Local State Synchronized)
  const verifyManualPayment = async (orderId: string, action: 'APPROVE' | 'REJECT', note?: string) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;

    if (!isAdmin) {
      showToast('Unauthorized: Only authorized administrators may verify manual payments.');
      return;
    }

    const actor = userProfile?.name || firebaseUser?.email || 'Administrator';

    // Synchronize with server verification endpoint
    let serverVerification: any = null;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const srvRes = await fetch('/api/admin/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderId: target.id,
          orderNumber: target.orderNumber,
          action,
          customerEmail: target.customerEmail,
          note,
          currentPaymentStatus: target.paymentStatus,
          currentOrderStatus: target.status,
        }),
      });

      const resJson = await srvRes.json();
      if (!srvRes.ok) {
        showToast(resJson.error || 'Payment verification rejected by server.');
        return;
      }
      serverVerification = resJson.verification;
    } catch (err: any) {
      showToast(err?.message || 'Failed to reach payment verification server.');
      return;
    }

    const now = serverVerification?.verifiedAt || new Date().toISOString();
    const nextPaymentStatus: PaymentStatus = serverVerification?.newPaymentStatus || (action === 'APPROVE' ? 'PAID' : 'FAILED');
    const nextOrderStatus: OrderStatus = serverVerification?.newOrderStatus || (action === 'APPROVE' ? 'CONFIRMED' : 'CANCELLED');

    let approvedReceiptHtml = target.paymentReceiptEmailHtml || '';
    let approvedSubject = target.paymentReceiptEmailSubject || `Payment Recieved: Order #${target.orderNumber} | ${settings.storeName || 'Atelier Aurelia'}`;

    if (action === 'APPROVE') {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        const mailRes = await fetch('/api/email/send-payment-receipt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            toEmail: target.customerEmail,
            customerName: target.customerName,
            orderNumber: target.orderNumber,
            storeName: settings.storeName || 'Atelier Aurelia',
            paymentMethod: target.paymentMethod,
            paymentSubMethod: target.paymentSubMethod,
            paymentReference: target.paymentReference || 'Bank / Wallet Reconciled',
            totalAmount: target.total,
            currency: target.currency || settings.currency,
            items: [],
            shippingAddress: target.shippingAddressSummary,
            district: target.district,
            tehsil: target.tehsil,
          }),
        });
        if (mailRes.ok) {
          const mailData = await mailRes.json();
          approvedReceiptHtml = mailData.htmlPreview || '';
          if (mailData.subject) approvedSubject = mailData.subject;
        }
      } catch (e) {
        console.warn('Failed to send verified receipt email:', e);
      }
    }

    const updatedOrder: Order = {
      ...target,
      paymentStatus: nextPaymentStatus,
      status: nextOrderStatus,
      paymentVerifiedBy: serverVerification?.verifiedBy || actor,
      paymentVerifiedAt: now,
      paymentVerificationNote: serverVerification?.note || note || (action === 'APPROVE' ? 'Payment verified in bank ledger.' : 'Transaction ID not recognized or funds unreceived.'),
      paymentReceiptEmailSent: action === 'APPROVE' ? true : target.paymentReceiptEmailSent,
      paymentReceiptEmailSentAt: action === 'APPROVE' ? now : target.paymentReceiptEmailSentAt,
      paymentReceiptEmailSubject: action === 'APPROVE' ? approvedSubject : target.paymentReceiptEmailSubject,
      paymentReceiptEmailRecipient: target.customerEmail,
      paymentReceiptEmailHtml: approvedReceiptHtml || target.paymentReceiptEmailHtml,
      updatedAt: now,
    };

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'orders', target.id), updatedOrder);
        await recordAuditLog(
          action === 'APPROVE' ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
          `Order:${target.orderNumber}`,
          `Payment verified as ${nextPaymentStatus} by ${actor}. Ref: ${target.paymentReference || 'N/A'}`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${target.id}`);
      }
    } else {
      setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
    }

    showToast(
      action === 'APPROVE'
        ? `Payment for Order ${target.orderNumber} VERIFIED and confirmed.`
        : `Payment for Order ${target.orderNumber} REJECTED.`
    );
  };

  // Admin Update Shipping Quote Workflow for International Orders
  const updateShippingQuote = async (
    orderId: string,
    payload: {
      quoteAmount: number;
      quoteCourier: string;
      quoteEstimatedDays: string;
      quoteCustomsMode: 'DAP' | 'DDP' | 'NOT_APPLICABLE';
      quoteAdminNotes?: string;
    }
  ) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;

    const updatedTotal = Number(((target.subtotal || 0) + payload.quoteAmount).toFixed(2));
    const nowIso = new Date().toISOString();
    const expiryIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const updatedOrder: Order = {
      ...target,
      status: 'QUOTE_READY',
      shippingFee: payload.quoteAmount,
      total: updatedTotal,
      quoteAmount: payload.quoteAmount,
      quoteCourier: payload.quoteCourier,
      quoteEstimatedDays: payload.quoteEstimatedDays,
      quoteCustomsMode: payload.quoteCustomsMode,
      quoteAdminNotes: payload.quoteAdminNotes,
      quoteExpiresAt: expiryIso,
      shippingCalculationSnapshot: {
        destCountryIso: target.destCountryIso || 'US',
        destZoneName: 'Manual Freight Quotation',
        carrier: payload.quoteCourier,
        actualWeightKg: target.shippingCalculationSnapshot?.actualWeightKg || 1.0,
        volumetricWeightKg: target.shippingCalculationSnapshot?.volumetricWeightKg || 1.0,
        billableWeightKg: target.shippingCalculationSnapshot?.billableWeightKg || 1.0,
        baseFee: payload.quoteAmount,
        additionalWeightFee: 0,
        freeShippingApplied: false,
        finalShippingFee: payload.quoteAmount,
        currency: target.currency || 'PKR',
        customsMode: payload.quoteCustomsMode,
        customsNotice: `International Freight: ${payload.quoteCustomsMode}. Valid for 7 days until ${expiryIso.slice(0, 10)}.`,
        estimatedDelivery: payload.quoteEstimatedDays,
        requiresManualQuote: true,
        calculatedAt: nowIso,
      },
      updatedAt: nowIso,
    };

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'orders', target.id), updatedOrder);
        await recordAuditLog(
          'SHIPPING_QUOTE_ISSUED',
          `Order:${target.orderNumber}`,
          `Issued freight quote: PKR ${payload.quoteAmount} via ${payload.quoteCourier} (${payload.quoteCustomsMode})`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${target.id}`);
      }
    } else {
      setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
    }

    showToast(`Shipping quote issued for Order ${target.orderNumber}. Client can now accept and pay.`);
  };

  // Client Accept or Reject Shipping Quote Workflow (Trusted Server Validation & Expiry Enforcement)
  const acceptOrRejectShippingQuote = async (orderId: string, accept: boolean) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;

    try {
      const resp = await fetch('/api/orders/respond-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: target.id,
          orderNumber: target.orderNumber,
          currentStatus: target.status,
          quoteExpiresAt: target.quoteExpiresAt,
          action: accept ? 'ACCEPT' : 'REJECT',
          actorUid: firebaseUser?.uid || 'guest-user',
          actorEmail: firebaseUser?.email || target.customerEmail,
        }),
      });

      const resData = await resp.json();

      if (!resp.ok) {
        if (resData.isExpired || resData.rejectedCode === 'QUOTE_EXPIRED') {
          // Trusted server detected expiry and calculated transition
          const expiredOrder: Order = {
            ...target,
            status: 'QUOTE_EXPIRED',
            updatedAt: resData.serverTimestamp || new Date().toISOString(),
          };
          if (firebaseUser && isAdmin) {
            try {
              await setDoc(doc(db, 'orders', target.id), expiredOrder);
              await recordAuditLog(
                'QUOTE_EXPIRED',
                `Order:${target.orderNumber}`,
                `Quote expired past deadline ${target.quoteExpiresAt}. Server confirmed expiration.`
              );
            } catch {
              // ignore
            }
          }
          setOrders((prev) => prev.map((o) => (o.id === target.id ? expiredOrder : o)));
          showToast(resData.error || 'This freight quote has expired. Please contact concierge for a refreshed quotation.');
          return;
        }
        showToast(resData.error || 'Failed to update quote status.');
        return;
      }

      const updatedOrder: Order = {
        ...target,
        status: resData.newStatus,
        paymentStatus: resData.newPaymentStatus,
        updatedAt: resData.serverTimestamp || new Date().toISOString(),
      };

      if (firebaseUser) {
        try {
          await setDoc(doc(db, 'orders', target.id), updatedOrder);
          await recordAuditLog(
            resData.auditLog?.action || (accept ? 'QUOTE_ACCEPTED' : 'QUOTE_REJECTED'),
            `Order:${target.orderNumber}`,
            resData.auditLog?.details || `Quote ${accept ? 'accepted' : 'declined'} by client.`
          );
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `orders/${target.id}`);
        }
      } else {
        setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
      }

      showToast(accept ? 'Shipping quote accepted. Please submit advance payment.' : 'Shipping quote declined.');
    } catch (err: any) {
      showToast(err?.message || 'Error processing quote response.');
    }
  };

  // Submit Customer Review
  const submitReview: StoreContextValue['submitReview'] = async (payload) => {
    if (!firebaseUser) {
      showToast('Please sign in with Google to publish a verified review.');
      return;
    }
    const revId = sanitizeDocId(`rev-${Date.now()}`);
    const newReview: Review = {
      id: revId,
      productId: payload.productId,
      productName: payload.productName.slice(0, 190),
      userId: firebaseUser.uid,
      authorName: (userProfile?.name || firebaseUser.displayName || 'Verified Client').slice(0, 110),
      rating: Math.min(5, Math.max(1, Math.round(payload.rating))),
      title: payload.title.slice(0, 150),
      comment: payload.comment.slice(0, 1900),
      verifiedPurchase: true,
      status: 'APPROVED',
      helpfulCount: 1,
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'reviews', revId), newReview);
      showToast('Thank you. Your review has been published.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `reviews/${revId}`);
    }
  };

  // Admin & AI: Save or Create Product
  const saveProduct: StoreContextValue['saveProduct'] = async (input, actionLabel) => {
    const existingProd = input.id ? products.find((p) => p.id === input.id) : undefined;
    const prodId = existingProd?.id || sanitizeDocId(input.id || `prod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
    const now = new Date().toISOString();

    const cleanProduct: Product = {
      id: prodId,
      sku: sanitizeSku(input.sku || existingProd?.sku || `AA-${Date.now().toString().slice(-5)}`),
      name: (input.name || existingProd?.name || 'Untitled Atelier Piece').slice(0, 195),
      slug: sanitizeSlug(input.slug || input.name || existingProd?.slug || prodId),
      shortDescription: (
        input.shortDescription ??
        existingProd?.shortDescription ??
        'Handcrafted architectural luxury piece from Atelier Aurelia.'
      ).slice(0, 490),
      description: (
        input.description ??
        existingProd?.description ??
        'Crafted from noble materials with bespoke artisan finishing.'
      ).slice(0, 4900),
      price: Math.max(0, Number(input.price ?? existingProd?.price ?? 0)),
      compareAtPrice: Math.max(
        0,
        Number(input.compareAtPrice ?? existingProd?.compareAtPrice ?? Math.round((input.price || 100) * 1.15))
      ),
      costPrice: Math.max(
        0,
        Number(input.costPrice ?? existingProd?.costPrice ?? Math.round((input.price || 100) * 0.35))
      ),
      stock: Math.max(0, Math.round(Number(input.stock ?? existingProd?.stock ?? 15))),
      reservedStock: Math.max(0, Math.round(Number(input.reservedStock ?? existingProd?.reservedStock ?? 0))),
      lowStockThreshold: Math.max(
        1,
        Math.round(Number(input.lowStockThreshold ?? existingProd?.lowStockThreshold ?? 5))
      ),
      category: (input.category || existingProd?.category || 'Leather Goods').slice(0, 75),
      subcategory: (input.subcategory || existingProd?.subcategory || 'Limited Edition').slice(0, 75),
      brand: (input.brand || existingProd?.brand || 'Atelier Aurelia').slice(0, 75),
      status: input.status || existingProd?.status || 'ACTIVE',
      featured: Boolean(input.featured ?? existingProd?.featured ?? false),
      bestSeller: Boolean(input.bestSeller ?? existingProd?.bestSeller ?? false),
      newArrival: Boolean(input.newArrival ?? existingProd?.newArrival ?? true),
      seoTitle: (input.seoTitle ?? existingProd?.seoTitle ?? `${input.name} | Atelier Aurelia`).slice(0, 155),
      seoDescription: (
        input.seoDescription ??
        existingProd?.seoDescription ??
        (input.shortDescription || `Discover ${input.name} handcrafted by Atelier Aurelia.`)
      ).slice(0, 310),
      seoKeywords: (
        input.seoKeywords ??
        existingProd?.seoKeywords ??
        `${input.category?.toLowerCase()}, luxury, atelier aurelia`
      ).slice(0, 390),
      primaryImage: (input.primaryImage || existingProd?.primaryImage || IMG_HANDBAG).slice(0, 980),
      rating: Number(input.rating ?? existingProd?.rating ?? 5.0),
      reviewCount: Math.round(Number(input.reviewCount ?? existingProd?.reviewCount ?? 1)),
      weightKg: Number(input.weightKg ?? existingProd?.weightKg ?? 0.8),
      dimensions: (input.dimensions || existingProd?.dimensions || '30cm x 20cm x 10cm').slice(0, 95),
      createdAt: existingProd?.createdAt || now,
      updatedAt: now,
    };

    // Always update local reactive state and localStorage immediately
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === prodId || p.sku.toLowerCase() === cleanProduct.sku.toLowerCase());
      const next = exists
        ? prev.map((p) => (p.id === prodId || p.sku.toLowerCase() === cleanProduct.sku.toLowerCase() ? cleanProduct : p))
        : [cleanProduct, ...prev];
      try {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    // Persist to server disk storage so refresh never loses the product
    (async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      fetch('/api/catalog/products/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(cleanProduct),
      }).catch(() => {});
    })();

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'products', prodId), cleanProduct);
        await recordAuditLog(
          actionLabel || (existingProd ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED'),
          `Product:${cleanProduct.sku}`,
          `${cleanProduct.name} ($${cleanProduct.price}, Stock: ${cleanProduct.stock})`
        );
        if (cleanProduct.stock <= (cleanProduct.lowStockThreshold || 5)) {
          await pushNotification(
            'LOW_STOCK',
            `Low Stock Alert: ${cleanProduct.name}`,
            `SKU ${cleanProduct.sku} has ${cleanProduct.stock} units remaining.`
          );
        }
      } catch (error) {
        console.warn(`Firestore saveProduct sync error for ${prodId}:`, error);
      }
    }

    return cleanProduct;
  };

  // Bulk import products atomically (Persists to React state, localStorage, server disk, & Firestore)
  const importProductsBatch: StoreContextValue['importProductsBatch'] = async (items) => {
    if (!items || items.length === 0) return { count: 0 };

    // 1. Update React state immediately with deduplication
    setProducts((prev) => {
      const map = new Map<string, Product>();
      prev.forEach((p) => {
        if (p && p.id) map.set(p.id, p);
      });
      items.forEach((p) => {
        if (p && p.id) map.set(p.id, p);
      });
      const next = Array.from(map.values());
      try {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Persist to server disk storage immediately so refresh never loses them
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/catalog/products/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ products: items }),
      });
    } catch (err) {
      console.warn('Server catalog batch error:', err);
    }

    // 3. Extract and register any new categories from imported products
    const uniqueCategories = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
    const newCategoryObjects: Category[] = [];
    uniqueCategories.forEach((catName) => {
      const existing = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
      if (!existing) {
        const slug = sanitizeSlug(catName);
        const newCat: Category = {
          id: sanitizeDocId(`cat-${slug}`),
          name: catName,
          slug,
          description: `Curated collections for ${catName}.`,
          productCount: items.filter((i) => i.category.toLowerCase() === catName.toLowerCase()).length,
        };
        newCategoryObjects.push(newCat);
      }
    });

    if (newCategoryObjects.length > 0) {
      setCategories((prev) => [...prev, ...newCategoryObjects]);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
        await fetch('/api/catalog/categories/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ categories: newCategoryObjects }),
        });
      } catch {}
    }

    // 4. If logged in with admin privileges, sync to Firestore
    if (firebaseUser && isAdmin) {
      try {
        for (const prod of items) {
          try {
            await setDoc(doc(db, 'products', prod.id), prod);
          } catch {}
        }
      } catch (err) {
        console.warn('Firestore batch sync error:', err);
      }
    }

    return { count: items.length };
  };

  // Delete Product
  const removeProduct = async (productId: string) => {
    const target = products.find((p) => p.id === productId);
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== productId);
      try {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    // Remove from server disk storage
    (async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      fetch(`/api/catalog/products/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }).catch(() => {});
    })();

    if (firebaseUser && isAdmin) {
      try {
        await deleteDoc(doc(db, 'products', productId));
        await recordAuditLog(
          'PRODUCT_DELETED',
          `Product:${target?.sku || productId}`,
          `Deleted product ${target?.name || productId}`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
      }
    }
  };

  // Save or Create Category
  const saveCategory: StoreContextValue['saveCategory'] = async (input) => {
    const slug = sanitizeSlug(input.slug || input.name);
    const catId = input.id || sanitizeDocId(`cat-${slug}`);
    const newCat: Category = {
      id: catId,
      name: input.name.slice(0, 95),
      slug,
      description: (input.description || `Bespoke ${input.name} collection by Atelier Aurelia.`).slice(0, 580),
      seoTitle: (input.seoTitle || `${input.name} — ${settings.storeName}`).slice(0, 150),
      seoDescription: (input.seoDescription || `Explore ${input.name} handcrafted by ${settings.storeName}.`).slice(0, 310),
      productCount: input.productCount ?? products.filter((p) => p.category === input.name).length,
    };

    (async () => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      fetch('/api/catalog/categories/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ category: newCat }),
      }).catch(() => {});
    })();

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'categories', catId), newCat);
        await recordAuditLog('CATEGORY_SAVED', `Category:${newCat.slug}`, newCat.name);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `categories/${catId}`);
      }
    } else {
      setCategories((prev) => [newCat, ...prev.filter((c) => c.id !== catId)]);
    }
    return newCat;
  };

  // Inventory Adjustment
  const adjustInventory = async (productId: string, newStock: number, reason = 'Manual Adjustment') => {
    const target = products.find((p) => p.id === productId);
    if (!target) return;
    const clamped = Math.max(0, Math.round(newStock));
    await saveProduct(
      { ...target, stock: clamped },
      `INVENTORY_ADJUSTED (${reason}: ${target.stock} -> ${clamped})`
    );
  };

  // Order Status Update / Cancel (with Stock Restoration) / Refund
  const updateOrderState = async (
    orderId: string,
    status: OrderStatus,
    trackingNumber?: string
  ) => {
    const target = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!target) return;
    const wasAlreadyCancelledOrRefunded =
      target.status === 'CANCELLED' || target.status === 'REFUNDED';

    const paymentStatus =
      status === 'REFUNDED'
        ? 'REFUNDED'
        : status === 'CANCELLED' && target.paymentStatus === 'PAID'
        ? 'REFUND_PENDING'
        : status === 'DELIVERED'
        ? 'PAID'
        : target.paymentStatus;

    const updatedOrder: Order = {
      ...target,
      status,
      paymentStatus,
      ...(trackingNumber ? { trackingNumber: trackingNumber.slice(0, 110) } : {}),
      updatedAt: new Date().toISOString(),
    };

    // Restore inventory when an active order is cancelled or refunded for the first time
    if (
      !wasAlreadyCancelledOrRefunded &&
      (status === 'CANCELLED' || status === 'REFUNDED') &&
      target.notes
    ) {
      const match = /\[Items:\s*([^\]]+)\]/i.exec(target.notes);
      if (match && match[1]) {
        const pairs = match[1].split(',').map((s) => s.trim());
        for (const pair of pairs) {
          const [skuPart, qtyPart] = pair.split('x');
          const qty = Number(qtyPart || 0);
          const prod = products.find(
            (p) => p.sku.toLowerCase() === (skuPart || '').trim().toLowerCase()
          );
          if (prod && qty > 0) {
            await adjustInventory(
              prod.id,
              prod.stock + qty,
              `Restored from ${status} Order ${target.orderNumber}`
            );
          }
        }
      }
    }

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'orders', target.id), updatedOrder);
        await recordAuditLog(
          `ORDER_${status}`,
          `Order:${target.orderNumber}`,
          `Updated status from ${target.status} to ${status} (Payment: ${paymentStatus})`
        );
        if (status === 'REFUNDED') {
          await pushNotification(
            'REFUND',
            `Refund Recorded: ${target.orderNumber}`,
            `Order ${target.orderNumber} ($${target.total.toFixed(2)}) marked as REFUNDED for ${target.customerEmail}.`
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${target.id}`);
      }
    } else {
      setOrders((prev) => prev.map((o) => (o.id === target.id ? updatedOrder : o)));
    }
  };

  // Save Coupon
  const saveCoupon: StoreContextValue['saveCoupon'] = async (input) => {
    const coupId = input.id || sanitizeDocId(`coup-${input.code.toLowerCase()}`);
    const cleanCode = input.code.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 35) || 'PROMO20';
    const newCoupon: Coupon = {
      id: coupId,
      code: cleanCode,
      type: input.type,
      value: Math.max(0, Number(input.value)),
      minCartAmount: Number(input.minCartAmount ?? 100),
      maxDiscount: Number(input.maxDiscount ?? 500),
      ...(input.categoryFilter ? { categoryFilter: input.categoryFilter.slice(0, 90) } : {}),
      usageLimit: Math.round(Number(input.usageLimit ?? 100)),
      usedCount: Math.round(Number(input.usedCount ?? 0)),
      active: input.active ?? true,
      expiresAt: input.expiresAt || '2027-12-31T00:00:00.000Z',
      createdAt: input.createdAt || new Date().toISOString(),
    };

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'coupons', coupId), newCoupon);
        await recordAuditLog(
          'COUPON_SAVED',
          `Coupon:${cleanCode}`,
          `Type: ${newCoupon.type}, Value: ${newCoupon.value}`
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `coupons/${coupId}`);
      }
    } else {
      setCoupons((prev) => [newCoupon, ...prev.filter((c) => c.id !== coupId)]);
    }
    return newCoupon;
  };

  const deleteCouponById = async (couponId: string) => {
    if (firebaseUser && isAdmin) {
      try {
        await deleteDoc(doc(db, 'coupons', couponId));
        await recordAuditLog('COUPON_DELETED', `Coupon:${couponId}`, 'Removed promotional code');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `coupons/${couponId}`);
      }
    } else {
      setCoupons((prev) => prev.filter((c) => c.id !== couponId));
    }
  };

  // Moderate Review
  const moderateReview = async (reviewId: string, status: Review['status']) => {
    const target = reviews.find((r) => r.id === reviewId);
    if (!target) return;
    const updated: Review = { ...target, status };
    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'reviews', reviewId), updated);
        await recordAuditLog('REVIEW_MODERATED', `Review:${reviewId}`, `Set status to ${status}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `reviews/${reviewId}`);
      }
    } else {
      setReviews((prev) => prev.map((r) => (r.id === reviewId ? updated : r)));
    }
  };

  // Update Store Settings
  const updateStoreSettings = async (updated: Partial<StoreSettings>) => {
    const nextSettings: StoreSettings = {
      ...settings,
      ...updated,
      id: 'store_config',
      updatedAt: new Date().toISOString(),
    };
    // Always update local state immediately
    setSettings(nextSettings);
    try {
      localStorage.setItem('atelier_aurelia_store_settings', JSON.stringify(nextSettings));
    } catch {
      // ignore quota errors
    }
    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'settings', 'store_config'), nextSettings);
        await recordAuditLog('SETTINGS_UPDATED', 'StoreSettings', JSON.stringify(updated));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'settings/store_config');
      }
    }
    showToast('Store settings saved.');
  };

  // Create or Update Long-Running AI Task
  const createOrUpdateAITask: StoreContextValue['createOrUpdateAITask'] = async (taskInput) => {
    const existingTask = aiTasks.find((t) => t.id === taskInput.id);
    const now = new Date().toISOString();
    const taskRecord: AITask = {
      id: sanitizeDocId(taskInput.id),
      actorUid: firebaseUser?.uid || 'admin',
      name: taskInput.name.slice(0, 190),
      toolName: taskInput.toolName.slice(0, 95),
      status: taskInput.status || existingTask?.status || 'RUNNING',
      totalItems: Math.max(0, Math.round(taskInput.totalItems ?? existingTask?.totalItems ?? 1)),
      completedItems: Math.max(
        0,
        Math.round(taskInput.completedItems ?? existingTask?.completedItems ?? 0)
      ),
      failedItems: Math.max(0, Math.round(taskInput.failedItems ?? existingTask?.failedItems ?? 0)),
      ...(taskInput.summary ? { summary: taskInput.summary.slice(0, 1950) } : {}),
      createdAt: existingTask?.createdAt || now,
      updatedAt: now,
    };

    // Always update local reactive state immediately
    setAiTasks((prev) => {
      const exists = prev.some((t) => t.id === taskRecord.id);
      return exists
        ? prev.map((t) => (t.id === taskRecord.id ? taskRecord : t))
        : [taskRecord, ...prev];
    });

    if (firebaseUser && isAdmin) {
      try {
        await setDoc(doc(db, 'ai_tasks', taskRecord.id), taskRecord);
      } catch (error) {
        console.warn(`Firestore createOrUpdateAITask sync error for ${taskRecord.id}:`, error);
      }
    }
    return taskRecord;
  };

  const cancelAITask = async (taskId: string) => {
    const target = aiTasks.find((t) => t.id === taskId);
    if (!target) return;
    await createOrUpdateAITask({
      id: target.id,
      name: target.name,
      toolName: target.toolName,
      status: 'CANCELLED',
      totalItems: target.totalItems,
      completedItems: target.completedItems,
      failedItems: target.failedItems,
      summary: `${target.summary ? `${target.summary} · ` : ''}Cancelled by administrator.`,
    });
    await recordAuditLog('AI_TASK_CANCELLED', `AITask:${target.id}`, target.name);
    showToast(`AI task "${target.name}" cancelled.`);
  };

  const markNotificationRead = async (notificationId: string) => {
    const target = notifications.find((n) => n.id === notificationId);
    if (!target) return;
    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'notifications', notificationId), { read: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
      }
    } else {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    }
  };

  return (
    <StoreContext.Provider
      value={{
        firebaseUser,
        userProfile,
        authReady,
        isAdmin,
        signInWithGoogle,
        signOut,
        products,
        categories,
        coupons,
        reviews,
        orders,
        auditLogs,
        aiTasks,
        notifications,
        settings,
        cart,
        wishlist,
        appliedCoupon,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        applyCouponCode,
        removeCoupon,
        toggleWishlist,
        placeOrder,
        verifyManualPayment,
        updateShippingQuote,
        acceptOrRejectShippingQuote,
        submitReview,
        saveProduct,
        importProductsBatch,
        removeProduct,
        saveCategory,
        adjustInventory,
        updateOrderState,
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
        toastMessage,
        showToast,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
