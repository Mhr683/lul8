import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ShoppingBag,
  Heart,
  User,
  ArrowRight,
  Star,
  Check,
  Minus,
  Plus,
  Trash2,
  ShieldCheck,
  Truck,
  RotateCcw,
  SlidersHorizontal,
  X,
  Mail,
  Printer,
  Copy,
  ExternalLink,
  CreditCard,
  Smartphone,
  Calendar,
  Building2,
  HelpCircle,
  Info,
  Tag,
  ChevronDown,
  ChevronUp,
  Lock,
  MapPin,
  ArrowLeft,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Package,
  Headphones,
  MessageCircle,
  Phone,
  Menu,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { auth } from '../lib/firebase';
import { Product, PaymentMethod, Order } from '../types/store';
import { ProductImage } from './ProductImage';
import { GlobalHeaderSearch } from './GlobalHeaderSearch';
import { HeaderNavDropdowns } from './HeaderNavDropdowns';
import { MAIN_NAV_SECTIONS } from '../data/categoryNavigation';
import { GoogleMapsAddressDetector, DetectedAddressPayload } from './GoogleMapsAddressDetector';
import { CustomerHelplineDrawer } from './CustomerHelplineDrawer';
import { PWAInstallButton } from './PWAInstallButton';
import { PWAInstallModal } from './PWAInstallModal';
import { HERO_IMAGE_PATH } from '../data/seedData';
import { SHIPPING_METHODS, calculateShippingFee, formatDualPrice, formatPKR, DEFAULT_STATIC_USD_TO_PKR_RATE } from '../services/abstractions';
import { ShippingCalculationService, ShippingCalculationResponse } from '../services/shippingService';
import {
  ALL_WORLD_COUNTRIES,
  getStatesForCountry,
  getCitiesForState,
  getPostalRuleForCountry,
  getSuggestedPakistanPostalCode,
  getTehsilsForDistrict,
  verifyAddressAndIdentity,
  verifyPaymentInstrument,
  detectCardBrand,
} from '../services/addressAndPaymentVerification';

type StoreSubView =
  | 'HOME'
  | 'CATALOG'
  | 'PRODUCT_DETAIL'
  | 'CHECKOUT'
  | 'ACCOUNT'
  | 'WISHLIST';

interface StorefrontViewProps {
  onOpenAdmin: (tab?: string, openNewProduct?: boolean) => void;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({ onOpenAdmin }) => {
  const {
    products,
    categories,
    reviews,
    orders,
    cart,
    wishlist,
    appliedCoupon,
    settings,
    firebaseUser,
    userProfile,
    isAdmin,
    signInWithGoogle,
    signOut,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    applyCouponCode,
    removeCoupon,
    toggleWishlist,
    placeOrder,
    acceptOrRejectShippingQuote,
    submitReview,
    showToast,
  } = useStore();

  const [subView, setSubView] = useState<StoreSubView>('HOME');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [isHelplineOpen, setIsHelplineOpen] = useState(false);
  const [helplineInitialTab, setHelplineInitialTab] = useState<'AI_CHAT' | 'WHATSAPP' | 'EMAIL' | 'PHONE'>('AI_CHAT');
  const [helplineOrderNumber, setHelplineOrderNumber] = useState<string | undefined>(undefined);

  // Dynamic SEO Metadata & Product Schema JSON-LD Synchronization
  React.useEffect(() => {
    if (subView === 'PRODUCT_DETAIL' && selectedProduct) {
      document.title = selectedProduct.seoTitle || `${selectedProduct.name} | ${settings.storeName}`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute(
          'content',
          selectedProduct.seoDescription || selectedProduct.shortDescription || selectedProduct.name
        );
      }
      let ldScript = document.getElementById('dynamic-product-jsonld') as HTMLScriptElement | null;
      if (!ldScript) {
        ldScript = document.createElement('script');
        ldScript.id = 'dynamic-product-jsonld';
        ldScript.type = 'application/ld+json';
        document.head.appendChild(ldScript);
      }
      ldScript.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: selectedProduct.name,
        sku: selectedProduct.sku,
        description: selectedProduct.description || selectedProduct.shortDescription,
        brand: { '@type': 'Brand', name: selectedProduct.brand },
        offers: {
          '@type': 'Offer',
          price: selectedProduct.price,
          priceCurrency: 'USD',
          availability:
            selectedProduct.stock > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
        },
      });
    } else {
      document.title = `${settings.storeName} — Bespoke Luxury Goods & AI-Operated Commerce`;
    }
  }, [subView, selectedProduct, settings.storeName]);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeSubcategory, setActiveSubcategory] = useState<string>('ALL');
  const [activeCollection, setActiveCollection] = useState<'ALL' | 'NEW_ARRIVALS' | 'BEST_SELLERS' | 'OFFERS'>('ALL');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpandedSection, setMobileExpandedSection] = useState<string | null>(null);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [activeBrand, setActiveBrand] = useState<string>('ALL');
  const [priceCeiling, setPriceCeiling] = useState<number>(500000);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'RELEVANCE' | 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'RATING'>('RELEVANCE');

  // Product Detail state
  const [selectedVariant, setSelectedVariant] = useState<string>('Obsidian / Standard');
  const [detailQty, setDetailQty] = useState<number>(1);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(['prod-01', 'prod-02', 'prod-03']);

  // Review Form state
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');

  // Coupon Input in Cart
  const [couponInput, setCouponInput] = useState('');
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);

  // Multi-Step Checkout & Anti-Fraud Verification State (All 250+ World Countries, 5,000+ States, 150,000+ Cities)
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [customerName, setCustomerName] = useState(userProfile?.name || 'Clara Vance');
  const [customerEmail, setCustomerEmail] = useState(userProfile?.email || 'clara@zurich-arch.ch');
  const [countryIso, setCountryIso] = useState('PK');
  const [country, setCountry] = useState('Pakistan');
  const [stateIso, setStateIso] = useState('PB');
  const [stateProvince, setStateProvince] = useState('Punjab');
  const [district, setDistrict] = useState('Lahore');
  const [tehsil, setTehsil] = useState('Model Town');
  const [customTehsil, setCustomTehsil] = useState('');
  const [isCustomTehsil, setIsCustomTehsil] = useState(false);
  const city = district;
  const setCity = setDistrict;
  const [streetAddress, setStreetAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [customerPhone, setCustomerPhone] = useState(userProfile?.phone || '');
  const [shippingMethodId, setShippingMethodId] = useState(SHIPPING_METHODS[0].id);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [paymentSubMethod, setPaymentSubMethod] = useState<'RAAST' | 'RAAST_SWIFT' | 'NAYAPAY' | 'BANK'>('RAAST');

  // Customer TID & Manual Transfer Submission States
  const [bankAccountName, setBankAccountName] = useState('Meezan Bank');
  const [walletMobileNumber, setWalletMobileNumber] = useState('');
  const [walletAccountTitle, setWalletAccountTitle] = useState('');
  const [wireReferenceNumber, setWireReferenceNumber] = useState('');
  const [checkoutErrorBanner, setCheckoutErrorBanner] = useState<string | null>(null);

  const [orderNotes, setOrderNotes] = useState('');
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);
  const [confirmedOrderAccessToken, setConfirmedOrderAccessToken] = useState<string | null>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<any | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingOrderInput, setTrackingOrderInput] = useState('');
  const [trackingTokenInput, setTrackingTokenInput] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [selectedGmailOrder, setSelectedGmailOrder] = useState<Order | null>(null);
  const [isGmailModalOpen, setIsGmailModalOpen] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [isResendingReceipt, setIsResendingReceipt] = useState(false);

  const handleTrackOrder = async (orderNum: string, tokenStr?: string) => {
    if (!orderNum || !orderNum.trim()) return;
    setTrackingLoading(true);
    setTrackingError(null);
    setTrackedOrder(null);
    try {
      const qToken = tokenStr || confirmedOrderAccessToken || '';
      const url = `/api/orders/track?order=${encodeURIComponent(orderNum.trim())}${qToken ? `&token=${encodeURIComponent(qToken)}` : ''}`;
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.success && data.order) {
        setTrackedOrder(data.order);
      } else {
        setTrackingError(data.error || 'Unable to locate order tracking details.');
      }
    } catch {
      setTrackingError('Network error while looking up order tracking details.');
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const orderParam = params.get('order');
      const tokenParam = params.get('token');
      if (orderParam) {
        setTrackingOrderInput(orderParam);
        if (tokenParam) setTrackingTokenInput(tokenParam);
        setIsTrackingModalOpen(true);
        handleTrackOrder(orderParam, tokenParam || '');
      }
    }
  }, []);

  const openGmailReceiptModal = (order: Order) => {
    setSelectedGmailOrder(order);
    setIsGmailModalOpen(true);
    setResendStatus(null);
  };

  const handleResendReceipt = async (orderNumber: string, toEmail: string) => {
    setIsResendingReceipt(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/email/resend-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orderNumber, toEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendStatus(`Receipt email successfully re-dispatched to ${toEmail}!`);
      } else {
        setResendStatus(data.error || 'Failed to re-dispatch email.');
      }
    } catch {
      setResendStatus('Failed to reach email server.');
    } finally {
      setIsResendingReceipt(false);
    }
  };

  const selectedCountryRecord = useMemo(
    () => ALL_WORLD_COUNTRIES.find((c) => c.isoCode === countryIso) || ALL_WORLD_COUNTRIES[0],
    [countryIso]
  );

  const isNationalPakistan = selectedCountryRecord.isNational;

  // Checkout Payment Gateways: Only Cash on Delivery & Manual Bank / NayaPay / Raast with TID
  const isCodAvailable = Boolean(isNationalPakistan && (settings.codEnabled ?? true));
  const isRaastAvailable = Boolean((settings.raastEnabled ?? true) || isNationalPakistan);
  const isNayaPayAvailable = Boolean(settings.nayapayEnabled ?? true);
  const isManualQuoteAvailable = Boolean(!isNationalPakistan && settings.allowInternationalManualQuotes);

  const availableStates = useMemo(
    () => getStatesForCountry(countryIso),
    [countryIso]
  );

  const availableDistricts = useMemo(
    () => getCitiesForState(countryIso, stateIso),
    [countryIso, stateIso]
  );
  const availableCities = availableDistricts;

  const availableTehsils = useMemo(
    () => getTehsilsForDistrict(district),
    [district]
  );

  const effectiveTehsil = isCustomTehsil && customTehsil.trim() ? customTehsil.trim() : tehsil;

  const postalRule = useMemo(
    () => getPostalRuleForCountry(countryIso),
    [countryIso]
  );

  const suggestedPakistanPostalCode = useMemo(() => {
    if (!isNationalPakistan) return null;
    return getSuggestedPakistanPostalCode(effectiveTehsil) || getSuggestedPakistanPostalCode(district);
  }, [isNationalPakistan, effectiveTehsil, district]);

  const handleDistrictChange = (nextDistrict: string) => {
    setDistrict(nextDistrict);
    const tehsils = getTehsilsForDistrict(nextDistrict);
    if (tehsils.length > 0) {
      setTehsil(tehsils[0]);
      setIsCustomTehsil(false);
      setCustomTehsil('');
    }
  };

  const handleSelectCountryByIso = (nextIso: string) => {
    const foundCountry =
      ALL_WORLD_COUNTRIES.find((c) => c.isoCode === nextIso) || ALL_WORLD_COUNTRIES[0];
    setCountryIso(foundCountry.isoCode);
    setCountry(foundCountry.name);

    const states = getStatesForCountry(foundCountry.isoCode);
    const firstState = states[0];
    const nextStateIso = firstState?.isoCode || 'CENTRAL';
    const nextStateName = firstState?.name || foundCountry.name;
    setStateIso(nextStateIso);
    setStateProvince(nextStateName);

    const districts = getCitiesForState(foundCountry.isoCode, nextStateIso);
    const defaultDistrict = districts[0]?.name || nextStateName;
    setDistrict(defaultDistrict);
    const tehsils = getTehsilsForDistrict(defaultDistrict);
    setTehsil(tehsils[0] || 'Center');
    setIsCustomTehsil(false);
    setCustomTehsil('');

    const initialPostal = foundCountry.isNational
      ? getSuggestedPakistanPostalCode(tehsils[0] || defaultDistrict) || getSuggestedPakistanPostalCode(defaultDistrict) || ''
      : '';
    setPostalCode(initialPostal);
    setCustomerPhone(userProfile?.phone || '');
  };

  const handleAddressAutoDetected = (payload: DetectedAddressPayload) => {
    // 1. Synchronize Country
    let currentCountryIso = countryIso;
    if (payload.countryIso) {
      const targetIso = payload.countryIso.toUpperCase();
      const foundCountry =
        ALL_WORLD_COUNTRIES.find((c) => c.isoCode === targetIso) ||
        ALL_WORLD_COUNTRIES.find(
          (c) => c.name.toLowerCase() === payload.countryName?.toLowerCase()
        );
      if (foundCountry) {
        currentCountryIso = foundCountry.isoCode;
        if (foundCountry.isoCode !== countryIso) {
          setCountryIso(foundCountry.isoCode);
          setCountry(foundCountry.name);
        }
      }
    }

    // 2. Synchronize State / Province
    const availableSts = getStatesForCountry(currentCountryIso);
    let targetStateIso = stateIso;
    let targetStateName = stateProvince;

    if (payload.stateProvince && availableSts.length > 0) {
      const stQuery = payload.stateProvince.toLowerCase().trim();
      const matchedState = availableSts.find(
        (s) =>
          s.name.toLowerCase() === stQuery ||
          stQuery.includes(s.name.toLowerCase()) ||
          s.name.toLowerCase().includes(stQuery) ||
          s.isoCode.toLowerCase() === stQuery
      );
      if (matchedState) {
        targetStateIso = matchedState.isoCode;
        targetStateName = matchedState.name;
        setStateIso(matchedState.isoCode);
        setStateProvince(matchedState.name);
      } else {
        targetStateName = payload.stateProvince;
        setStateProvince(payload.stateProvince);
      }
    }

    // 3. Synchronize District / City & Tehsil
    const curDistricts = getCitiesForState(currentCountryIso, targetStateIso);
    let finalDistrict = district;

    if (payload.district || payload.cityDistrict) {
      const rawCity = (payload.district || payload.cityDistrict || '').trim();
      const cleanTarget = rawCity
        .replace(/\b(District|Tehsil|City|Division|Sub-District)\b/gi, '')
        .trim();

      const matchedDistrict = curDistricts.find(
        (d) =>
          d.name.toLowerCase() === cleanTarget.toLowerCase() ||
          cleanTarget.toLowerCase().includes(d.name.toLowerCase()) ||
          d.name.toLowerCase().includes(cleanTarget.toLowerCase())
      );

      finalDistrict = matchedDistrict ? matchedDistrict.name : (cleanTarget || rawCity);
      setDistrict(finalDistrict);

      const tehsils = getTehsilsForDistrict(finalDistrict);
      if (tehsils.length > 0) {
        const matchedTehsil = tehsils.find(
          (t) =>
            payload.streetAddress?.toLowerCase().includes(t.toLowerCase()) ||
            payload.formattedAddress?.toLowerCase().includes(t.toLowerCase())
        );
        setTehsil(matchedTehsil || tehsils[0]);
        setIsCustomTehsil(false);
      }
    }

    // 4. Synchronize Postal / ZIP Code (Guaranteed Auto-Fill!)
    const autoPostal =
      payload.postalCode?.trim() ||
      getSuggestedPakistanPostalCode(finalDistrict) ||
      (finalDistrict ? getSuggestedPakistanPostalCode(getTehsilsForDistrict(finalDistrict)[0]) : null) ||
      '';

    if (autoPostal) {
      setPostalCode(autoPostal);
    }

    // 5. Synchronize Complete Street Address
    if (payload.streetAddress && payload.streetAddress.trim()) {
      setStreetAddress(payload.streetAddress.trim());
    } else if (payload.formattedAddress && payload.formattedAddress.trim()) {
      setStreetAddress(payload.formattedAddress.trim());
    }
  };

  // Ensure active payment method is strictly valid and configured for destination country
  React.useEffect(() => {
    const isCurrentValid =
      (paymentMethod === 'COD' && isCodAvailable) ||
      ((paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER') && isRaastAvailable) ||
      (paymentMethod === 'NAYAPAY' && isNayaPayAvailable) ||
      (paymentMethod === 'MANUAL_QUOTE' && isManualQuoteAvailable);

    if (!isCurrentValid) {
      if (isNationalPakistan) {
        if (isCodAvailable) {
          setPaymentMethod('COD');
        } else if (isRaastAvailable) {
          setPaymentMethod('RAAST_IBAN');
          setPaymentSubMethod('RAAST');
        } else if (isNayaPayAvailable) {
          setPaymentMethod('NAYAPAY');
          setPaymentSubMethod('NAYAPAY');
        }
      } else {
        if (isManualQuoteAvailable) {
          setPaymentMethod('MANUAL_QUOTE');
        } else if (isRaastAvailable) {
          setPaymentMethod('RAAST_IBAN');
          setPaymentSubMethod('RAAST_SWIFT');
        }
      }
    }
  }, [
    isNationalPakistan,
    paymentMethod,
    isCodAvailable,
    isRaastAvailable,
    isNayaPayAvailable,
    isManualQuoteAvailable,
  ]);

  const addressVerification = useMemo(
    () =>
      verifyAddressAndIdentity({
        countryIsoCode: countryIso,
        countryName: country,
        stateName: stateProvince,
        cityName: district,
        districtName: district,
        tehsilName: effectiveTehsil,
        streetAddress,
        postalCode,
        phone: customerPhone,
        email: customerEmail || userProfile?.email || '',
      }),
    [
      countryIso,
      country,
      stateProvince,
      district,
      effectiveTehsil,
      streetAddress,
      postalCode,
      customerPhone,
      customerEmail,
      userProfile?.email,
    ]
  );

  const paymentVerification = useMemo(
    () =>
      verifyPaymentInstrument({
        isNationalPakistan,
        paymentMethod,
        paymentSubMethod,
        walletMobileNumber,
        walletAccountTitle,
        wireReferenceNumber,
        bankAccountName,
      }),
    [
      isNationalPakistan,
      paymentMethod,
      paymentSubMethod,
      walletMobileNumber,
      walletAccountTitle,
      wireReferenceNumber,
      bankAccountName,
    ]
  );

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => p.status === 'ACTIVE')
      .filter((p) => {
        // Category filter
        if (activeCategory !== 'ALL') {
          const catNorm = activeCategory.trim().toLowerCase();
          const pCatNorm = (p.category || '').trim().toLowerCase();
          const pSubNorm = (p.subcategory || '').trim().toLowerCase();

          const matchExact = pCatNorm === catNorm || pSubNorm === catNorm;
          const matchDepartment =
            (catNorm === 'men' && (pCatNorm === 'men' || pSubNorm.includes('men') || (p.seoKeywords || '').toLowerCase().includes('men'))) ||
            (catNorm === 'women' && (pCatNorm === 'women' || pSubNorm.includes('women') || (p.seoKeywords || '').toLowerCase().includes('women'))) ||
            (catNorm === 'children' && (pCatNorm === 'children' || pSubNorm.includes('kid') || pSubNorm.includes('boy') || pSubNorm.includes('girl') || pSubNorm.includes('baby') || (p.seoKeywords || '').toLowerCase().includes('kid')));

          if (!matchExact && !matchDepartment) return false;
        }

        // Subcategory filter
        if (activeSubcategory !== 'ALL') {
          const subNorm = activeSubcategory.trim().toLowerCase();
          const pSubNorm = (p.subcategory || '').trim().toLowerCase();
          const pCatNorm = (p.category || '').trim().toLowerCase();
          const pNameNorm = p.name.toLowerCase();
          const matchSub = pSubNorm.includes(subNorm) || subNorm.includes(pSubNorm) || pCatNorm === subNorm || pNameNorm.includes(subNorm);
          if (!matchSub) return false;
        }

        // Collection filter
        if (activeCollection === 'NEW_ARRIVALS' && !p.newArrival) return false;
        if (activeCollection === 'BEST_SELLERS' && !p.bestSeller) return false;
        if (activeCollection === 'OFFERS' && !(p.compareAtPrice && p.compareAtPrice > p.price)) return false;

        // Brand filter
        if (activeBrand !== 'ALL' && p.brand.trim().toLowerCase() !== activeBrand.trim().toLowerCase()) return false;
        if (p.price > priceCeiling) return false;
        if (inStockOnly && p.stock <= 0) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const tokens = q.split(/\s+/).filter(Boolean);
          const fullText = `${p.name} ${p.category} ${p.subcategory || ''} ${p.brand} ${p.sku} ${p.shortDescription || ''} ${p.description || ''} ${p.seoKeywords || ''}`.toLowerCase();

          // Smart synonyms
          if ((q.includes('kid') || q.includes('child') || q.includes('bach')) && (p.category.toLowerCase() === 'children' || (p.subcategory || '').toLowerCase().includes('kid'))) {
            return true;
          }
          if ((q.includes('perfume') || q.includes('fragrance') || q.includes('scent')) && p.category.toLowerCase() === 'fragrance') {
            return true;
          }
          if ((q.includes('watch') || q.includes('ghari')) && (p.category.toLowerCase() === 'watches' || p.category.toLowerCase() === 'horology')) {
            return true;
          }

          return tokens.every((token) => fullText.includes(token));
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'PRICE_ASC') return a.price - b.price;
        if (sortBy === 'PRICE_DESC') return b.price - a.price;
        if (sortBy === 'RATING') return (b.rating || 5) - (a.rating || 5);
        if (sortBy === 'NEWEST') return b.createdAt.localeCompare(a.createdAt);
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      });
  }, [products, activeCategory, activeSubcategory, activeCollection, activeBrand, priceCeiling, inStockOnly, searchQuery, sortBy]);

  const brands = useMemo(() => {
    const set = new Set<string>(products.map((p) => p.brand));
    return Array.from(set);
  }, [products]);

  // Cart Calculations
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const discountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.type === 'PERCENTAGE') {
      const raw = (cartSubtotal * appliedCoupon.value) / 100;
      return appliedCoupon.maxDiscount ? Math.min(raw, appliedCoupon.maxDiscount) : raw;
    }
    if (appliedCoupon.type === 'FIXED') {
      return Math.min(cartSubtotal, appliedCoupon.value);
    }
    return 0;
  }, [cartSubtotal, appliedCoupon]);

  // Live Country & Courier Shipping Calculation
  const liveShippingCalc = useMemo<ShippingCalculationResponse>(() => {
    return ShippingCalculationService.calculate({
      destinationCountryIso: countryIso,
      items: cart,
      catalogProducts: products,
      settings,
      selectedCourier: shippingMethodId,
      hasFreeShippingCoupon: appliedCoupon?.type === 'FREE_SHIPPING',
    });
  }, [countryIso, cart, products, settings, shippingMethodId, appliedCoupon]);

  const isQuoteFlow = liveShippingCalc.requiresManualQuote || paymentMethod === 'MANUAL_QUOTE';

  // Shipping Fee in USD for calculation
  const shippingFeeUsd = useMemo(() => {
    if (isQuoteFlow) return 0;
    const rate = settings.usdToPkrRate || DEFAULT_STATIC_USD_TO_PKR_RATE;
    return Number((liveShippingCalc.finalShippingFee / rate).toFixed(2));
  }, [isQuoteFlow, liveShippingCalc.finalShippingFee, settings.usdToPkrRate]);

  // Tax: Sales tax applies to domestic Pakistan orders; international is export (0% PK sales tax, customs handled at destination DAP)
  const taxAmount = useMemo(() => {
    if (!isNationalPakistan) return 0;
    const taxableUsd = Math.max(0, cartSubtotal - discountAmount);
    return Number(((taxableUsd * (settings.taxRate || 0)) / 100).toFixed(2));
  }, [isNationalPakistan, cartSubtotal, discountAmount, settings.taxRate]);

  const grandTotal = Number(
    (Math.max(0, cartSubtotal - discountAmount) + taxAmount + shippingFeeUsd).toFixed(2)
  );

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setDetailQty(1);
    setSelectedVariant(
      product.category === 'Horology'
        ? '40mm Titanium / Sapphire'
        : product.category === 'Fragrance'
        ? '100ml Extrait Flacon'
        : 'Obsidian / Brushed Brass'
    );
    setRecentlyViewedIds((prev) => [
      product.id,
      ...prev.filter((id) => id !== product.id).slice(0, 3),
    ]);
    setSubView('PRODUCT_DETAIL');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmAddress = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!addressVerification.isFullyVerified) {
      setCheckoutErrorBanner(
        'Address Verification Incomplete: Please fill all required address fields (Receiver Phone, Complete Street Address, Tehsil, Postal Code) before proceeding to payment.'
      );
      return;
    }
    setCheckoutErrorBanner(null);
    setCheckoutStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    // If on Step 1, submitting confirms the address and transitions to Step 2
    if (checkoutStep === 1) {
      handleConfirmAddress(e);
      return;
    }

    if (!addressVerification.isFullyVerified) {
      setCheckoutErrorBanner(
        'Address Verification Failed: Please return to Step 1 and verify all delivery address fields.'
      );
      setCheckoutStep(1);
      return;
    }

    if (!paymentVerification.valid) {
      setCheckoutErrorBanner(paymentVerification.message);
      return;
    }

    setCheckoutErrorBanner(null);

    // Direct submit for Cash on Delivery or Manual Transfer with TID (stays PENDING_VERIFICATION)
    setIsSubmittingOrder(true);
    try {
      const fullAddress = `[VERIFIED ${isNationalPakistan ? 'NATIONAL-PK' : 'INTERNATIONAL'}] ${streetAddress}, ${effectiveTehsil ? `Tehsil: ${effectiveTehsil}, ` : ''}District: ${district}, ${stateProvince}, ${postalCode}, ${country} (Tel: ${customerPhone})`;
      const isCod = paymentMethod === 'COD';
      const effectiveTid = isCod
        ? 'COD_DOORSTEP'
        : wireReferenceNumber.trim();
      const paymentAuditNote = `${orderNotes ? `${orderNotes} | ` : ''}[${isCod ? 'Cash on Delivery (Courier Doorstep Handover)' : `Manual Transfer · TID: ${effectiveTid}${walletAccountTitle ? ` · Title: ${walletAccountTitle}` : ''}${walletMobileNumber ? ` · Account: ${walletMobileNumber}` : ''}`} · Status: PENDING_VERIFICATION]`;
      const proofSummary = isCod
        ? 'Cash on Delivery at Destination Address'
        : `Manual ${paymentMethod === 'NAYAPAY' ? 'NayaPay' : 'Bank/RAAST'} Transfer · TID: ${effectiveTid}`;

      const order = await placeOrder({
        customerName: customerName || userProfile?.name || 'Atelier Guest',
        customerEmail: customerEmail || userProfile?.email || 'guest@atelieraurelia.com',
        customerPhone,
        destCountryIso: countryIso,
        shippingAddressSummary: fullAddress,
        district,
        tehsil: effectiveTehsil,
        shippingMethodId: liveShippingCalc.carrier,
        shippingFee: liveShippingCalc.finalShippingFee,
        paymentMethod,
        paymentSubMethod,
        paymentReference: effectiveTid,
        paymentProofDetails: proofSummary,
        notes: paymentAuditNote,
        isQuoteRequest: isQuoteFlow,
        directAutoDebit: false,
      });
      setConfirmedOrderNumber(order.orderNumber);
      if (order.orderAccessToken) {
        setConfirmedOrderAccessToken(order.orderAccessToken);
      }
      setCheckoutStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submitErr: any) {
      setCheckoutErrorBanner(submitErr?.message || 'Failed to place order. Please review your details.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !reviewComment.trim()) return;
    await submitReview({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      rating: reviewRating,
      title: reviewTitle || 'Exceptional Craftsmanship',
      comment: reviewComment,
    });
    setReviewTitle('');
    setReviewComment('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBFBF9] text-[#141413]">
      {/* Slim Announcement Bar with 24/7 Helpline */}
      <div className="bg-[#141413] text-[#FBFBF9] text-xs py-2 px-6 flex flex-wrap items-center justify-between gap-2 tracking-wide">
        <span className="truncate">
          Complimentary Insured Courier on Orders Above PKR {(settings.domesticFreeShippingThreshold || 10000).toLocaleString()} · Code{' '}
          <strong className="font-mono font-medium text-amber-300">ATELIER15</strong>
        </span>
        <div className="flex items-center gap-3 text-[11px] shrink-0">
          <button
            type="button"
            onClick={() => {
              setHelplineInitialTab('AI_CHAT');
              setIsHelplineOpen(true);
            }}
            className="text-white/80 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <Headphones className="w-3 h-3 text-emerald-400" />
            <span>24/7 AI Concierge</span>
          </button>
          <span className="text-white/30">|</span>
          <button
            type="button"
            onClick={() => {
              setHelplineInitialTab('WHATSAPP');
              setIsHelplineOpen(true);
            }}
            className="text-emerald-300 hover:text-emerald-200 font-medium flex items-center gap-1 cursor-pointer"
          >
            <MessageCircle className="w-3 h-3 text-emerald-400" />
            <span>WhatsApp: {settings.helplineWhatsAppFormatted || '+92 300 8472911'}</span>
          </button>
        </div>
      </div>

      {/* Top Bar Contract: Zone 1 Brand Wordmark | Zone 2 Dropdown Nav Links | Zone 3 Actions */}
      <header className="sticky top-0 z-30 bg-[#FBFBF9]/95 backdrop-blur-md border-b border-black/[0.07]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
          {/* Mobile Menu Hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 text-neutral-700 hover:text-black cursor-pointer"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Zone 1: Single Text Element Brand Wordmark */}
          <button
            onClick={() => {
              setActiveCategory('ALL');
              setActiveSubcategory('ALL');
              setActiveCollection('ALL');
              setSubView('HOME');
            }}
            className="text-xl sm:text-2xl font-display font-semibold tracking-tight text-[#141413] whitespace-nowrap shrink-0 cursor-pointer"
          >
            {settings.storeName}
          </button>

          {/* Zone 2: Clean Typography Nav Links with Video-Styled Dropdowns */}
          <nav className="hidden md:flex items-center">
            <HeaderNavDropdowns
              activeCategory={activeCategory}
              activeSubcategory={activeSubcategory}
              activeCollection={activeCollection}
              subView={subView}
              onSelectCategory={(cat, subcat, col) => {
                setActiveCategory(cat);
                setActiveSubcategory(subcat || 'ALL');
                setActiveCollection((col as any) || 'ALL');
                setSearchQuery('');
                setSubView('CATALOG');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNavigateHome={() => {
                setActiveCategory('ALL');
                setActiveSubcategory('ALL');
                setActiveCollection('ALL');
                setSubView('HOME');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNavigateOffers={() => {
                setActiveCategory('ALL');
                setActiveSubcategory('ALL');
                setActiveCollection('OFFERS');
                setSubView('CATALOG');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenTrackOrder={() => {
                setHelplineInitialTab('AI_CHAT');
                setIsHelplineOpen(true);
              }}
              onOpenContact={() => {
                setHelplineInitialTab('WHATSAPP');
                setIsHelplineOpen(true);
              }}
              onOpenAbout={() => setAboutModalOpen(true)}
            />
          </nav>

          {/* Video-matched "Track an order" outline pill button */}
          <button
            type="button"
            onClick={() => {
              setHelplineInitialTab('AI_CHAT');
              setIsHelplineOpen(true);
            }}
            className="hidden xl:inline-flex items-center px-3.5 py-1.5 border border-neutral-300 rounded-full text-xs font-medium text-neutral-800 hover:border-black hover:text-black transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
          >
            Track an order
          </button>

          {/* Zone 2.5: Global Search Component (Find items by name, category, or description) */}
          <div className="flex-1 max-w-xs md:max-w-sm lg:max-w-md mx-2 hidden sm:block">
            <GlobalHeaderSearch
              products={products}
              categories={categories}
              onSelectProduct={handleSelectProduct}
              onViewAllResults={(q, cat) => {
                setSearchQuery(q);
                if (cat) setActiveCategory(cat);
                setSubView('CATALOG');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>

          {/* Zone 3: Primary Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Universal PWA Install Button for PC, Laptop, Android & iPhone */}
            <PWAInstallButton variant="header" />

            {/* 24/7 Helpline & Concierge Button */}
            <button
              type="button"
              onClick={() => {
                setHelplineInitialTab('AI_CHAT');
                setIsHelplineOpen(true);
              }}
              className="px-2.5 sm:px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="24/7 Client Helpline (AI Chat, WhatsApp, Email)"
            >
              <Headphones className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="hidden md:inline">Helpline</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </button>

            <button
              onClick={() => setSubView('WISHLIST')}
              aria-label="Wishlist"
              className="p-2 text-[#575653] hover:text-[#141413] transition-colors relative cursor-pointer"
            >
              <Heart className="w-5 h-5 stroke-[1.5]" />
              {wishlist.length > 0 && (
                <span className="ml-1 text-xs font-mono tabular-nums text-[#141413]">
                  ({wishlist.length})
                </span>
              )}
            </button>

            <button
              onClick={() => setCartDrawerOpen(true)}
              className="px-3.5 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium flex items-center gap-2 hover:bg-[#2A2A28] transition-colors whitespace-nowrap cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 stroke-[1.5]" />
              <span>Bag</span>
              <span className="font-mono tabular-nums">({cartCount})</span>
            </button>

            <button
              onClick={() => onOpenAdmin('DASHBOARD')}
              className="px-3 py-2 border border-[#141413] text-[#141413] text-xs font-medium hover:bg-[#141413] hover:text-[#FBFBF9] transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
              title="Full Admin Console"
            >
              <User className="w-3.5 h-3.5" />
              <span>{firebaseUser ? userProfile?.name.split(' ')[0] : 'Account'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="sm:hidden px-4 py-2 border-t border-black/[0.05] bg-[#FBFBF9] flex items-center gap-2">
          <div className="flex-1">
            <GlobalHeaderSearch
              products={products}
              categories={categories}
              onSelectProduct={handleSelectProduct}
              onViewAllResults={(q, cat) => {
                setSearchQuery(q);
                if (cat) setActiveCategory(cat);
                setSubView('CATALOG');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Navigation Drawer with Accordion Sections */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-full max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 overflow-y-auto">
            <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
              <span className="font-display font-semibold text-lg">{settings.storeName}</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-neutral-500 hover:text-black cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('ALL');
                  setActiveSubcategory('ALL');
                  setActiveCollection('ALL');
                  setSubView('HOME');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-black"
              >
                Home
              </button>

              {MAIN_NAV_SECTIONS.map((section) => {
                const isExpanded = mobileExpandedSection === section.id;
                return (
                  <div key={section.id} className="border-b border-neutral-100 pb-2">
                    <button
                      type="button"
                      onClick={() => setMobileExpandedSection(isExpanded ? null : section.id)}
                      className="w-full flex items-center justify-between py-2 px-3 text-sm font-semibold text-neutral-800 hover:text-black"
                    >
                      <span>{section.label}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="pl-4 pr-2 py-1 space-y-1 bg-neutral-50/50 rounded">
                        {section.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setActiveCategory(item.categoryFilter);
                              setActiveSubcategory(item.subcategoryFilter || 'ALL');
                              setActiveCollection(item.collectionFilter || 'ALL');
                              setSubView('CATALOG');
                              setMobileMenuOpen(false);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="w-full text-left py-1.5 px-3 text-xs text-neutral-600 hover:text-black hover:bg-white rounded flex items-center justify-between"
                          >
                            <span>{item.name}</span>
                            <ArrowRight className="w-3 h-3 text-neutral-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setActiveCategory('ALL');
                  setActiveSubcategory('ALL');
                  setActiveCollection('OFFERS');
                  setSubView('CATALOG');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-red-600 flex items-center justify-between"
              >
                <span>Special Offers</span>
                <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-mono">SALE</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setHelplineInitialTab('AI_CHAT');
                  setIsHelplineOpen(true);
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-neutral-800"
              >
                Track an order
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAboutModalOpen(true);
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-neutral-800"
              >
                About Us
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setHelplineInitialTab('WHATSAPP');
                  setIsHelplineOpen(true);
                }}
                className="w-full text-left py-2 px-3 rounded hover:bg-neutral-50 text-sm font-semibold text-neutral-800"
              >
                Contact Us
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Us Modal */}
      {aboutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white max-w-lg w-full p-6 sm:p-8 rounded-lg shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => setAboutModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-black cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-xs uppercase tracking-widest text-[#8C6D46] font-semibold">
              Maison & Provenance
            </div>
            <h3 className="text-2xl font-display font-medium text-black">
              About {settings.storeName}
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Founded on principles of artisanal permanence and uncompromising luxury craftsmanship, {settings.storeName} curates bespoke tailored apparel, fine Swiss horology, botanical extraits, and heirloom objects for collectors and patrons.
            </p>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Every acquisition is packed with white-glove care, backed by our authenticity guarantee, with live courier tracking and 24/7 dedicated client concierge assistance.
            </p>
            <div className="pt-3 border-t border-neutral-100 flex justify-end">
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                className="px-5 py-2 bg-black text-white text-xs font-semibold rounded hover:bg-neutral-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {/* ======================== 1. HOME VIEW ======================== */}
        {subView === 'HOME' && (
          <div>
            {/* Section 1: Storefront Hero */}
            <section className="relative border-b border-black/[0.07]">
              <div className="max-w-[1360px] mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                <div className="lg:col-span-5 space-y-6">
                  <div className="text-xs tracking-widest uppercase text-[#8C6D46] font-medium">
                    Autumn / Winter Architectural Collection · Florence & Geneva
                  </div>
                  <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-display font-medium leading-[1.08] tracking-tight text-[#141413]">
                    Objects of Permanent Quiet & Precision.
                  </h1>
                  <p className="text-base text-[#575653] leading-relaxed max-w-xl">
                    Hand-stitched French box calfskin, grade-5 titanium flyback chronographs, and carved Roman travertine luminaires—crafted in numbered editions.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <button
                      onClick={() => {
                        setActiveCategory('ALL');
                        setSubView('CATALOG');
                      }}
                      className="px-6 py-3.5 bg-[#141413] text-[#FBFBF9] text-sm font-medium flex items-center gap-3 hover:bg-[#2A2A28] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Explore Collection</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="pt-4 border-t border-black/[0.06] flex items-center gap-6 text-xs text-[#575653]">
                    <span>Full-Grain Tuscan Leather</span>
                    <span aria-hidden="true">·</span>
                    <span>Swiss Automatic Calibres</span>
                    <span aria-hidden="true">·</span>
                    <span>Lifetime Atelier Care</span>
                  </div>
                </div>

                <div className="lg:col-span-7">
                  <div className="aspect-[16/9] w-full overflow-hidden bg-[#F3F2EE] relative">
                    <ProductImage
                      src={HERO_IMAGE_PATH}
                      alt="Atelier Aurelia Architectural Living Room & Leather Collection"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent flex items-end p-6">
                      <div className="text-[#FBFBF9] text-xs tracking-wide">
                        Featured Study: Solstice Travertine Luminaire & Valadier Bridle Weekender — Milan Residence
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Featured Collection Grid (with Category Filter Bar) */}
            <section className="max-w-[1360px] mx-auto px-6 py-16 lg:py-24 border-b border-black/[0.07]">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
                <div>
                  <div className="text-xs uppercase tracking-widest text-[#8C6D46] mb-2">
                    Curated Editions
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-display font-medium text-[#141413]">
                    Signature Pieces
                  </h2>
                </div>

                {/* Interactive Segmented Category Filter */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#EBEAE5] border border-black/20">
                  <button
                    onClick={() => {
                      setActiveCategory('ALL');
                      setActiveSubcategory('ALL');
                      setActiveCollection('ALL');
                    }}
                    className={`px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      activeCategory === 'ALL' && activeSubcategory === 'ALL' && activeCollection === 'ALL'
                        ? 'bg-black text-white shadow-sm'
                        : 'text-black hover:bg-black/10'
                    }`}
                  >
                    All Editions ({products.filter((p) => p.status === 'ACTIVE').length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setActiveCategory(cat.name);
                        setActiveSubcategory('ALL');
                        setActiveCollection('ALL');
                      }}
                      className={`px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        activeCategory.toLowerCase() === cat.name.toLowerCase()
                          ? 'bg-black text-white shadow-sm'
                          : 'text-black hover:bg-black/10'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3-Column Product Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredProducts.slice(0, 12).map((product) => (
                  <article
                    key={product.id}
                    className="group flex flex-col justify-between border border-black/15 bg-white transition-transform duration-150 hover:-translate-y-0.5 shadow-sm"
                  >
                    <div>
                      <div
                        onClick={() => handleSelectProduct(product)}
                        className="aspect-[4/3] w-full bg-[#F7F6F2] overflow-hidden relative cursor-pointer"
                      >
                        <ProductImage
                          src={product.primaryImage}
                          alt={product.name}
                          category={product.category}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWishlist(product.id);
                          }}
                          aria-label={`Save ${product.name}`}
                          className="absolute top-3 right-3 p-2 bg-white/90 text-[#141413] hover:bg-[#141413] hover:text-white transition-colors cursor-pointer"
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              wishlist.includes(product.id) ? 'fill-current' : ''
                            }`}
                          />
                        </button>
                      </div>

                      <div className="p-5">
                        {/* Unboxed metadata */}
                        <div className="flex items-center gap-2 text-xs font-bold text-stone-900 mb-1.5">
                          <span className="uppercase tracking-wider">{product.brand}</span>
                          <span aria-hidden="true">·</span>
                          <span>{product.category}</span>
                          {product.stock <= (product.lowStockThreshold || 5) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-red-700 font-extrabold">
                                Only {product.stock} left
                              </span>
                            </>
                          )}
                        </div>

                        <h3
                          onClick={() => handleSelectProduct(product)}
                          className="text-base font-extrabold text-black group-hover:text-stone-700 transition-colors cursor-pointer line-clamp-1"
                        >
                          {product.name}
                        </h3>

                        <p className="text-xs text-black font-medium mt-1.5 line-clamp-2 leading-relaxed">
                          {product.shortDescription}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 pb-5 pt-3 border-t border-black/10 flex items-center justify-between gap-4">
                      <div className="font-mono tabular-nums">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-extrabold text-black">
                            {formatPKR(product.price)}
                          </span>
                          {product.compareAtPrice && product.compareAtPrice > product.price && (
                            <span className="text-xs text-stone-600 line-through font-semibold">
                              {formatPKR(product.compareAtPrice)}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-900 font-bold">
                          ${product.price.toLocaleString()} USD
                        </div>
                      </div>

                      <button
                        onClick={() => addToCart(product, 1)}
                        className="px-3.5 py-2 bg-black text-white text-xs font-bold hover:bg-stone-800 transition-colors whitespace-nowrap cursor-pointer shadow-sm"
                      >
                        Add to Bag
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-12 text-center">
                <button
                  onClick={() => setSubView('CATALOG')}
                  className="px-8 py-3.5 border border-[#141413] text-xs font-semibold uppercase tracking-widest text-[#141413] hover:bg-[#141413] hover:text-[#FBFBF9] transition-colors cursor-pointer"
                >
                  View Complete Catalog ({products.filter((p) => p.status === 'ACTIVE').length} Pieces)
                </button>
              </div>
            </section>

            {/* Section 3: Provenance, Quantitative Craftsmanship & Client Proof */}
            <section className="max-w-[1360px] mx-auto px-6 py-16 lg:py-24">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                <div className="lg:col-span-5 space-y-4">
                  <div className="text-xs uppercase tracking-widest text-[#8C6D46]">
                    01. Architectural Provenance
                  </div>
                  <h2 className="text-3xl font-display font-medium text-[#141413]">
                    Engineered for Multi-Decade Patina, Verified by Collectors.
                  </h2>
                  <p className="text-sm text-[#575653] leading-relaxed">
                    Every piece is serialized and accompanied by a digital certificate of origin. Our workshops in Florence, La Chaux-de-Fonds, and Grasse operate on strict small-batch tolerances.
                  </p>
                  <div className="grid grid-cols-2 gap-6 pt-4 border-t border-black/[0.07]">
                    <div>
                      <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                        72 hrs
                      </div>
                      <div className="text-xs text-[#575653] mt-1">
                        Chronometer power reserve tested across 5 positions
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono tabular-nums font-semibold text-[#141413]">
                        99.4%
                      </div>
                      <div className="text-xs text-[#575653] mt-1">
                        Client retention & undamaged courier delivery rate in 2026
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {reviews.slice(0, 2).map((rev) => (
                    <blockquote
                      key={rev.id}
                      className="p-6 bg-white border border-black/[0.07] flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-[#8C6D46]">
                          <span className="font-mono tabular-nums">{rev.rating}.0 / 5.0</span>
                          <span aria-hidden="true">·</span>
                          <span>Verified Acquisition</span>
                        </div>
                        <h3 className="text-sm font-semibold text-[#141413]">{rev.title}</h3>
                        <p className="text-xs text-[#575653] leading-relaxed">“{rev.comment}”</p>
                      </div>
                      <footer className="pt-3 border-t border-black/[0.05] text-xs text-[#141413] font-medium">
                        {rev.authorName}
                        {rev.productName && (
                          <span className="block text-[11px] text-[#787774] font-normal mt-0.5">
                            Piece: {rev.productName}
                          </span>
                        )}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ======================== 2. CATALOG & SEARCH VIEW ======================== */}
        {subView === 'CATALOG' && (
          <div className="max-w-[1360px] mx-auto px-6 py-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between pb-8 border-b border-black/[0.07] gap-6">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#787774] mb-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory('ALL');
                      setActiveSubcategory('ALL');
                      setActiveCollection('ALL');
                      setSubView('HOME');
                    }}
                    className="hover:text-black cursor-pointer"
                  >
                    Home
                  </button>
                  <span>/</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubcategory('ALL');
                      setActiveCollection('ALL');
                    }}
                    className="hover:text-black cursor-pointer font-medium"
                  >
                    {activeCategory === 'ALL' ? 'Catalog' : activeCategory}
                  </button>
                  {activeSubcategory !== 'ALL' && (
                    <>
                      <span>/</span>
                      <span className="text-[#141413] font-semibold">{activeSubcategory}</span>
                    </>
                  )}
                  {activeCollection !== 'ALL' && (
                    <>
                      <span>/</span>
                      <span className="text-black font-semibold uppercase">{activeCollection.replace('_', ' ')}</span>
                    </>
                  )}
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-medium text-[#141413]">
                  {activeSubcategory !== 'ALL'
                    ? `${activeCategory} — ${activeSubcategory}`
                    : activeCollection === 'NEW_ARRIVALS'
                    ? 'New Arrivals'
                    : activeCollection === 'BEST_SELLERS'
                    ? 'Best Sellers'
                    : activeCollection === 'OFFERS'
                    ? 'Special Offers & Archive Sale'
                    : activeCategory === 'ALL'
                    ? 'Complete Archive & Collection'
                    : `${activeCategory} Collection`}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <span className="text-xs text-neutral-500 font-mono">
                    Showing {filteredProducts.length} piece{filteredProducts.length === 1 ? '' : 's'}
                  </span>
                  {(activeCategory !== 'ALL' || activeSubcategory !== 'ALL' || activeCollection !== 'ALL' || searchQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategory('ALL');
                        setActiveSubcategory('ALL');
                        setActiveCollection('ALL');
                        setSearchQuery('');
                      }}
                      className="ml-2 text-xs font-medium text-neutral-800 hover:text-black underline underline-offset-4 cursor-pointer"
                    >
                      Clear All Filters ×
                    </button>
                  )}
                </div>
              </div>

              {/* Search & Sort Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#787774] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search category, SKU, fabric..."
                    className="pl-10 pr-4 py-2 bg-white border border-black/15 text-xs text-[#141413] focus:outline-none focus:border-[#141413] w-64"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort products"
                  className="px-3.5 py-2 bg-white border border-black/15 text-xs text-[#141413] focus:outline-none focus:border-[#141413]"
                >
                  <option value="RELEVANCE">Sort: Curated Relevance</option>
                  <option value="NEWEST">Sort: Newest Editions</option>
                  <option value="PRICE_ASC">Sort: Price Low to High</option>
                  <option value="PRICE_DESC">Sort: Price High to Low</option>
                  <option value="RATING">Sort: Highest Client Rating</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-8">
              {/* Left Filter Rail */}
              <aside className="lg:col-span-3 space-y-8">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#141413] mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Category</span>
                    </span>
                    {activeCategory !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveCategory('ALL');
                          setActiveSubcategory('ALL');
                        }}
                        className="text-[11px] text-neutral-500 hover:text-black cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </h3>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        setActiveCategory('ALL');
                        setActiveSubcategory('ALL');
                        setActiveCollection('ALL');
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between rounded cursor-pointer ${
                        activeCategory === 'ALL' && activeSubcategory === 'ALL' && activeCollection === 'ALL'
                          ? 'bg-[#141413] text-[#FBFBF9] font-medium'
                          : 'text-[#575653] hover:text-[#141413] hover:bg-black/5'
                      }`}
                    >
                      <span>All Products</span>
                      <span className="font-mono text-[11px] opacity-70">
                        {products.filter((p) => p.status === 'ACTIVE').length}
                      </span>
                    </button>
                    {categories.map((cat) => {
                      const count = products.filter(
                        (p) =>
                          p.status === 'ACTIVE' &&
                          (p.category.toLowerCase() === cat.name.toLowerCase() ||
                            (cat.name === 'Men' && (p.category === 'Men' || p.subcategory?.includes('Men'))) ||
                            (cat.name === 'Women' && (p.category === 'Women' || p.subcategory?.includes('Women'))) ||
                            (cat.name === 'Children' && (p.category === 'Children' || p.subcategory?.includes('Children'))))
                      ).length;

                      const isSelected = activeCategory.toLowerCase() === cat.name.toLowerCase();

                      return (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setActiveCategory(cat.name);
                            setActiveSubcategory('ALL');
                            setActiveCollection('ALL');
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between rounded cursor-pointer ${
                            isSelected
                              ? 'bg-[#141413] text-[#FBFBF9] font-medium'
                              : 'text-[#575653] hover:text-[#141413] hover:bg-black/5'
                          }`}
                        >
                          <span>{cat.name}</span>
                          <span className="font-mono text-[11px] opacity-70">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-6 border-t border-black/[0.07]">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#141413] mb-3">
                    Maison & Atelier
                  </h3>
                  <div className="space-y-1.5">
                    {['ALL', ...brands].map((b) => (
                      <button
                        key={b}
                        onClick={() => setActiveBrand(b)}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                          activeBrand === b
                            ? 'bg-[#141413] text-[#FBFBF9] font-medium'
                            : 'text-[#575653] hover:text-[#141413]'
                        }`}
                      >
                        {b === 'ALL' ? 'All Maisons' : b}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-black/[0.07]">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold uppercase tracking-wider text-[#141413]">
                      Max Price
                    </span>
                    <span className="font-mono tabular-nums text-[#141413] text-right">
                      ${priceCeiling.toLocaleString()}
                      <span className="block text-[10px] text-[#8C6D46]">
                        {formatPKR(priceCeiling)}
                      </span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={200}
                    max={20000}
                    step={100}
                    value={priceCeiling}
                    onChange={(e) => setPriceCeiling(Number(e.target.value))}
                    className="w-full accent-[#141413]"
                  />
                </div>

                <div className="pt-6 border-t border-black/[0.07]">
                  <label className="flex items-center gap-2.5 text-xs text-[#141413] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="accent-[#141413]"
                    />
                    <span>Immediate Dispatch Only (In Stock)</span>
                  </label>
                </div>
              </aside>

              {/* Right Product Grid */}
              <div className="lg:col-span-9">
                {filteredProducts.length === 0 ? (
                  <div className="p-12 border border-black/[0.07] bg-white text-center space-y-4">
                    <p className="text-base font-display text-[#141413]">
                      No archival pieces match your current filter criteria.
                    </p>
                    <button
                      onClick={() => {
                        setActiveCategory('ALL');
                        setActiveBrand('ALL');
                        setPriceCeiling(20000);
                        setSearchQuery('');
                        setInStockOnly(false);
                      }}
                      className="px-4 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredProducts.map((product) => (
                      <article
                        key={product.id}
                        className="group flex flex-col justify-between border border-black/[0.07] bg-white"
                      >
                        <div>
                          <div
                            onClick={() => handleSelectProduct(product)}
                            className="aspect-[4/3] bg-[#F7F6F2] overflow-hidden relative cursor-pointer"
                          >
                            <ProductImage
                              src={product.primaryImage}
                              alt={product.name}
                              category={product.category}
                              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                            />
                          </div>
                          <div className="p-4">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900 mb-1">
                              <span>{product.sku}</span>
                              <span aria-hidden="true">·</span>
                              <span>{product.category}</span>
                            </div>
                            <h3
                              onClick={() => handleSelectProduct(product)}
                              className="text-base font-extrabold text-black group-hover:text-stone-700 cursor-pointer line-clamp-1"
                            >
                              {product.name}
                            </h3>
                            <p className="text-xs text-black font-medium mt-1 line-clamp-2">
                              {product.shortDescription}
                            </p>
                          </div>
                        </div>

                        <div className="px-4 pb-4 pt-3 border-t border-black/10 flex items-center justify-between">
                          <div className="font-mono tabular-nums">
                            <span className="text-base font-extrabold text-black block">
                              {formatPKR(product.price)}
                            </span>
                            <span className="text-[11px] text-stone-900 font-bold block">
                              ${product.price.toLocaleString()} USD
                            </span>
                          </div>
                          <button
                            onClick={() => addToCart(product, 1)}
                            className="px-3.5 py-1.5 bg-black text-white text-xs font-bold hover:bg-stone-800 transition-colors cursor-pointer shadow-sm"
                          >
                            Add to Bag
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================== 3. PRODUCT DETAIL VIEW (PDP) ======================== */}
        {subView === 'PRODUCT_DETAIL' && selectedProduct && (
          <div className="max-w-[1360px] mx-auto px-6 py-12 space-y-20">
            <div>
              <button
                onClick={() => setSubView('CATALOG')}
                className="text-xs text-[#575653] hover:text-[#141413] mb-6 inline-flex items-center gap-2 cursor-pointer"
              >
                <span>← Back to {selectedProduct.category}</span>
              </button>

              {/* Contiguous Purchase Module: Sticky Gallery Left + Purchase Module Right */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                <div className="lg:col-span-7 space-y-4">
                  <div className="aspect-[4/3] w-full bg-[#F7F6F2] border border-black/[0.07] overflow-hidden">
                    <ProductImage
                      src={selectedProduct.primaryImage}
                      alt={selectedProduct.name}
                      category={selectedProduct.category}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-xs text-[#575653] pt-2">
                    <div className="p-3.5 border border-black/[0.07] bg-white">
                      <span className="block font-medium text-[#141413]">SKU Reference</span>
                      <span className="font-mono tabular-nums">{selectedProduct.sku}</span>
                    </div>
                    <div className="p-3.5 border border-black/[0.07] bg-white">
                      <span className="block font-medium text-[#141413]">Dimensions</span>
                      <span className="font-mono tabular-nums">
                        {selectedProduct.dimensions || 'Standard Atelier'}
                      </span>
                    </div>
                    <div className="p-3.5 border border-black/[0.07] bg-white">
                      <span className="block font-medium text-[#141413]">Weight</span>
                      <span className="font-mono tabular-nums">
                        {selectedProduct.weightKg || 0.85} kg
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Contiguous Purchase Module */}
                <div className="lg:col-span-5 bg-white border border-black/[0.08] p-8 space-y-6">
                  <div className="flex items-center gap-2 text-xs text-[#787774]">
                    <span className="uppercase tracking-widest text-[#8C6D46] font-medium">
                      {selectedProduct.brand}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedProduct.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      ★ {selectedProduct.rating || 4.9} ({selectedProduct.reviewCount || 12} reviews)
                    </span>
                  </div>

                  <h1 className="text-3xl font-display font-medium text-[#141413]">
                    {selectedProduct.name}
                  </h1>

                  <div className="space-y-1 font-mono tabular-nums">
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-semibold text-[#141413]">
                        {formatPKR(selectedProduct.price)}
                      </span>
                      <span className="text-base font-medium text-[#8C6D46]">
                        (${selectedProduct.price.toLocaleString()} USD)
                      </span>
                      {selectedProduct.compareAtPrice &&
                        selectedProduct.compareAtPrice > selectedProduct.price && (
                          <span className="text-sm text-[#787774] line-through">
                            {formatPKR(selectedProduct.compareAtPrice)} (${selectedProduct.compareAtPrice.toLocaleString()})
                          </span>
                        )}
                    </div>
                  </div>

                  <p className="text-sm text-[#575653] leading-relaxed">
                    {selectedProduct.description}
                  </p>

                  {/* Variant Selector */}
                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#141413]">
                      Finish / Edition Specification
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        'Obsidian / Brushed Brass',
                        'Espresso / Palladium',
                        'Travertine Natural',
                        'Collector Numbered Edition',
                      ].map((variant) => (
                        <button
                          key={variant}
                          type="button"
                          onClick={() => setSelectedVariant(variant)}
                          className={`px-3 py-2 text-xs text-left border transition-colors truncate cursor-pointer ${
                            selectedVariant === variant
                              ? 'border-[#141413] bg-[#141413] text-[#FBFBF9] font-medium'
                              : 'border-black/15 text-[#575653] hover:border-[#141413]'
                          }`}
                        >
                          {variant}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quantity + Primary Buy Actions */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#575653]">Availability</span>
                      <span className="font-mono tabular-nums font-medium text-[#141413]">
                        {selectedProduct.stock > 0
                          ? `${selectedProduct.stock} pieces ready for dispatch`
                          : 'Out of Stock'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-black/20 bg-[#FBFBF9]">
                        <button
                          type="button"
                          onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                          className="p-3 text-[#141413] hover:bg-black/5 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-4 text-xs font-mono tabular-nums font-semibold">
                          {detailQty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDetailQty((q) => Math.min(selectedProduct.stock || 1, q + 1))
                          }
                          className="p-3 text-[#141413] hover:bg-black/5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          addToCart(selectedProduct, detailQty, selectedVariant)
                        }
                        disabled={selectedProduct.stock <= 0}
                        className="flex-1 py-3.5 px-6 bg-[#141413] text-[#FBFBF9] text-xs font-semibold uppercase tracking-widest hover:bg-[#2A2A28] disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        Add to Shopping Bag
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleWishlist(selectedProduct.id)}
                        className="p-3.5 border border-black/20 text-[#141413] hover:border-[#141413] cursor-pointer"
                        aria-label="Save to Wishlist"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            wishlist.includes(selectedProduct.id) ? 'fill-current' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        addToCart(selectedProduct, detailQty, selectedVariant);
                        setConfirmedOrderNumber(null);
                        setCheckoutStep(1);
                        setSubView('CHECKOUT');
                      }}
                      className="w-full py-3 border border-[#141413] text-[#141413] text-xs font-semibold uppercase tracking-widest hover:bg-[#141413] hover:text-[#FBFBF9] transition-colors cursor-pointer"
                    >
                      Immediate Express Acquisition
                    </button>
                  </div>

                  {/* Shipping & Guarantee Metadata */}
                  <div className="pt-4 border-t border-black/[0.07] space-y-2 text-xs text-[#575653]">
                    <div className="flex items-center gap-2.5">
                      <Truck className="w-4 h-4 text-[#8C6D46] shrink-0" />
                      <span>Insured DHL Express & FedEx Priority dispatch within 24 hours.</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <RotateCcw className="w-4 h-4 text-[#8C6D46] shrink-0" />
                      <span>Complimentary 30-day private courier returns & exchanges.</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-[#8C6D46] shrink-0" />
                      <span>Serialized authenticity guarantee & SEO Schema verified.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Reviews & Client Testimonials */}
            <section className="pt-12 border-t border-black/[0.07] grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-5 space-y-4">
                <h2 className="text-2xl font-display font-medium text-[#141413]">
                  Verified Collector Reviews
                </h2>
                <p className="text-xs text-[#575653]">
                  Reviews are restricted to authenticated clients and moderated by Atelier Concierge.
                </p>

                <form
                  onSubmit={handleReviewSubmit}
                  className="p-6 bg-white border border-black/[0.07] space-y-4"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#141413]">
                    Record Your Evaluation
                  </h3>
                  <div>
                    <label className="block text-xs text-[#575653] mb-1">Rating</label>
                    <select
                      value={reviewRating}
                      onChange={(e) => setReviewRating(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-black/15 text-xs bg-[#FBFBF9]"
                    >
                      <option value={5}>5 Stars — Museum / Heirloom Standard</option>
                      <option value={4}>4 Stars — Exceptional Craft</option>
                      <option value={3}>3 Stars — Satisfactory</option>
                      <option value={2}>2 Stars — Subpar</option>
                      <option value={1}>1 Star — Defective</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#575653] mb-1">Headline</label>
                    <input
                      type="text"
                      required
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      placeholder="e.g., Impeccable balance and finish"
                      className="w-full px-3 py-2 border border-black/15 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#575653] mb-1">Written Review</label>
                    <textarea
                      rows={3}
                      required
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Share your experience with the materials, ergonomics, and finish..."
                      className="w-full px-3 py-2 border border-black/15 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                  >
                    Submit Verified Review
                  </button>
                </form>
              </div>

              <div className="lg:col-span-7 space-y-4">
                {reviews
                  .filter((r) => r.productId === selectedProduct.id || r.status === 'APPROVED')
                  .slice(0, 5)
                  .map((rev) => (
                    <div
                      key={rev.id}
                      className="p-6 bg-white border border-black/[0.07] space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs text-[#787774]">
                        <span className="font-mono tabular-nums text-[#8C6D46] font-semibold">
                          ★ {rev.rating}.0 / 5.0 · Verified Purchase
                        </span>
                        <span className="font-mono tabular-nums">
                          {rev.createdAt.slice(0, 10)}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-[#141413]">{rev.title}</h4>
                      <p className="text-xs text-[#575653] leading-relaxed">{rev.comment}</p>
                      <div className="text-[11px] text-[#787774] pt-1">— {rev.authorName}</div>
                    </div>
                  ))}
              </div>
            </section>

            {/* Recently Viewed & Related Products */}
            <section className="pt-12 border-t border-black/[0.07]">
              <h2 className="text-2xl font-display font-medium text-[#141413] mb-6">
                Complementary Archive Pieces
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {products
                  .filter((p) => p.id !== selectedProduct.id && p.status === 'ACTIVE')
                  .slice(0, 3)
                  .map((rel) => (
                    <div
                      key={rel.id}
                      onClick={() => handleSelectProduct(rel)}
                      className="p-4 bg-white border border-black/[0.07] flex items-center gap-4 cursor-pointer hover:border-[#141413] transition-colors"
                    >
                      <div className="w-20 h-20 bg-[#F7F6F2] shrink-0 overflow-hidden">
                        <ProductImage src={rel.primaryImage} alt={rel.name} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] text-[#787774]">{rel.category}</div>
                        <div className="text-sm font-semibold text-[#141413] truncate">
                          {rel.name}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-[#141413] mt-1">
                          <span className="font-semibold">{formatPKR(rel.price)}</span> · <span className="text-[#8C6D46]">${rel.price.toLocaleString()} USD</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        )}

        {/* ======================== 4. MULTI-STEP CHECKOUT VIEW ======================== */}
        {subView === 'CHECKOUT' && (
          <div className="max-w-[1120px] mx-auto px-6 py-12">
            {checkoutStep === 3 && confirmedOrderNumber ? (() => {
              const confirmedOrder = orders.find((o) => o.orderNumber === confirmedOrderNumber);
              const isOrderPaid = confirmedOrder?.paymentStatus === 'PAID';
              const isCod = paymentMethod === 'COD' || confirmedOrder?.paymentMethod === 'COD';
              const isPendingVerification = !isOrderPaid && !isCod;

              const activeTid = confirmedOrder?.paymentReference || wireReferenceNumber || 'TID-PENDING';
              const activeRecipientEmail = customerEmail || userProfile?.email || 'customer@gmail.com';
              const activeStoreName = settings.storeName || 'Atelier Aurelia';
              const activeTotalPkr = Math.round(grandTotal * (settings.usdToPkrRate || 278.5));

              const paymentMethodLabel =
                paymentMethod === 'HBL_BANK' || paymentMethod === 'BANK_ACCOUNT'
                  ? 'Direct Bank Account / 1Link Transfer'
                  : paymentMethod === 'RAAST_IBAN'
                  ? 'Advance RAAST Instant Transfer'
                  : paymentMethod === 'NAYAPAY'
                  ? 'Advance NayaPay Digital Wallet'
                  : paymentMethod === 'BANK_TRANSFER'
                  ? 'Advance Bank Wire Transfer'
                  : paymentMethod === 'COD'
                  ? 'Cash on Delivery (Courier Doorstep)'
                  : paymentMethod;

              const fallbackOrderForModal: Order = confirmedOrder || {
                id: `ord-${confirmedOrderNumber}`,
                orderNumber: confirmedOrderNumber,
                userId: firebaseUser?.uid || 'guest-checkout',
                customerName: customerName || userProfile?.name || 'Valued Patron',
                customerEmail: activeRecipientEmail,
                status: isOrderPaid ? 'CONFIRMED' : 'PENDING',
                paymentStatus: isOrderPaid ? 'PAID' : isCod ? 'PENDING' : 'PENDING_VERIFICATION',
                paymentMethod,
                paymentSubMethod,
                paymentReference: activeTid,
                district,
                tehsil: effectiveTehsil,
                total: grandTotal,
                currency: settings.currency || 'PKR',
                shippingAddressSummary: `${streetAddress}, ${effectiveTehsil ? `Tehsil ${effectiveTehsil}, ` : ''}District ${district}, ${country}`,
                createdAt: new Date().toISOString(),
              };

              return (
                <div className="bg-white border border-black/[0.08] p-8 sm:p-10 max-w-2xl mx-auto space-y-6">
                  <div className={`w-10 h-10 ${isOrderPaid ? 'bg-emerald-600 text-white' : 'bg-[#141413] text-[#FBFBF9]'} flex items-center justify-center`}>
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-[#8C6D46]">
                      {isOrderPaid
                        ? 'Acquisition Confirmed & Paid'
                        : isCod
                        ? 'Cash on Delivery Order Logged'
                        : 'Order Placed — Awaiting Payment Verification'}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-display font-medium text-[#141413] mt-1">
                      {isOrderPaid
                        ? `Order ${confirmedOrderNumber} Confirmed — Payment Verified`
                        : isCod
                        ? `Order ${confirmedOrderNumber} Placed — Cash on Delivery`
                        : `Order ${confirmedOrderNumber} Placed — Awaiting Payment Verification`}
                    </h1>
                  </div>

                  {/* Payment Status Notification Banner */}
                  {isOrderPaid ? (
                    <div className="p-5 bg-emerald-50 border border-emerald-500/50 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                            ✓
                          </div>
                          <strong className="text-emerald-950 text-sm font-semibold">
                            ادائیگی خودکار چارج اور موصول ہو چکی ہے (Payment Charged &amp; Confirmed)!
                          </strong>
                        </div>
                        <span className="px-2.5 py-0.5 bg-emerald-700 text-white font-mono text-[11px] font-bold tracking-wider">
                          PAID · AUTO-CONFIRMED
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        Store <strong className="text-emerald-950 font-bold">{activeStoreName}</strong> main apki advance payment ba-hifazat recieve ho chuki hy! Aap ke account se raqam khud-bakhud deduct ho kar hamare store merchant account main jama ho gai hy, aur system ne order foran <strong>CONFIRMED</strong> kar dia hy. White-glove packaging and fulfillment shuru ho chuki hy.
                      </p>
                    </div>
                  ) : isCod ? (
                    <div className="p-4 bg-amber-50 border border-amber-300 space-y-1">
                      <strong className="text-amber-950 text-xs font-semibold">
                        Cash on Delivery (COD) Registered
                      </strong>
                      <p className="text-[11px] text-amber-800">
                        Payment will be collected at your doorstep in cash by the courier upon delivery.
                      </p>
                    </div>
                  ) : (
                    <div className="p-5 bg-amber-50 border border-amber-400 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                            ⏳
                          </div>
                          <strong className="text-amber-950 text-sm font-semibold">
                            Payment Pending Verification (ادائیگی تصدیق کے لیے زیرِ التواء ہے)
                          </strong>
                        </div>
                        <span className="px-2.5 py-0.5 bg-amber-800 text-white font-mono text-[11px] font-bold tracking-wider">
                          UNPAID · PENDING VERIFICATION
                        </span>
                      </div>
                      <div className="text-xs text-amber-900 leading-relaxed space-y-2 bg-white/90 p-3.5 border border-amber-300/80 rounded">
                        <p className="font-semibold text-amber-950 flex items-center gap-1.5">
                          <span>⚠️ اہم نوٹس (Account Charge &amp; Verification Notice):</span>
                        </p>
                        <p>
                          <strong>آپ کے بینک یا والیٹ اکاؤنٹ سے رقم خودکار طور پر نہیں کٹی۔</strong> کیونکہ ویب سائٹ پر ابھی لائیو بینک گیٹ وے API خودکار کٹوتی کے لیے منسلک نہیں ہے یا مینوئل بینک/والیٹ منتقلی درکار ہے۔
                        </p>
                        <p>
                          آپ کا آرڈر اور پیمنٹ ریفرنس (<strong className="font-mono text-amber-950 font-bold">{activeTid}</strong>) اسٹور پر <strong>PENDING</strong> حالت میں درج ہو گیا ہے۔ جب اسٹور ایڈمن کو آپ کی طرف سے رقم کی منتقلی موصول ہو گی اور وہ اپنے اکاؤنٹ میں چیک کر کے کنفرم کریں گے، تب ہی آرڈر کا اسٹیٹس <strong>&apos;PAID&apos;</strong> اور <strong>&apos;CONFIRMED&apos;</strong> ہو گا اور آرڈر کی پروسیسنگ شروع ہو گی۔
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Payment & Order Summary Dossier */}
                  <div className="p-4 bg-[#F7F6F2] border border-black/[0.06] text-xs space-y-2 font-mono tabular-nums">
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Store Name:</span>
                      <strong className="text-[#141413] font-semibold">{activeStoreName}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Order Reference:</span>
                      <strong className="text-[#141413] font-semibold">{confirmedOrderNumber}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Payment Status:</span>
                      <strong className={isOrderPaid ? "text-emerald-700 font-bold" : isCod ? "text-amber-800" : "text-amber-800 font-bold"}>
                        {isOrderPaid
                          ? 'PAID · Advance Payment Recieved'
                          : isCod
                          ? 'PENDING (Due on Delivery)'
                          : 'PENDING VERIFICATION · Unpaid (رقم کی تصدیق باقی ہے)'}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Order Status:</span>
                      <strong className={isOrderPaid ? "text-emerald-700 font-bold" : "text-amber-800 font-semibold"}>
                        {isOrderPaid ? 'CONFIRMED · In Fulfillment' : 'PENDING · Awaiting Payment (پروسیسنگ تصدیق کے بعد شروع ہوگی)'}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">Payment Protocol:</span>
                      <span className="text-[#141413] font-medium">{paymentMethodLabel}</span>
                    </div>
                    {!isCod && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#787774]">Payment Reference / TID:</span>
                        <span className="text-[#8C6D46] font-bold font-mono">{activeTid}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">{isOrderPaid ? 'Total Amount Paid:' : 'Total Payable:'}</span>
                      <strong className="text-[#141413] font-bold">
                        PKR {activeTotalPkr.toLocaleString()} (${grandTotal.toFixed(2)})
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#787774]">District:</span>
                      <strong className="text-[#141413] font-semibold">{confirmedOrder?.district || district}</strong>
                    </div>
                    {(confirmedOrder?.tehsil || effectiveTehsil) && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#787774]">Tehsil:</span>
                        <strong className="text-[#141413] font-semibold">{confirmedOrder?.tehsil || effectiveTehsil}</strong>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[#787774]">Destination:</span>
                      <span className="text-[#141413] text-right truncate max-w-[280px]">
                        {streetAddress}, {effectiveTehsil ? `${effectiveTehsil}, ` : ''}{district}, {country}
                      </span>
                    </div>
                  </div>

                  {/* Transactional Notification Card */}
                  <div className="p-4 bg-sky-50/80 border border-sky-300 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-red-600 text-white rounded flex items-center justify-center text-[10px] font-bold">
                          M
                        </div>
                        <strong className="text-sky-950 text-xs">
                          {isOrderPaid
                            ? 'Gmail Notification: Apki Payment Recieved Ho Chuki Hy'
                            : 'Order Recorded Notification: Order #' + confirmedOrderNumber}
                        </strong>
                      </div>
                      <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${isOrderPaid ? 'text-emerald-800 bg-emerald-100' : 'text-amber-800 bg-amber-100'}`}>
                        {isOrderPaid ? '✓ Payment Confirmed' : '⏳ Awaiting Verification'}
                      </span>
                    </div>
                    <div className="text-xs text-sky-900 space-y-1">
                      <div>
                        <span className="text-sky-700">Recipient Email: </span>
                        <strong className="font-mono text-slate-900">{activeRecipientEmail}</strong>
                      </div>
                      <div>
                        <span className="text-sky-700">Order Reference: </span>
                        <span className="font-mono text-[11px] font-semibold text-slate-800">
                          Order #{confirmedOrderNumber} | {activeStoreName}
                        </span>
                      </div>
                      <p className="text-[11px] text-sky-800 pt-1 leading-relaxed">
                        {isOrderPaid
                          ? `Customer ko Gmail confirmation receive ho chuki hy k apki payment receive ho chuki hy sath store ka name (${activeStoreName}) bhi message main bhej diya gaya hy.`
                          : `Customer ko email notification bhej di gai hy k order darj ho chuka hy. Note: Payment verification hone aur store admin ke approve karne par final "Payment Received" confirmation update ho gi.`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => openGmailReceiptModal(fallbackOrderForModal)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Preview Email Notification
                      </button>
                      <button
                        type="button"
                        disabled={isResendingReceipt}
                        onClick={() => handleResendReceipt(confirmedOrderNumber, activeRecipientEmail)}
                        className="px-3 py-2 border border-sky-400 text-sky-900 hover:bg-sky-100 text-xs font-medium cursor-pointer"
                      >
                        {isResendingReceipt ? 'Resending...' : '↺ Resend to Gmail'}
                      </button>
                    </div>
                    {resendStatus && (
                      <div className="text-[11px] font-medium text-emerald-800 bg-emerald-50 p-2 border border-emerald-200">
                        {resendStatus}
                      </div>
                    )}
                  </div>

                  {/* Guest & Member Live Order Tracking Card */}
                  <div className="p-4 bg-amber-50/90 border border-amber-300 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-800" />
                        <strong className="text-amber-950 text-xs font-semibold">
                          Live Order Tracking Link (ٹریکنگ لنک)
                        </strong>
                      </div>
                      <span className="text-[10px] font-mono font-medium text-amber-900 bg-amber-200/60 px-2 py-0.5 rounded">
                        Guest & Member Access
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed">
                      You can track your order status, payment verification, and courier dispatch anytime at the link below:
                    </p>
                    <div className="p-2.5 bg-white border border-amber-200/80 rounded font-mono text-[11px] text-amber-950 truncate select-all flex items-center justify-between gap-2">
                      <span className="truncate">
                        {typeof window !== 'undefined'
                          ? `${window.location.origin}/track?order=${confirmedOrderNumber}${confirmedOrderAccessToken ? `&token=${confirmedOrderAccessToken}` : ''}`
                          : `/track?order=${confirmedOrderNumber}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTrackingOrderInput(confirmedOrderNumber);
                          if (confirmedOrderAccessToken) setTrackingTokenInput(confirmedOrderAccessToken);
                          setIsTrackingModalOpen(true);
                          handleTrackOrder(confirmedOrderNumber, confirmedOrderAccessToken || '');
                        }}
                        className="px-4 py-2 bg-[#141413] hover:bg-[#2A2A28] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs"
                      >
                        <Search className="w-3.5 h-3.5" />
                        Track Order Status
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const trackUrl = `${window.location.origin}/track?order=${confirmedOrderNumber}${confirmedOrderAccessToken ? `&token=${confirmedOrderAccessToken}` : ''}`;
                          navigator.clipboard?.writeText(trackUrl);
                          showToast?.('Tracking link copied to clipboard!');
                        }}
                        className="px-3 py-2 border border-amber-400 text-amber-950 hover:bg-amber-100 text-xs font-medium cursor-pointer"
                      >
                        📋 Copy Tracking Link
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <button
                      onClick={() => setSubView('ACCOUNT')}
                      className="px-6 py-3 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer hover:bg-[#2A2A28]"
                    >
                      View Order Timeline & Account
                    </button>
                    <button
                      onClick={() => setSubView('HOME')}
                      className="px-6 py-3 border border-black/20 text-xs font-medium cursor-pointer hover:border-[#141413]"
                    >
                      Return to Storefront
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                <form onSubmit={handleCheckoutSubmit} className="lg:col-span-7 space-y-8">
                  <div className="border-b border-black/[0.08] pb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h1 className="text-3xl font-display font-medium text-[#141413]">
                        Private Client Checkout
                      </h1>
                      <p className="text-xs text-[#575653] mt-0.5">
                        Real-Time Address, Postal & Anti-Fraud Payment Verification System
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 text-xs font-mono border ${
                        addressVerification.isFullyVerified && paymentVerification.valid
                          ? 'bg-emerald-950 text-emerald-200 border-emerald-700'
                          : 'bg-amber-50 text-amber-900 border-amber-300'
                      }`}
                    >
                      {addressVerification.isFullyVerified && paymentVerification.valid
                        ? '✓ SYSTEM VERIFIED · ANTI-FRAUD PROTECTED'
                        : '⚠ VERIFICATION IN PROGRESS'}
                    </span>
                  </div>

                  {/* Multi-Step Checkout Progress Stepper */}
                  <div className="bg-[#FAF9F5] border border-black/[0.08] p-3.5 rounded shadow-xs">
                    <div className="flex items-center justify-between">
                      {/* Step 1 Indicator */}
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutStep(1);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`flex items-center gap-2 text-xs font-semibold cursor-pointer ${
                          checkoutStep === 1 ? 'text-[#F85606]' : 'text-emerald-700 hover:text-emerald-800'
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            checkoutStep === 1
                              ? 'bg-[#F85606] text-white ring-2 ring-[#F85606]/20'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {checkoutStep > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
                        </div>
                        <div className="text-left">
                          <span className="block text-[9px] uppercase tracking-wider text-[#787774]">Step 1 (صفحہ 1)</span>
                          <span className="font-bold">Address & Delivery</span>
                        </div>
                      </button>

                      <div className={`flex-1 h-0.5 mx-2.5 sm:mx-4 ${checkoutStep >= 2 ? 'bg-emerald-600' : 'bg-black/15'}`} />

                      {/* Step 2 Indicator */}
                      <button
                        type="button"
                        disabled={!addressVerification.isFullyVerified}
                        onClick={() => {
                          if (addressVerification.isFullyVerified) {
                            setCheckoutStep(2);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        className={`flex items-center gap-2 text-xs font-semibold ${
                          checkoutStep === 2
                            ? 'text-[#F85606]'
                            : checkoutStep > 2
                            ? 'text-emerald-700'
                            : 'text-black/40'
                        } ${addressVerification.isFullyVerified ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                            checkoutStep === 2
                              ? 'bg-[#F85606] text-white ring-2 ring-[#F85606]/20'
                              : checkoutStep > 2
                              ? 'bg-emerald-600 text-white'
                              : 'bg-black/10 text-[#787774]'
                          }`}
                        >
                          {checkoutStep > 2 ? <Check className="w-3.5 h-3.5" /> : '2'}
                        </div>
                        <div className="text-left">
                          <span className="block text-[9px] uppercase tracking-wider text-[#787774]">Step 2 (صفحہ 2)</span>
                          <span className="font-bold">Payment Method</span>
                        </div>
                      </button>

                      <div className={`flex-1 h-0.5 mx-2.5 sm:mx-4 ${checkoutStep === 3 ? 'bg-emerald-600' : 'bg-black/15'}`} />

                      {/* Step 3 Indicator */}
                      <div className={`flex items-center gap-2 text-xs font-semibold ${checkoutStep === 3 ? 'text-emerald-700' : 'text-black/40'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                          checkoutStep === 3 ? 'bg-emerald-600 text-white ring-2 ring-emerald-600/20' : 'bg-black/10 text-[#787774]'
                        }`}>
                          3
                        </div>
                        <div className="text-left">
                          <span className="block text-[9px] uppercase tracking-wider text-[#787774]">Step 3</span>
                          <span className="font-bold">Confirmation</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {checkoutErrorBanner && (
                    <div className="p-4 bg-rose-950 text-rose-100 border border-rose-700 text-xs leading-relaxed">
                      <strong className="font-semibold block mb-0.5">
                        Anti-Fraud & Verification Block:
                      </strong>
                      {checkoutErrorBanner}
                    </div>
                  )}

                  {/* ================= STEP 1: ADDRESS CONFIRMATION ================= */}
                  {checkoutStep === 1 && (
                    <div className="space-y-6">
                      {/* Client Identity & Real-Time Verified Country / State / City / Address */}
                      <div className="bg-white border border-black/[0.07] p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                        01. Client Identity & Verified Delivery Destination
                      </h2>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          addressVerification.isFullyVerified ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {addressVerification.isFullyVerified
                          ? '✓ RIGHT ADDRESS (ALL FIELDS VERIFIED)'
                          : '✕ ADDRESS INCOMPLETE OR WRONG FORMAT'}
                      </span>
                    </div>

                    {/* Quick Jurisdiction Switcher: Pakistan National vs International Worldwide */}
                    <div className="space-y-3 p-3.5 bg-[#F7F6F2] border border-black/[0.06]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleSelectCountryByIso('PK')}
                          className={`py-2.5 px-3 text-xs font-semibold border text-left cursor-pointer transition-colors ${
                            isNationalPakistan
                              ? 'bg-[#141413] text-[#FBFBF9] border-[#141413]'
                              : 'bg-white text-[#575653] border-black/15'
                          }`}
                        >
                          <span className="block">🇵🇰 Pakistan (National Delivery)</span>
                          <span className="block text-[10px] font-mono opacity-80 mt-0.5">
                            All Pakistani Provinces & Cities · Advance + Cash on Delivery (COD)
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleSelectCountryByIso(isNationalPakistan ? 'GB' : countryIso)
                          }
                          className={`py-2.5 px-3 text-xs font-semibold border text-left cursor-pointer transition-colors ${
                            !isNationalPakistan
                              ? 'bg-[#141413] text-[#FBFBF9] border-[#141413]'
                              : 'bg-white text-[#575653] border-black/15'
                          }`}
                        >
                          <span className="block">
                            🌍 International Worldwide ({ALL_WORLD_COUNTRIES.length} Countries & Territories)
                          </span>
                          <span className="block text-[10px] font-mono opacity-80 mt-0.5">
                            Every Country, State & City in the World · 100% Advance Payment Only
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Interactive Google Maps Live Address Auto-Detection */}
                    <GoogleMapsAddressDetector
                      countryIso={countryIso}
                      currentStreetAddress={streetAddress}
                      onAddressDetected={handleAddressAutoDetected}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-[#575653] mb-1">Full Legal Name</label>
                        <input
                          type="text"
                          required
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Clara Vance"
                          className="w-full px-3.5 py-2.5 border border-black/15 text-xs"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">Email Address</label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.emailValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.emailValid ? '✓ Verified' : '✕ Wrong Email'}
                          </span>
                        </div>
                        <input
                          type="email"
                          required
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="client@domain.com"
                          className={`w-full px-3.5 py-2.5 border text-xs ${
                            addressVerification.emailValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                      </div>

                      {/* Complete 250+ World Countries Selector */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Country ({ALL_WORLD_COUNTRIES.length} Countries)
                          </label>
                          <span className="text-[10px] font-mono text-emerald-700">
                            ✓ {isNationalPakistan ? 'National (PK)' : `International (${countryIso})`}
                          </span>
                        </div>
                        <select
                          value={countryIso}
                          onChange={(e) => handleSelectCountryByIso(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                        >
                          {ALL_WORLD_COUNTRIES.map((c) => (
                            <option key={c.isoCode} value={c.isoCode}>
                              {c.flag} {c.name} ({c.phonePrefix}) — {c.isNational ? 'Advance & COD' : 'Advance Only'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Complete States / Provinces Selector for Selected Country */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            State / Province ({availableStates.length} in {country})
                          </label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.stateValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.stateValid ? '✓ Verified State' : '✕ Select State'}
                          </span>
                        </div>
                        <select
                          value={stateIso}
                          onChange={(e) => {
                            const nextStateCode = e.target.value;
                            const stObj = availableStates.find((s) => s.isoCode === nextStateCode);
                            const nextStateName = stObj?.name || nextStateCode;
                            setStateIso(nextStateCode);
                            setStateProvince(nextStateName);
                            const nextCities = getCitiesForState(countryIso, nextStateCode);
                            if (nextCities.length > 0) {
                              handleDistrictChange(nextCities[0].name);
                            } else {
                              handleDistrictChange(nextStateName);
                            }
                          }}
                          className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                        >
                          {availableStates.map((st) => (
                            <option key={`${st.countryCode}-${st.isoCode}`} value={st.isoCode}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* District Selector (Replaced City with District as requested) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            District ({availableDistricts.length} in {stateProvince})
                          </label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.districtValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.districtValid ? '✓ Verified District' : '✕ Wrong District'}
                          </span>
                        </div>
                        <select
                          value={district}
                          onChange={(e) => handleDistrictChange(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                        >
                          {availableDistricts.slice(0, 600).map((dt, idx) => (
                            <option key={`${dt.name}-${idx}`} value={dt.name}>
                              {dt.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Tehsil Selector Box (As requested: box for selecting Tehsil) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Tehsil ({availableTehsils.length} in {district})
                          </label>
                          <span
                            className={`text-[10px] font-mono ${
                              addressVerification.tehsilValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.tehsilValid ? '✓ Verified Tehsil' : '✕ Required'}
                          </span>
                        </div>
                        {!isCustomTehsil ? (
                          <div className="space-y-1.5">
                            <select
                              value={tehsil}
                              onChange={(e) => {
                                if (e.target.value === '__OTHER_CUSTOM__') {
                                  setIsCustomTehsil(true);
                                  setCustomTehsil('');
                                } else {
                                  setTehsil(e.target.value);
                                }
                              }}
                              className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium"
                            >
                              {availableTehsils.map((th, idx) => (
                                <option key={`${th}-${idx}`} value={th}>
                                  {th}
                                </option>
                              ))}
                              <option value="__OTHER_CUSTOM__">
                                ➕ Other / Custom Tehsil...
                              </option>
                            </select>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="relative">
                              <input
                                type="text"
                                required
                                value={customTehsil}
                                onChange={(e) => setCustomTehsil(e.target.value)}
                                placeholder={`Enter Tehsil for ${district}`}
                                className="w-full px-3.5 py-2.5 border border-emerald-600/60 bg-white text-xs font-medium pr-16"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCustomTehsil(false);
                                  setTehsil(availableTehsils[0] || 'Center');
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-800 underline hover:text-emerald-950 cursor-pointer"
                              >
                                List
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Postal / ZIP Code with Real-Time District/Tehsil Validation */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Postal / ZIP Code ({selectedCountryRecord.isoCode})
                          </label>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              addressVerification.postalValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.postalValid ? '✓ Right Postal Code' : '✕ Wrong Postal Code'}
                          </span>
                        </div>
                        <input
                          type="text"
                          required
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          placeholder={postalRule.example}
                          className={`w-full px-3.5 py-2.5 border text-xs font-mono ${
                            addressVerification.postalValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                        <div className="flex flex-wrap items-center justify-between text-[10px] mt-1 gap-1">
                          <span className={addressVerification.postalValid ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                            {addressVerification.fieldMessages.postal}
                          </span>
                          {suggestedPakistanPostalCode && postalCode.trim() !== suggestedPakistanPostalCode && (
                            <button
                              type="button"
                              onClick={() => setPostalCode(suggestedPakistanPostalCode)}
                              className="text-emerald-800 font-semibold underline hover:text-emerald-950 cursor-pointer"
                            >
                              Auto-fill {effectiveTehsil || district} GPO ({suggestedPakistanPostalCode})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Receiver Phone with Real-Time Country Dial Code Check */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Courier Receiver Ph. No. ({selectedCountryRecord.phonePrefix})
                          </label>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              addressVerification.phoneValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.phoneValid ? '✓ Right Phone' : '✕ Wrong Phone'}
                          </span>
                        </div>
                        <input
                          type="tel"
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder={`${selectedCountryRecord.phonePrefix} 300 1234567`}
                          className={`w-full px-3.5 py-2.5 border text-xs font-mono ${
                            addressVerification.phoneValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                        <span className="block text-[10px] text-[#787774] mt-1">
                          {addressVerification.fieldMessages.phone}
                        </span>
                      </div>

                      {/* Complete Street Address with Live Verification */}
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[#575653]">
                            Complete Street, House / Building & Sector Address
                          </label>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              addressVerification.streetValid ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {addressVerification.streetValid ? '✓ Right Street Address' : '✕ Wrong / Incomplete Street'}
                          </span>
                        </div>
                        <input
                          type="text"
                          required
                          value={streetAddress}
                          onChange={(e) => setStreetAddress(e.target.value)}
                          placeholder="House/Plot #, Street #, Sector/Phase, Landmark"
                          className={`w-full px-3.5 py-2.5 border text-xs ${
                            addressVerification.streetValid
                              ? 'border-emerald-600/60 bg-emerald-50/20'
                              : 'border-rose-600 bg-rose-50/30'
                          }`}
                        />
                        <span className="block text-[10px] text-[#787774] mt-1">
                          {addressVerification.fieldMessages.street} · {addressVerification.fieldMessages.location}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Notes / Instructions */}
                    <div className="bg-white border border-black/[0.07] p-5 space-y-2">
                      <label className="block text-xs font-semibold text-[#141413]">
                        Delivery Notes / Landmark Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Gate code, famous landmark, nearest shop, or preferred delivery timing"
                        className="w-full px-3.5 py-2.5 border border-black/15 text-xs rounded"
                      />
                    </div>

                    {/* Address Live Verification & Confirmation Status Box */}
                    <div
                      className={`p-4 border rounded-lg text-xs ${
                        addressVerification.isFullyVerified
                          ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                          : 'bg-amber-50/90 border-amber-300 text-amber-950'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {addressVerification.isFullyVerified ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center justify-between">
                            <strong className="text-xs font-bold uppercase tracking-wide">
                              {addressVerification.isFullyVerified
                                ? '✓ Address Verified & Ready for Confirmation'
                                : '⚠ Address Verification in Progress'}
                            </strong>
                            <span
                              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                                addressVerification.isFullyVerified
                                  ? 'bg-emerald-200 text-emerald-900'
                                  : 'bg-amber-200 text-amber-900'
                              }`}
                            >
                              {addressVerification.isFullyVerified ? 'READY FOR PAYMENT' : 'ADDRESS INCOMPLETE'}
                            </span>
                          </div>

                          {addressVerification.isFullyVerified ? (
                            <>
                              <p className="text-emerald-900 font-medium">
                                {customerName} · <span className="font-mono">{customerPhone}</span> · {customerEmail}
                              </p>
                              <p className="text-emerald-800 text-[11px] font-mono">
                                {streetAddress}, {effectiveTehsil ? `Tehsil: ${effectiveTehsil}, ` : ''}{district}, {stateProvince}, {postalCode}, {country}
                              </p>
                              <p className="text-[11px] text-emerald-800 pt-1 font-medium border-t border-emerald-200/80">
                                ایڈریس مکمل اور درست ہے۔ دوسرے صفحے پر آن لائن یا کیش آن ڈیلیوری ادائیگی کا طریقہ منتخب کرنے کے لیے نیچے دیئے گئے "Confirm Address" بٹن پر کلک کریں۔
                              </p>
                            </>
                          ) : (
                            <p className="text-amber-900 text-[11px] leading-relaxed">
                              براہ کرم ڈیلیوری کا ایڈریس مکمل کریں۔ (گلی/محلہ ایڈریس، فون نمبر، تحصیل اور پوسٹل کوڈ لازمی ہیں تاکہ پارسل بغیر کسی تاخیر کے پہنچ سکے)۔
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Step 1 Primary Action Button: Confirm Address & Proceed to Payment */}
                    <button
                      type="button"
                      onClick={handleConfirmAddress}
                      disabled={!addressVerification.isFullyVerified}
                      className="w-full py-4 bg-[#F85606] hover:bg-[#E04D05] text-white text-xs font-bold uppercase tracking-widest rounded shadow-sm disabled:opacity-40 disabled:hover:bg-[#F85606] cursor-pointer transition-colors flex items-center justify-center gap-2"
                    >
                      {!addressVerification.isFullyVerified ? (
                        <span>Complete Address Verification Above to Continue (ایڈریس مکمل کریں)</span>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Confirm Address &amp; Proceed to Payment (Step 2) →</span>
                          <span className="text-[10px] opacity-90 font-medium">(ایڈریس تصدیق کریں اور ادائیگی پر جائیں)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* ================= STEP 2: PAYMENT METHOD (2nd Page) ================= */}
                {checkoutStep === 2 && (
                  <div className="space-y-6">
                    {/* Confirmed Delivery Address Card at top of Step 2 */}
                    <div className="p-4 bg-emerald-50/90 border border-emerald-300 rounded-lg shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <strong className="text-emerald-950 font-bold text-xs uppercase tracking-wide">
                              ✓ Confirmed Delivery Address · تصدیق شدہ ڈیلیوری ایڈریس
                            </strong>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-semibold font-mono">
                              VERIFIED
                            </span>
                          </div>
                          <p className="text-xs text-emerald-950 font-medium mt-0.5">
                            {customerName} · <span className="font-mono">{customerPhone}</span> · {customerEmail}
                          </p>
                          <p className="text-[11px] text-emerald-800 mt-0.5">
                            {streetAddress}, {effectiveTehsil ? `Tehsil: ${effectiveTehsil}, ` : ''}{district}, {stateProvince}, {postalCode}, {country}
                          </p>
                          {orderNotes && (
                            <p className="text-[10px] text-emerald-700 mt-1 italic">
                              Delivery Notes: "{orderNotes}"
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutStep(1);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-3.5 py-2 border border-emerald-600 text-emerald-900 hover:bg-emerald-100 text-xs font-semibold rounded flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Change Address</span>
                        <span className="text-[10px] font-normal">(ایڈریس تبدیل کریں)</span>
                      </button>
                    </div>

                    {/* Step 2: National & International Payment Protocol + Anti-Fraud Verification */}
                    <div className="bg-white border border-black/[0.07] p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                          02. Select Payment Method
                        </h2>
                        <p className="text-[11px] text-[#575653] mt-0.5">
                          {isNationalPakistan
                            ? 'Pakistan Checkout · Supported payment methods: Cash on Delivery, NayaPay, and RAAST/IBAN bank transfer with TID.'
                            : 'International orders outside Pakistan require 100% Advance Settlement or Logistics Freight Quote.'}
                        </p>
                      </div>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          paymentVerification.valid ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {paymentVerification.valid
                          ? `✓ METHOD READY (Risk Score: ${paymentVerification.fraudScore}%)`
                          : '✕ PAYMENT DETAILS REQUIRED'}
                      </span>
                    </div>

                    {/* Checkout Notice */}
                    <div className="flex items-center gap-2.5 p-3.5 bg-amber-50/70 border border-amber-300 text-xs text-amber-900 rounded">
                      <ShieldCheck className="w-4 h-4 shrink-0 text-amber-700" />
                      <span className="font-medium leading-relaxed">
                        Select Cash on Delivery or transfer via Bank / RAAST / NayaPay and submit your Transaction ID (TID). Orders remain <strong>PENDING_VERIFICATION</strong> until verified by store administration.
                      </span>
                    </div>

                    {/* Payment Method Selector Tabs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* 1. Cash on Delivery (COD) */}
                      {isCodAvailable && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('COD')}
                          className={`p-3.5 text-center border rounded flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative ${
                            paymentMethod === 'COD'
                              ? 'border-[#F85606] bg-[#FFF8F5] shadow-xs ring-1 ring-[#F85606]'
                              : 'border-black/15 bg-white hover:border-black/30'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-amber-600 flex items-center justify-center text-white shadow-xs">
                            <Truck className="w-5 h-5" />
                          </div>
                          <div className="leading-tight">
                            <span className="block text-xs font-bold text-[#141413]">Cash on Delivery (COD)</span>
                            <span className="block text-[10px] text-amber-700 font-semibold mt-0.5">Pay at Doorstep</span>
                          </div>
                          {paymentMethod === 'COD' && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F85606]" />
                          )}
                        </button>
                      )}

                      {/* 2. Bank Transfer / RAAST */}
                      {isRaastAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('RAAST_IBAN');
                            setPaymentSubMethod('RAAST');
                          }}
                          className={`p-3.5 text-center border rounded flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative ${
                            paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER'
                              ? 'border-[#F85606] bg-[#FFF8F5] shadow-xs ring-1 ring-[#F85606]'
                              : 'border-black/15 bg-white hover:border-black/30'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-[#006C35] flex items-center justify-center text-white shadow-xs">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div className="leading-tight">
                            <span className="block text-xs font-bold text-[#141413]">Bank Transfer / RAAST</span>
                            <span className="block text-[10px] text-[#787774] mt-0.5">Submit TID / Reference</span>
                          </div>
                          {(paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER') && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F85606]" />
                          )}
                        </button>
                      )}

                      {/* 3. NayaPay Wallet */}
                      {isNayaPayAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('NAYAPAY');
                            setPaymentSubMethod('NAYAPAY');
                          }}
                          className={`p-3.5 text-center border rounded flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative ${
                            paymentMethod === 'NAYAPAY'
                              ? 'border-[#F85606] bg-[#FFF8F5] shadow-xs ring-1 ring-[#F85606]'
                              : 'border-black/15 bg-white hover:border-black/30'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-[#F37021] flex items-center justify-center text-white font-bold text-xs shadow-xs">
                            NP
                          </div>
                          <div className="leading-tight">
                            <span className="block text-xs font-bold text-[#141413]">NayaPay Wallet</span>
                            <span className="block text-[10px] text-[#787774] mt-0.5">Submit TID / Reference</span>
                          </div>
                          {paymentMethod === 'NAYAPAY' && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F85606]" />
                          )}
                        </button>
                      )}

                      {/* 4. International Customs Quote (only outside Pakistan) */}
                      {isManualQuoteAvailable && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('MANUAL_QUOTE')}
                          className={`p-3.5 text-center border rounded flex flex-col items-center justify-center gap-2 transition-all cursor-pointer relative ${
                            paymentMethod === 'MANUAL_QUOTE'
                              ? 'border-[#F85606] bg-[#FFF8F5] shadow-xs ring-1 ring-[#F85606]'
                              : 'border-black/15 bg-white hover:border-black/30'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full bg-stone-700 flex items-center justify-center text-white shadow-xs">
                            <Mail className="w-5 h-5" />
                          </div>
                          <div className="leading-tight">
                            <span className="block text-xs font-bold text-[#141413]">Customs &amp; Freight Quote</span>
                            <span className="block text-[10px] text-[#787774] mt-0.5">Concierge Review</span>
                          </div>
                          {paymentMethod === 'MANUAL_QUOTE' && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F85606]" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* ========================================================================= */}
                    {/* PAYMENT METHOD FORM PANELS */}
                    {/* ========================================================================= */}

                    {/* 1. CASH ON DELIVERY (COD) PANEL */}
                    {paymentMethod === 'COD' && isNationalPakistan && (
                      <div className="p-5 bg-white border border-amber-300 rounded space-y-4 text-xs">
                        <div className="p-4 bg-amber-50/70 border border-amber-300 rounded space-y-2 text-amber-950">
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-amber-700" />
                            <strong className="text-xs">Cash on Delivery (COD) · Pay at Doorstep</strong>
                          </div>
                          <p className="text-[11px] leading-relaxed text-amber-900">
                            Pay cash directly to the courier agent when your package is delivered to your doorstep.
                          </p>
                          <ul className="list-disc pl-4 text-[10.5px] space-y-0.5 text-amber-800">
                            <li>Please prepare exact cash of <strong>{formatPKR(grandTotal)}</strong> upon delivery.</li>
                            <li>Standard parcel transit: 2–4 business days via Leopards / TCS.</li>
                          </ul>
                        </div>

                        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded text-[11px] text-amber-950 flex items-center justify-between">
                          <span>Payable Amount at Delivery:</span>
                          <strong className="font-mono text-sm text-amber-900 font-bold">
                            {formatPKR(grandTotal)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* 2. BANK TRANSFER / RAAST PANEL */}
                    {(paymentMethod === 'RAAST_IBAN' || paymentMethod === 'BANK_TRANSFER') && (
                      <div className="p-5 bg-white border border-[#006C35]/30 rounded space-y-4 text-xs">
                        {/* Store Treasury Bank Details */}
                        <div className="p-4 bg-[#F8F9FA] border border-black/[0.08] rounded space-y-2 text-[#333333]">
                          <div className="flex items-center justify-between pb-1 border-b border-black/[0.06]">
                            <strong className="text-xs text-[#141413] flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-[#006C35]" />
                              Official Store Bank &amp; RAAST Account Details
                            </strong>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded">
                              MANUAL TRANSFER
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                            <div>
                              <span className="text-[#787774] block">Bank Name:</span>
                              <strong className="text-[#141413]">{settings.bankName || 'Askari Bank / Meezan Bank / HBL'}</strong>
                            </div>
                            <div>
                              <span className="text-[#787774] block">Account Title:</span>
                              <strong className="text-[#141413]">{settings.raastAccountTitle || settings.storeName || 'Atelier Aurelia Treasury'}</strong>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-[#787774] block">IBAN / RAAST ID:</span>
                              <strong className="font-mono text-[#006C35] text-xs font-bold select-all">
                                {settings.raastIban || 'Askari / Meezan (Details in Admin Settings)'}
                              </strong>
                            </div>
                          </div>
                          <p className="text-[10.5px] text-[#666666] pt-1 border-t border-black/[0.06]">
                            {settings.bankTransferInstructions || 'Please transfer the exact order amount via your mobile banking app or RAAST. After transferring, enter the Transaction ID (TID) from your receipt below.'}
                          </p>
                        </div>

                        {/* Customer TID Submission Form */}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-[#141413] mb-1">
                              Bank / RAAST Transaction ID (TID) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={wireReferenceNumber}
                              onChange={(e) => setWireReferenceNumber(e.target.value.toUpperCase())}
                              placeholder="e.g. 240810192834 or RAAST-984210"
                              className="w-full px-3.5 py-2.5 bg-white border border-black/20 rounded font-mono text-xs focus:border-[#006C35] focus:ring-1 focus:ring-[#006C35] outline-hidden uppercase"
                            />
                            <span className="block text-[10px] text-[#787774] mt-1">
                              Required: Min 6 alphanumeric characters from your bank receipt / SMS
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-[#141413] mb-1">
                                Your Sender Account Title (Optional)
                              </label>
                              <input
                                type="text"
                                value={walletAccountTitle}
                                onChange={(e) => setWalletAccountTitle(e.target.value)}
                                placeholder="Your Name on Bank Account"
                                className="w-full px-3.5 py-2 bg-white border border-black/20 rounded text-xs outline-hidden"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[#141413] mb-1">
                                Sender Bank Name (Optional)
                              </label>
                              <select
                                value={bankAccountName}
                                onChange={(e) => setBankAccountName(e.target.value)}
                                className="w-full px-3.5 py-2 bg-white border border-black/20 rounded text-xs outline-hidden cursor-pointer"
                              >
                                <option value="Meezan Bank">Meezan Bank</option>
                                <option value="HBL">HBL (Habib Bank Limited)</option>
                                <option value="Bank Alfalah">Bank Alfalah</option>
                                <option value="MCB">MCB Bank</option>
                                <option value="Standard Chartered">Standard Chartered</option>
                                <option value="UBL">UBL</option>
                                <option value="Faysal Bank">Faysal Bank</option>
                                <option value="Askari Bank">Askari Bank</option>
                                <option value="Other Bank / RAAST">Other Bank / RAAST</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Order Verification Notice */}
                        <div className="p-3 bg-amber-50/80 border border-amber-300 rounded text-[11px] text-amber-950 space-y-1">
                          <strong className="block font-semibold">⚠️ Verification Workflow:</strong>
                          <p className="leading-relaxed">
                            Your order will stay in <strong>PENDING_VERIFICATION</strong> status. Our administration team will verify the transfer in our bank records. Only after admin approval will the payment status change to <strong>Payment Received</strong>.
                          </p>
                        </div>

                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-950 flex items-center justify-between">
                          <span>Amount to Transfer:</span>
                          <strong className="font-mono text-sm text-[#006C35] font-bold">
                            {formatPKR(grandTotal)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* 3. NAYAPAY PANEL */}
                    {paymentMethod === 'NAYAPAY' && (
                      <div className="p-5 bg-white border border-[#F37021]/30 rounded space-y-4 text-xs">
                        {/* Store NayaPay Wallet Details */}
                        <div className="p-4 bg-[#F8F9FA] border border-black/[0.08] rounded space-y-2 text-[#333333]">
                          <div className="flex items-center justify-between pb-1 border-b border-black/[0.06]">
                            <strong className="text-xs text-[#141413] flex items-center gap-1.5">
                              Official Store NayaPay Wallet Details
                            </strong>
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-800 font-bold text-[10px] rounded">
                              MANUAL TRANSFER
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                            <div>
                              <span className="text-[#787774] block">Account Title:</span>
                              <strong className="text-[#141413]">{settings.nayapayAccountTitle || settings.storeName || 'Atelier Aurelia'}</strong>
                            </div>
                            <div>
                              <span className="text-[#787774] block">NayaPay Number / ID:</span>
                              <strong className="font-mono text-[#F37021] text-xs font-bold select-all">
                                {settings.nayapayNumber || '0300-XXXXXXX (Configured in Settings)'}
                              </strong>
                            </div>
                          </div>
                          <p className="text-[10.5px] text-[#666666] pt-1 border-t border-black/[0.06]">
                            {settings.nayapayInstructions || 'Send payment via NayaPay to the merchant number above. Enter your 6+ digit Transaction ID (TID) from your NayaPay receipt below.'}
                          </p>
                        </div>

                        {/* Customer TID Submission Form */}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-[#141413] mb-1">
                              NayaPay Transaction ID (TID) <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={wireReferenceNumber}
                              onChange={(e) => setWireReferenceNumber(e.target.value.toUpperCase())}
                              placeholder="e.g. NAYA-84920192 or 12-digit TID"
                              className="w-full px-3.5 py-2.5 bg-white border border-black/20 rounded font-mono text-xs focus:border-[#F37021] focus:ring-1 focus:ring-[#F37021] outline-hidden uppercase"
                            />
                            <span className="block text-[10px] text-[#787774] mt-1">
                              Required: Enter the Transaction ID from your NayaPay transfer confirmation
                            </span>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-[#141413] mb-1">
                              Your Sender NayaPay Mobile Number (Optional)
                            </label>
                            <input
                              type="tel"
                              value={walletMobileNumber}
                              onChange={(e) => setWalletMobileNumber(e.target.value)}
                              placeholder="03XX-XXXXXXX"
                              className="w-full px-3.5 py-2 bg-white border border-black/20 rounded font-mono text-xs outline-hidden"
                            />
                          </div>
                        </div>

                        {/* Order Verification Notice */}
                        <div className="p-3 bg-amber-50/80 border border-amber-300 rounded text-[11px] text-amber-950 space-y-1">
                          <strong className="block font-semibold">⚠️ Verification Workflow:</strong>
                          <p className="leading-relaxed">
                            Your order will stay in <strong>PENDING_VERIFICATION</strong> status. Our administrator will verify the funds in our NayaPay wallet before marking the order as <strong>Payment Received</strong>.
                          </p>
                        </div>

                        <div className="p-3 bg-orange-50 border border-orange-200 rounded text-[11px] text-orange-950 flex items-center justify-between">
                          <span>Amount to Transfer:</span>
                          <strong className="font-mono text-sm text-[#F37021] font-bold">
                            {formatPKR(grandTotal)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* 4. INTERNATIONAL CONCIERGE QUOTE PANEL */}
                    {paymentMethod === 'MANUAL_QUOTE' && !isNationalPakistan && (
                      <div className="p-5 bg-white border border-[#C5A059]/40 rounded space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <strong className="text-[#141413]">International Shipping &amp; Customs Quote Concierge</strong>
                          <span className="px-2 py-0.5 bg-[#C5A059] text-[#0B0F17] font-mono text-[10px] font-semibold rounded">
                            QUOTE REQUIRED
                          </span>
                        </div>
                        <p className="text-[#575653] leading-relaxed text-[11px]">
                          Your destination ({country}) requires a binding freight and customs tariff calculation. Our concierge will calculate exact dimensional weight with DHL/FedEx before payment is requested.
                        </p>
                      </div>
                    )}

                    {/* Real-Time Payment Status Validation Banner */}
                    <div
                      className={`p-3 border rounded text-xs font-mono ${
                        paymentVerification.valid
                          ? 'bg-emerald-50/70 border-emerald-600/40 text-emerald-900'
                          : 'bg-rose-50/70 border-rose-500/40 text-rose-900'
                      }`}
                    >
                      {paymentVerification.message}
                    </div>

                    <div>
                      <label className="block text-xs text-[#575653] mb-1">
                        Concierge / Delivery Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Gate code, landmark, or preferred delivery hour"
                        className="w-full px-3.5 py-2 border border-black/15 text-xs rounded"
                      />
                    </div>
                  </div>

                    {/* Action Buttons Row on Step 2 */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutStep(1);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-5 py-4 border border-black/20 text-[#141413] hover:bg-[#F7F6F2] text-xs font-semibold uppercase tracking-wider rounded cursor-pointer flex items-center justify-center gap-2 transition-colors shrink-0"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back to Address</span>
                      </button>

                      <button
                        type="submit"
                        disabled={
                          isSubmittingOrder ||
                          cart.length === 0 ||
                          !addressVerification.isFullyVerified ||
                          !paymentVerification.valid
                        }
                        className="flex-1 py-4 bg-[#F85606] hover:bg-[#E04D05] text-white text-xs font-bold uppercase tracking-widest rounded shadow-sm disabled:opacity-40 disabled:hover:bg-[#F85606] cursor-pointer transition-colors flex items-center justify-center gap-2"
                      >
                        {isSubmittingOrder ? (
                          'Processing & Confirming Order...'
                        ) : !paymentVerification.valid ? (
                          'Complete Payment Details to Continue'
                        ) : (
                          <>
                            <Lock className="w-4 h-4" />
                            <span>
                              {paymentMethod === 'COD'
                                ? `Confirm Order (Cash on Delivery) · ${formatPKR(grandTotal)}`
                                : `Submit Order with TID (${paymentMethod === 'NAYAPAY' ? 'NayaPay' : 'Bank/RAAST'}) · ${formatPKR(grandTotal)}`}
                            </span>
                            <span className="text-[10px] opacity-80">(${grandTotal.toFixed(2)})</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#787774] text-center mt-2 leading-relaxed">
                      🔒 {paymentMethod === 'COD'
                        ? 'Pay cash directly to courier on delivery.'
                        : 'Order will stay in PENDING_VERIFICATION status until verified and approved by the store administrator.'}
                    </p>
                  </div>
                )}
                </form>

                {/* Right Order Summary */}
                <aside className="lg:col-span-5 bg-white border border-black/[0.07] p-6 space-y-6">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                    Acquisition Summary ({cartCount} Pieces)
                  </h2>

                  <div className="divide-y divide-black/[0.06] max-h-80 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={`${item.productId}-${item.variantLabel}`}
                        className="py-3 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 bg-[#F7F6F2] shrink-0 overflow-hidden">
                            <ProductImage src={item.primaryImage} alt={item.name} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#141413] truncate">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-[#787774]">
                              {item.variantLabel} · Qty {item.quantity}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs font-mono tabular-nums font-semibold text-right">
                          <div>${(item.price * item.quantity).toLocaleString()}</div>
                          <div className="text-[10px] text-[#8C6D46]">{formatPKR(item.price * item.quantity)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-black/[0.07] space-y-2 text-xs">
                    <div className="flex justify-between text-[#575653]">
                      <span>Subtotal</span>
                      <span className="font-mono tabular-nums">{formatDualPrice(cartSubtotal, true)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-[#166534]">
                        <span>Privilege Discount ({appliedCoupon?.code})</span>
                        <span className="font-mono tabular-nums">-{formatDualPrice(discountAmount, true)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-start text-[#575653]">
                      <div>
                        <span className="block font-medium text-[#141413]">
                          {liveShippingCalc.carrier}
                        </span>
                        <span className="block text-[10px] text-[#787774]">
                          {liveShippingCalc.zoneName} · {liveShippingCalc.billableWeightKg}kg billable
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-right">
                        {isQuoteFlow ? (
                          <span className="text-[#8C6D46] font-medium">Pending Quote</span>
                        ) : liveShippingCalc.freeShippingApplied ? (
                          <span className="text-emerald-700">COMPLIMENTARY</span>
                        ) : (
                          <>
                            ${shippingFeeUsd.toFixed(2)}
                            <span className="block text-[10px] text-[#8C6D46]">
                              {formatPKR(shippingFeeUsd)}
                            </span>
                          </>
                        )}
                      </span>
                    </div>

                    {/* Customs Tariff & Tax Breakdown */}
                    <div className="flex justify-between text-[#575653]">
                      <div>
                        <span>Tax &amp; Customs</span>
                        <span className="block text-[10px] text-[#787774]">
                          {isNationalPakistan
                            ? `Sales Tax (${settings.taxRate}%)`
                            : `Export Tax 0% · Customs Mode: ${liveShippingCalc.customsMode}`}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums">
                        {taxAmount > 0 ? formatDualPrice(taxAmount, true) : 'PKR 0 (DAP)'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-[#F7F6F2] border border-black/[0.05] text-[10px] text-[#575653] leading-relaxed">
                      <strong>Customs Term:</strong> {liveShippingCalc.customsNotice}
                    </div>

                    <div className="flex justify-between text-base font-semibold text-[#141413] pt-3 border-t border-black/[0.07]">
                      <span>Total Due</span>
                      <span className="font-mono tabular-nums text-right">
                        ${grandTotal.toFixed(2)}
                        <span className="block text-xs text-[#8C6D46]">{formatPKR(grandTotal)}</span>
                      </span>
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </div>
        )}

        {/* ======================== 5. CLIENT ACCOUNT & ORDER TIMELINE ======================== */}
        {subView === 'ACCOUNT' && (
          <div className="max-w-[1200px] mx-auto px-6 py-12 space-y-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-black/[0.07] gap-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-[#8C6D46]">
                  Private Client Dossier
                </div>
                <h1 className="text-3xl font-display font-medium text-[#141413]">
                  {firebaseUser ? userProfile?.name : 'Guest Collector Session'}
                </h1>
                <p className="text-xs text-[#575653] mt-1">
                  {firebaseUser
                    ? `${userProfile?.email} · Role: ${userProfile?.role}`
                    : 'Sign in with Google to synchronize orders, saved pieces, and admin privileges across devices.'}
                </p>
              </div>

              <div>
                {firebaseUser ? (
                  <button
                    onClick={signOut}
                    className="px-5 py-2.5 border border-black/20 text-xs font-medium hover:border-[#141413] cursor-pointer"
                  >
                    Sign Out
                  </button>
                ) : (
                  <button
                    onClick={signInWithGoogle}
                    className="px-6 py-3 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                  >
                    Sign In with Google
                  </button>
                )}
              </div>
            </div>

            {/* Store Owner & Seller Hub Card */}
            <div className="p-6 bg-gradient-to-r from-[#141413] via-[#1c1c1a] to-[#252523] text-white border border-[#C5A059]/40 space-y-4 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#C5A059]/20 text-[#C5A059] border border-[#C5A059]/30 text-[11px] font-semibold tracking-wider uppercase">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Store Owner &amp; Seller Hub · دکان کا کنٹرول پینل</span>
                  </div>
                  <h2 className="text-xl font-display font-medium text-white">
                    Product Listing &amp; Catalog Management (پراڈکٹ لسٹنگ)
                  </h2>
                  <p className="text-xs text-white/70 max-w-2xl leading-relaxed">
                    Apni dukan ka catalog dekhne aur manage karne ke liye neeche buttons istemal karein.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    onClick={() => onOpenAdmin('PRODUCTS')}
                    className="px-4 py-2.5 border border-white/20 hover:border-white text-white text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Package className="w-4 h-4" />
                    <span>New Listing ({products.length})</span>
                  </button>
                  <button
                    onClick={() => onOpenAdmin('DASHBOARD')}
                    className="px-4 py-2.5 border border-white/20 hover:border-white text-white text-xs font-medium cursor-pointer transition-colors"
                  >
                    <span>Full Admin Console</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-xl font-display font-medium text-[#141413]">
                Order History & Fulfillment Timelines ({orders.length})
              </h2>

              {orders.length === 0 ? (
                <div className="p-8 bg-white border border-black/[0.07] text-xs text-[#575653]">
                  No orders recorded in this session yet. Explore the collection to place your first order.
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="p-6 bg-white border border-black/[0.07] space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-black/[0.05]">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-mono font-semibold text-sm text-[#141413]">
                            {order.orderNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-[#787774]">
                            {order.createdAt.slice(0, 10)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-[#141413]">
                            Status:{' '}
                            {order.status === 'PENDING' ? (
                              <span className="text-amber-800 font-semibold">
                                PENDING (Awaiting Payment · پروسیسنگ تصدیق کے بعد ہو گی)
                              </span>
                            ) : order.status === 'CONFIRMED' ? (
                              <span className="text-emerald-800 font-semibold">
                                CONFIRMED (Processing &amp; Fulfillment)
                              </span>
                            ) : (
                              <span className="font-semibold">{order.status}</span>
                            )}
                          </span>
                          <span aria-hidden="true">·</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[#787774]">Payment:</span>
                            {order.paymentStatus === 'PAID' ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold text-[10px] rounded">
                                ✓ PAID · Verified &amp; Confirmed
                              </span>
                            ) : order.paymentStatus === 'PENDING_VERIFICATION' ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-[10px] rounded">
                                ⏳ PENDING VERIFICATION · Unpaid (رقم زیرِ تصدیق)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-medium text-[10px] rounded">
                                {order.paymentStatus}
                              </span>
                            )}
                            <span className="text-[#787774]">({order.paymentMethod})</span>
                            {order.paymentReference && (
                              <span className="text-[#8C6D46] font-mono font-semibold text-[11px]">
                                Ref: {order.paymentReference}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="font-mono tabular-nums text-sm font-semibold text-[#141413] text-right">
                          <span>${order.total.toFixed(2)}</span>
                          <span className="block text-xs text-[#8C6D46]">{formatPKR(order.total)}</span>
                        </div>
                      </div>

                      {/* Prominent Payment Notice for unverified orders */}
                      {order.paymentStatus === 'PENDING_VERIFICATION' && (
                        <div className="p-3 bg-amber-50/90 border border-amber-300 text-xs text-amber-900 rounded space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span>⚠️ Payment Notice (رقم کٹوتی اور تصدیق کی تفصیل):</span>
                            <span className="text-[10px] font-mono bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                              NOT CHARGED AUTOMATICALLY
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            آپ کے اکاؤنٹ سے پیسے خودکار طور پر نہیں کٹے۔ آرڈر ابھی <strong>PENDING</strong> ہے اور اسٹور ایڈمن کی طرف سے رقم کی تصدیق ہونے پر ہی آرڈر کنفرم ہو گا اور تیاری شروع ہو گی۔
                          </p>
                        </div>
                      )}

                      <div className="text-xs text-[#575653] flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <span className="text-[#787774]">Store: </span>
                          <strong className="text-[#141413] font-semibold">{settings.storeName || 'Atelier Aurelia'}</strong>
                          <span className="mx-2 text-black/20">|</span>
                          <span className="text-[#787774]">Destination: </span>
                          {order.shippingAddressSummary || 'In-Boutique Collection'}
                        </div>
                        <div className="flex items-center gap-3">
                          {order.trackingNumber && (
                            <div className="font-mono">
                              Tracking: <strong>{order.trackingNumber}</strong>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => openGmailReceiptModal(order)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            View Received Gmail Receipt
                          </button>
                        </div>
                      </div>

                      {/* Interactive International Shipping Quote Workflow Banner */}
                      {order.status === 'QUOTE_REQUESTED' && (
                        <div className="p-3 bg-amber-50 border border-amber-300 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <strong className="text-amber-950">Freight Quote Requested</strong>
                            <span className="text-[10px] font-mono bg-amber-200 text-amber-900 px-2 py-0.5">UNDER REVIEW</span>
                          </div>
                          <p className="text-amber-900 text-[11px]">
                            Our logistics concierge in Pakistan is reviewing actual and volumetric weights with DHL/FedEx to determine binding shipping rates and customs declarations.
                          </p>
                        </div>
                      )}

                      {order.status === 'QUOTE_READY' && (
                        <div className="p-4 bg-emerald-50 border border-emerald-600/40 text-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <strong className="text-emerald-950 font-medium">Formal Freight &amp; Customs Quote Ready</strong>
                            <span className="text-[10px] font-mono bg-emerald-600 text-white px-2 py-0.5">ACTION REQUIRED</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] bg-white p-3 border border-emerald-600/20">
                            <div>Courier: <strong className="text-black block">{order.quoteCourier || 'DHL Express'}</strong></div>
                            <div>Customs: <strong className="text-black block">{order.quoteCustomsMode || 'DAP'}</strong></div>
                            <div>Delivery: <strong className="text-black block">{order.quoteEstimatedDays || '4–6 days'}</strong></div>
                            <div>Shipping Fee: <strong className="text-emerald-800 block">PKR {order.quoteAmount?.toLocaleString()}</strong></div>
                          </div>
                          {order.quoteAdminNotes && (
                            <p className="text-[11px] text-[#575653] italic">
                              Concierge Note: {order.quoteAdminNotes}
                            </p>
                          )}
                          <div className="flex items-center gap-3 pt-1">
                            <button
                              type="button"
                              onClick={() => acceptOrRejectShippingQuote(order.id, true)}
                              className="px-4 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-semibold cursor-pointer"
                            >
                              ✓ Accept Quote &amp; Proceed to Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => acceptOrRejectShippingQuote(order.id, false)}
                              className="px-3 py-2 border border-rose-300 text-rose-800 text-xs font-medium cursor-pointer"
                            >
                              ✕ Decline Quote
                            </button>
                          </div>
                        </div>
                      )}

                      {order.status === 'QUOTE_ACCEPTED' && (
                        <div className="p-3 bg-blue-50 border border-blue-300 text-xs space-y-1">
                          <strong className="text-blue-950">Freight Quote Accepted</strong>
                          <p className="text-blue-900 text-[11px]">
                            Carrier: {order.quoteCourier || 'DHL Express'} ({order.quoteCustomsMode || 'DAP'}). Total balance: PKR {order.total?.toLocaleString()}. Payment remains {order.paymentStatus}. Please initiate bank wire or RAAST transfer to confirm shipment.
                          </p>
                        </div>
                      )}

                      {order.status === 'QUOTE_REJECTED' && (
                        <div className="p-3 bg-slate-100 border border-slate-300 text-xs text-slate-700">
                          <strong>Freight Quote Declined</strong> — Order closed without charge.
                        </div>
                      )}

                      {/* Order Fulfillment Stepper Timeline */}
                      <div className="grid grid-cols-5 gap-2 pt-2">
                        {(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const).map(
                          (step, idx) => {
                            const statusOrder = [
                              'PENDING',
                              'CONFIRMED',
                              'PROCESSING',
                              'PACKED',
                              'SHIPPED',
                              'OUT_FOR_DELIVERY',
                              'DELIVERED',
                            ];
                            const currentIdx = statusOrder.indexOf(order.status as any);
                            const stepIdx = statusOrder.indexOf(step);
                            const active = currentIdx >= stepIdx;
                            return (
                              <div key={step} className="space-y-1">
                                <div
                                  className={`h-1 w-full ${
                                    order.status === 'CANCELLED' || order.status === 'REFUNDED'
                                      ? 'bg-[#991B1B]/30'
                                      : active
                                      ? 'bg-[#141413]'
                                      : 'bg-black/10'
                                  }`}
                                />
                                <span className="block text-[10px] font-mono uppercase text-[#787774]">
                                  0{idx + 1}. {step}
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================== 6. WISHLIST VIEW ======================== */}
        {subView === 'WISHLIST' && (
          <div className="max-w-[1360px] mx-auto px-6 py-12 space-y-8">
            <h1 className="text-3xl font-display font-medium text-[#141413]">
              Saved Collector Pieces ({wishlist.length})
            </h1>
            {wishlist.length === 0 ? (
              <div className="p-10 bg-white border border-black/[0.07] text-xs text-[#575653]">
                Your wishlist is empty. Click the heart icon on any piece to save it for later inspection.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {products
                  .filter((p) => wishlist.includes(p.id))
                  .map((product) => (
                    <div
                      key={product.id}
                      className="p-5 bg-white border border-black/[0.07] flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div
                          onClick={() => handleSelectProduct(product)}
                          className="aspect-[4/3] bg-[#F7F6F2] mb-4 overflow-hidden cursor-pointer"
                        >
                          <ProductImage src={product.primaryImage} alt={product.name} />
                        </div>
                        <h3 className="text-sm font-semibold text-[#141413]">{product.name}</h3>
                        <p className="text-xs font-mono tabular-nums text-[#575653] mt-1">
                          <span className="font-semibold text-[#141413]">{formatPKR(product.price)}</span> (${product.price.toLocaleString()} USD) · {product.stock} in stock
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => addToCart(product, 1)}
                          className="flex-1 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                        >
                          Move to Bag
                        </button>
                        <button
                          onClick={() => toggleWishlist(product.id)}
                          className="p-2 border border-black/15 text-[#575653] hover:text-[#141413] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Slide-Over Shopping Bag Drawer */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FBFBF9] h-full flex flex-col justify-between border-l border-black/10 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.08]">
              <h2 className="text-xl font-display font-medium text-[#141413]">
                Shopping Bag ({cartCount})
              </h2>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="px-2.5 py-1 border border-black/15 text-[11px] text-[#575653] hover:text-[#141413] cursor-pointer"
                  >
                    Clear Bag
                  </button>
                )}
                <button
                  onClick={() => setCartDrawerOpen(false)}
                  className="p-1.5 text-[#575653] hover:text-[#141413] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 divide-y divide-black/[0.06]">
              {cart.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#575653]">
                  Your shopping bag is currently empty.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={`${item.productId}-${item.variantLabel}`}
                    className="py-4 flex gap-4"
                  >
                    <div className="w-16 h-16 bg-[#F3F2EE] shrink-0 overflow-hidden">
                      <ProductImage src={item.primaryImage} alt={item.name} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold text-[#141413] truncate">
                          {item.name}
                        </h4>
                        <button
                          onClick={() => removeFromCart(item.productId, item.variantLabel)}
                          className="text-[#787774] hover:text-[#141413] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[11px] text-[#787774] mt-0.5">{item.variantLabel}</div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center border border-black/15 bg-white">
                          <button
                            onClick={() =>
                              updateCartQuantity(
                                item.productId,
                                item.quantity - 1,
                                item.variantLabel
                              )
                            }
                            className="px-2 py-1 text-xs cursor-pointer"
                          >
                            -
                          </button>
                          <span className="px-2.5 text-xs font-mono tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateCartQuantity(
                                item.productId,
                                item.quantity + 1,
                                item.variantLabel
                              )
                            }
                            className="px-2 py-1 text-xs cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-xs font-mono tabular-nums font-semibold text-right">
                          <div>${(item.price * item.quantity).toLocaleString()}</div>
                          <div className="text-[10px] text-[#8C6D46]">{formatPKR(item.price * item.quantity)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="pt-4 border-t border-black/[0.08] space-y-4">
                {/* Promotional Code Box */}
                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Promo code (e.g. ATELIER15)"
                      className="flex-1 px-3 py-2 bg-white border border-black/15 text-xs font-mono uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const res = applyCouponCode(couponInput);
                        setCouponFeedback(res.message);
                      }}
                      className="px-4 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                  {couponFeedback && (
                    <div className="text-[11px] text-[#575653] mt-1 flex items-center justify-between">
                      <span>{couponFeedback}</span>
                      {appliedCoupon && (
                        <button
                          onClick={() => {
                            removeCoupon();
                            setCouponFeedback(null);
                          }}
                          className="underline text-[#991B1B] cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-[#575653]">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">{formatDualPrice(cartSubtotal, true)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-[#166534]">
                      <span>Discount ({appliedCoupon?.code})</span>
                      <span className="font-mono tabular-nums">-{formatDualPrice(discountAmount, true)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold text-[#141413] pt-2 border-t border-black/[0.06]">
                    <span>Estimated Total</span>
                    <span className="font-mono tabular-nums text-right">
                      ${Math.max(0, cartSubtotal - discountAmount).toFixed(2)}
                      <span className="block text-xs text-[#8C6D46]">
                        {formatPKR(Math.max(0, cartSubtotal - discountAmount))}
                      </span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCartDrawerOpen(false);
                    setConfirmedOrderNumber(null);
                    setCheckoutStep(1);
                    setSubView('CHECKOUT');
                  }}
                  className="w-full py-3.5 bg-[#141413] text-[#FBFBF9] text-xs font-semibold uppercase tracking-widest hover:bg-[#2A2A28] cursor-pointer"
                >
                  Proceed to Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quiet Editorial Footer */}
      <footer className="bg-[#141413] text-[#FBFBF9] border-t border-white/10 mt-20">
        <div className="max-w-[1360px] mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-4 gap-10 text-xs">
          <div className="space-y-3">
            <div className="text-xl font-display font-medium">{settings.storeName}</div>
            <p className="text-white/60 leading-relaxed">
              Architectural leather goods, Swiss mechanical horology, and botanical extraits. Operated with autonomous AI precision.
            </p>
          </div>
          <div className="space-y-2">
            <div className="font-semibold uppercase tracking-wider text-white/90">Collections</div>
            <ul className="space-y-1.5 text-white/60">
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setActiveCategory(c.name);
                      setSubView('CATALOG');
                    }}
                    className="hover:text-white cursor-pointer"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold uppercase tracking-wider text-white/90">Client Services & Helpline</div>
            <ul className="space-y-1.5 text-white/60">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setHelplineInitialTab('AI_CHAT');
                    setIsHelplineOpen(true);
                  }}
                  className="hover:text-emerald-400 text-left flex items-center gap-1.5 cursor-pointer text-emerald-300 font-medium"
                >
                  <Headphones className="w-3.5 h-3.5 text-emerald-400 inline" />
                  <span>24/7 AI Concierge & Helpline</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setHelplineInitialTab('WHATSAPP');
                    setIsHelplineOpen(true);
                  }}
                  className="hover:text-emerald-400 text-left flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400 inline" />
                  <span>WhatsApp: {settings.helplineWhatsAppFormatted || '+92 300 8472911'}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setHelplineInitialTab('EMAIL');
                    setIsHelplineOpen(true);
                  }}
                  className="hover:text-white text-left flex items-center gap-1.5 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5 inline text-white/60" />
                  <span>Email: {settings.helplineEmail || settings.contactEmail}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setHelplineInitialTab('PHONE');
                    setIsHelplineOpen(true);
                  }}
                  className="hover:text-white text-left flex items-center gap-1.5 cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5 inline text-white/60" />
                  <span>Helpline Desk: {settings.helplinePhone || '+92 (042) 3578-9000'}</span>
                </button>
              </li>
              <li>
                <PWAInstallButton variant="footer" />
              </li>
              <li>Insured Global Courier · 30-Day Returns</li>
            </ul>
          </div>
          <div className="space-y-3">
            <div className="font-semibold uppercase tracking-wider text-white/90">Private Dispatch</div>
            <p className="text-white/60">
              Receive invitations to numbered editions and private architectural salon previews.
            </p>
            <div className="flex">
              <input
                type="email"
                placeholder="Enter your email"
                className="bg-white/10 border border-white/20 px-3 py-2 text-xs text-white placeholder:text-white/40 flex-1 focus:outline-none"
              />
              <button className="px-4 py-2 bg-[#FBFBF9] text-[#141413] text-xs font-medium cursor-pointer">
                Join
              </button>
            </div>
          </div>
        </div>
        <div className="max-w-[1360px] mx-auto px-6 py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-[11px] text-white/50">
          <span>© 2026 {settings.storeName}. All Rights Reserved.</span>
          <span>Florence · Geneva · Paris · Zurich</span>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 7. AUTHENTIC GMAIL TRANSACTIONAL RECEIPT PREVIEW MODAL */}
      {/* Shows the exact Gmail received by customer with Store Name & Payment Confirmed */}
      {/* ========================================================================= */}
      {isGmailModalOpen && selectedGmailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-black/20 rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Google / Gmail Window Top Bar */}
            <div className="bg-[#F6F8FC] border-b border-[#E0E2EC] px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Google Gmail Brand Icon */}
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-[#EA4335] text-white rounded flex items-center justify-center font-bold text-sm shadow-xs">
                    M
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-[#1F1F1F] tracking-tight">Gmail</span>
                    <span className="text-[11px] text-[#5E5E5E] ml-2 font-mono">Inbox · Message Preview</span>
                  </div>
                </div>
                <span className="hidden sm:inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded-full">
                  ✓ Verified Payment Receipt
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-1.5 text-[#444746] hover:bg-black/5 rounded cursor-pointer"
                  title="Print Receipt"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsGmailModalOpen(false)}
                  className="p-1.5 text-[#444746] hover:bg-black/10 rounded cursor-pointer"
                  title="Close Preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Email Subject Bar */}
            <div className="px-6 py-4 bg-white border-b border-[#F0F0EE]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[#1F1F1F]">
                  {selectedGmailOrder.paymentReceiptEmailSubject ||
                    `Payment Recieved: Order #${selectedGmailOrder.orderNumber} | ${settings.storeName || 'Atelier Aurelia'}`}
                </h2>
                <span className="px-2 py-0.5 bg-[#E8F0FE] text-[#1A73E8] text-[11px] font-medium rounded">
                  Inbox
                </span>
              </div>

              {/* Sender & Recipient Metadata */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5E5E5E]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#141413] text-[#FBFBF9] flex items-center justify-center font-serif font-bold text-xs">
                    {(settings.storeName || 'A').slice(0, 1)}
                  </div>
                  <div>
                    <div className="font-semibold text-[#1F1F1F]">
                      {settings.storeName || 'Atelier Aurelia'} Official{' '}
                      <span className="font-normal text-[#5E5E5E]">
                        &lt;orders@{(settings.storeName || 'atelier').toLowerCase().replace(/[^a-z0-9]/g, '')}.com&gt;
                      </span>
                    </div>
                    <div className="text-[11px] text-[#747775]">
                      to: {selectedGmailOrder.customerEmail || 'customer@gmail.com'}
                    </div>
                  </div>
                </div>

                <div className="text-right text-[11px] font-mono text-[#747775]">
                  <div>Security: TLS Encryption ✓</div>
                  <div>Signed by: {(settings.storeName || 'atelier').toLowerCase().replace(/[^a-z0-9]/g, '')}.com</div>
                </div>
              </div>
            </div>

            {/* Email Body Message Container */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#F8F9FA] space-y-4">
              <div className="max-w-xl mx-auto bg-white border border-[#E0E2EC] shadow-sm rounded overflow-hidden">
                {/* Official Store Receipt Header */}
                <div className="bg-[#141413] text-[#FBFBF9] p-6 text-center">
                  <div className="text-lg font-serif font-medium tracking-widest uppercase">
                    {settings.storeName || 'Atelier Aurelia'}
                  </div>
                  <div className="text-[10px] tracking-widest text-[#C5A059] uppercase mt-1">
                    Official Transactional Receipt &amp; Payment Certificate
                  </div>
                </div>

                {/* Dynamic Status Banner based on actual verification status */}
                {selectedGmailOrder.paymentStatus === 'PAID' ? (
                  <div className="bg-emerald-50 border-b-2 border-emerald-500 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                        ✓
                      </div>
                      <div>
                        <strong className="text-emerald-950 text-sm block">
                          Apki Payment Recieved Ho Chuki Hy!
                        </strong>
                        <span className="text-xs text-emerald-800">
                          Payment verified and confirmed by Store Admin for Order #{selectedGmailOrder.orderNumber}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : selectedGmailOrder.paymentMethod === 'COD' ? (
                  <div className="bg-blue-50 border-b-2 border-blue-500 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                        📦
                      </div>
                      <div>
                        <strong className="text-blue-950 text-sm block">
                          Cash on Delivery Order Registered
                        </strong>
                        <span className="text-xs text-blue-800">
                          Order #{selectedGmailOrder.orderNumber} logged. Payment will be collected upon parcel handover.
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 border-b-2 border-amber-500 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 bg-amber-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                        ⏳
                      </div>
                      <div>
                        <strong className="text-amber-950 text-sm block">
                          Payment Awaiting Admin Verification
                        </strong>
                        <span className="text-xs text-amber-800">
                          Order #{selectedGmailOrder.orderNumber} recorded. Submitted TID is pending store admin verification.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Email Body Text */}
                <div className="p-6 space-y-5 text-xs text-[#1F1F1F]">
                  <p className="leading-relaxed">
                    Assalam-o-Alaikum <strong>{selectedGmailOrder.customerName || 'Valued Client'}</strong>,
                  </p>
                  <p className="text-[#444746] leading-relaxed">
                    {selectedGmailOrder.paymentStatus === 'PAID' ? (
                      <>We are pleased to inform you that your payment has been received and verified by <strong>{settings.storeName || 'Atelier Aurelia'}</strong> administration. Your order is confirmed and prioritized for fulfillment.</>
                    ) : selectedGmailOrder.paymentMethod === 'COD' ? (
                      <>Thank you for placing order <strong>#{selectedGmailOrder.orderNumber}</strong> via Cash on Delivery. The package is being prepared for dispatch, and full payment will be collected by the courier upon delivery.</>
                    ) : (
                      <>Thank you for placing order <strong>#{selectedGmailOrder.orderNumber}</strong>. You submitted a manual transfer with Transaction ID: <strong className="font-mono text-amber-900">{selectedGmailOrder.paymentReference || 'On Record'}</strong>. Our administration team is verifying the funds in our records. Once approved by an admin, the status will update to &quot;Payment Received&quot; and your order will be confirmed.</>
                    )}
                  </p>

                  {/* Payment Details Table */}
                  <div className="bg-[#FAF9F5] border border-[#EBE9DF] rounded p-4 space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">Store Name:</span>
                      <strong className="text-[#1F1F1F] font-bold">{settings.storeName || 'Atelier Aurelia'}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">Order Reference:</span>
                      <strong className="text-[#1F1F1F] font-semibold">{selectedGmailOrder.orderNumber}</strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">Payment Status:</span>
                      <strong className={selectedGmailOrder.paymentStatus === 'PAID' ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                        {selectedGmailOrder.paymentStatus === 'PAID'
                          ? 'PAID · VERIFIED BY ADMIN'
                          : selectedGmailOrder.paymentMethod === 'COD'
                          ? 'CASH ON DELIVERY (Pending Delivery)'
                          : 'PENDING_VERIFICATION (Awaiting Admin Approval)'}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">Payment Method:</span>
                      <span className="text-[#1F1F1F]">{selectedGmailOrder.paymentMethod}</span>
                    </div>
                    {selectedGmailOrder.paymentReference && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#747775]">Transaction ID (TID):</span>
                        <span className="text-[#8C6D46] font-bold">{selectedGmailOrder.paymentReference}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                      <span className="text-[#747775]">{selectedGmailOrder.paymentStatus === 'PAID' ? 'Total Amount Paid:' : 'Total Payable:'}</span>
                      <strong className="text-[#1F1F1F] font-bold text-sm">
                        PKR {Math.round(selectedGmailOrder.total * (settings.usdToPkrRate || 278.5)).toLocaleString()} (${selectedGmailOrder.total.toFixed(2)})
                      </strong>
                    </div>
                    {selectedGmailOrder.district && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#747775]">District:</span>
                        <strong className="text-[#1F1F1F] font-semibold">{selectedGmailOrder.district}</strong>
                      </div>
                    )}
                    {selectedGmailOrder.tehsil && (
                      <div className="flex justify-between items-center pb-1.5 border-b border-black/[0.06]">
                        <span className="text-[#747775]">Tehsil:</span>
                        <strong className="text-[#1F1F1F] font-semibold">{selectedGmailOrder.tehsil}</strong>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[#747775]">Delivery Address:</span>
                      <span className="text-[#1F1F1F] text-right truncate max-w-[220px]">
                        {selectedGmailOrder.shippingAddressSummary || 'On File'}
                      </span>
                    </div>
                  </div>

                  {/* Concierge Guarantee */}
                  <div className="p-3.5 bg-[#FAF9F5] border-l-3 border-[#C5A059] text-[11px] text-[#444746] leading-relaxed">
                    <strong>White-Glove Guarantee:</strong> Each piece undergoes precision inspection prior to sealed armored courier dispatch. You can inspect continuous status updates inside your Storefront Account.
                  </div>
                </div>

                {/* Footer in Email */}
                <div className="bg-[#F7F6F2] border-t border-[#E5E5E2] p-4 text-center text-[11px] text-[#747775]">
                  <div>{settings.storeName || 'Atelier Aurelia'} Private Concierge</div>
                  <div className="mt-0.5">Delivered to: {selectedGmailOrder.customerEmail}</div>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="bg-white border-t border-[#E0E2EC] px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[#5E5E5E] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Gmail Delivery Status: <strong className="text-[#1F1F1F]">Delivered to Inbox</strong></span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isResendingReceipt}
                  onClick={() =>
                    handleResendReceipt(
                      selectedGmailOrder.orderNumber,
                      selectedGmailOrder.customerEmail || 'customer@gmail.com'
                    )
                  }
                  className="px-3.5 py-2 border border-black/20 text-xs font-medium hover:border-black cursor-pointer"
                >
                  {isResendingReceipt ? 'Re-sending...' : '↺ Resend Email'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsGmailModalOpen(false)}
                  className="px-5 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer hover:bg-[#2A2A28]"
                >
                  Close Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7.5. GUEST & MEMBER LIVE ORDER TRACKING MODAL */}
      {/* Accessible via /track?order=...&token=... or on-screen Tracking Link */}
      {/* ========================================================================= */}
      {isTrackingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#FBFBF9] border border-black/10 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#141413] text-[#FBFBF9] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Package className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-semibold tracking-wide">Live Order Tracking & Status</h3>
                  <div className="text-[10px] text-white/60">Atelier Aurelia Courier & Verification Portal</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTrackingModalOpen(false)}
                className="text-white/60 hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Search Form */}
              <div className="p-4 bg-white border border-black/[0.08] rounded space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#787774] mb-1">
                      Order Reference (e.g. ORD-104928)
                    </label>
                    <input
                      type="text"
                      value={trackingOrderInput}
                      onChange={(e) => setTrackingOrderInput(e.target.value.toUpperCase())}
                      placeholder="ORD-XXXXXX"
                      className="w-full px-3 py-2 border border-black/20 text-xs font-mono uppercase bg-[#FBFBF9]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#787774] mb-1">
                      Access Token (for Guest Orders)
                    </label>
                    <input
                      type="text"
                      value={trackingTokenInput}
                      onChange={(e) => setTrackingTokenInput(e.target.value)}
                      placeholder="Token from confirmation or email"
                      className="w-full px-3 py-2 border border-black/20 text-xs font-mono bg-[#FBFBF9]"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={trackingLoading || !trackingOrderInput.trim()}
                    onClick={() => handleTrackOrder(trackingOrderInput, trackingTokenInput)}
                    className="px-5 py-2 bg-[#141413] hover:bg-[#2A2A28] disabled:opacity-40 text-white text-xs font-medium cursor-pointer flex items-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    {trackingLoading ? 'Searching...' : 'Locate Order'}
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {trackingError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{trackingError}</span>
                </div>
              )}

              {/* Order Tracking Dossier */}
              {trackedOrder && (
                <div className="space-y-4">
                  <div className="p-4 bg-white border border-black/[0.08] rounded space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-[#8C6D46] font-semibold">
                          Order Reference
                        </div>
                        <div className="text-lg font-mono font-bold text-[#141413]">
                          {trackedOrder.orderNumber}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded ${
                          trackedOrder.status === 'DELIVERED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : trackedOrder.status === 'SHIPPED'
                            ? 'bg-sky-100 text-sky-800'
                            : trackedOrder.status === 'CANCELLED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          Status: {trackedOrder.status}
                        </span>
                        <span className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded ${
                          trackedOrder.paymentStatus === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          Payment: {trackedOrder.paymentStatus}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[#787774] block">Payment Protocol:</span>
                        <strong className="text-[#141413]">{trackedOrder.paymentMethod}</strong>
                        {trackedOrder.paymentReference && (
                          <div className="text-[11px] text-[#8C6D46] pt-0.5">
                            TID: {trackedOrder.paymentReference}
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-[#787774] block">Total Amount:</span>
                        <strong className="text-[#141413] text-sm">
                          {trackedOrder.currency} {Number(trackedOrder.total).toLocaleString()}
                        </strong>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-[#787774] block">Shipping Destination:</span>
                        <span className="text-[#141413]">{trackedOrder.shippingAddressSummary}</span>
                      </div>
                      {trackedOrder.trackingNumber && (
                        <div className="sm:col-span-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded">
                          <span className="font-semibold block">Courier Tracking:</span>
                          <span className="font-mono text-xs">
                            {trackedOrder.courierName || 'Courier'} — {trackedOrder.trackingNumber}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Order Items */}
                    {Array.isArray(trackedOrder.items) && trackedOrder.items.length > 0 && (
                      <div className="border-t border-black/[0.06] pt-3 space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
                          Ordered Items ({trackedOrder.items.length})
                        </div>
                        <div className="divide-y divide-black/[0.04]">
                          {trackedOrder.items.map((it: any, idx: number) => (
                            <div key={idx} className="py-2 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-medium text-[#141413]">{it.name}</span>
                                <span className="text-[#787774] font-mono text-[11px] ml-2">({it.sku})</span>
                              </div>
                              <div className="font-mono text-right">
                                <span>{it.quantity} × {trackedOrder.currency} {Number(it.price).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Customer Cancellation Option for PENDING orders */}
                    {trackedOrder.status === 'PENDING' && (
                      <div className="border-t border-black/[0.06] pt-3 flex items-center justify-between">
                        <span className="text-[11px] text-[#787774]">
                          Order is currently pending fulfillment. You may cancel it to restore items.
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('Are you sure you want to cancel this order?')) return;
                            try {
                              const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
                              const cRes = await fetch('/api/orders/cancel', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                },
                                body: JSON.stringify({
                                  orderNumber: trackedOrder.orderNumber,
                                  orderAccessToken: trackingTokenInput || confirmedOrderAccessToken,
                                  reason: 'Cancelled by customer',
                                }),
                              });
                              const cData = await cRes.json();
                              if (cRes.ok) {
                                showToast?.('Order cancelled and inventory restored.');
                                handleTrackOrder(trackedOrder.orderNumber, trackingTokenInput);
                              } else {
                                showToast?.(cData.error || 'Failed to cancel order.');
                              }
                            } catch {
                              showToast?.('Network error cancelling order.');
                            }
                          }}
                          className="px-3.5 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium cursor-pointer"
                        >
                          Cancel Order
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-white border-t border-black/[0.08] flex justify-end">
              <button
                type="button"
                onClick={() => setIsTrackingModalOpen(false)}
                className="px-5 py-2 bg-[#141413] text-[#FBFBF9] text-xs font-medium cursor-pointer hover:bg-[#2A2A28]"
              >
                Close Tracking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. FLOATING 24/7 HELPLINE & CLIENT CONCIERGE WIDGET */}
      {/* Quick access to AI Chat, WhatsApp direct chat, and Email Tickets */}
      {/* ========================================================================= */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
        {/* Direct WhatsApp Instant Chat Launch Pill */}
        <a
          href={`https://wa.me/${settings.helplineWhatsApp || '923008472911'}?text=${encodeURIComponent(
            'Assalam o Alaikum Atelier Concierge, I need assistance regarding an inquiry.'
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Direct WhatsApp (${settings.helplineWhatsAppFormatted || '+92 300 8472911'})`}
          className="w-11 h-11 rounded-full bg-emerald-700 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg border border-emerald-500/40 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          <MessageCircle className="w-5 h-5" />
        </a>

        {/* 24/7 Helpline & AI Concierge Pill */}
        <button
          type="button"
          onClick={() => {
            setHelplineInitialTab('AI_CHAT');
            setIsHelplineOpen(true);
          }}
          className="px-4 py-2.5 rounded-full bg-[#141413] hover:bg-[#2A2A28] text-[#FBFBF9] shadow-xl border border-white/20 flex items-center gap-2.5 transition-transform hover:scale-105 active:scale-95 cursor-pointer text-xs font-medium"
        >
          <div className="relative flex items-center justify-center">
            <Headphones className="w-4 h-4 text-emerald-400" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          </div>
          <span className="font-semibold tracking-wide">24/7 Helpline & AI</span>
        </button>
      </div>

      {/* Customer Helpline Drawer Modal */}
      <CustomerHelplineDrawer
        isOpen={isHelplineOpen}
        onClose={() => setIsHelplineOpen(false)}
        initialTab={helplineInitialTab}
        initialOrderNumber={helplineOrderNumber}
      />
    </div>
  );
};
