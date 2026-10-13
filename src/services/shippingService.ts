import {
  CartItem,
  CustomsMode,
  Product,
  ShippingCalculationSnapshot,
  ShippingZoneConfig,
  StoreSettings,
} from '../types/store';

export interface ShippingCalculationRequest {
  destinationCountryIso: string;
  items?: CartItem[];
  catalogProducts?: Product[];
  settings: StoreSettings;
  selectedCourier?: string;
  hasFreeShippingCoupon?: boolean;
  merchandiseSubtotalPkr?: number;
  discountPkr?: number;
  billableWeightKg?: number;
  actualWeightKg?: number;
  volumetricWeightKg?: number;
}

export interface ShippingCalculationResponse {
  isDomestic: boolean;
  destinationCountryIso: string;
  zoneName: string;
  carrier: string;
  availableCouriers: string[];
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
  quoteAllowed: boolean;
  explanation: string;
}

/**
 * Reusable server/client Shipping Service
 * Computes actual, volumetric and billable weights, destination zone rates,
 * domestic slab rules, and international manual quote criteria.
 */
export class ShippingCalculationService {
  /**
   * Pure deterministic calculation for Pakistan domestic shipping slab rule
   * Default rates:
   * - Base fee: PKR 250
   * - Included weight: 1.0 kg
   * - Additional weight: PKR 120 per additional kg (fractional kg rounded up via Math.ceil)
   * - Free shipping threshold: PKR 10,000 (calculated on merchandise subtotal after discounts)
   */
  static calculateDomesticRate(
    billableWeightKg: number,
    merchandiseSubtotalPkr: number,
    options?: {
      baseFee?: number;
      includedWeightKg?: number;
      perAdditionalKg?: number;
      freeShippingThreshold?: number;
      hasFreeShippingCoupon?: boolean;
      discountPkr?: number;
    }
  ): {
    shippingFee: number;
    freeShippingApplied: boolean;
    baseFee: number;
    additionalWeightFee: number;
    extraWeightKg: number;
    extraSlabs: number;
    explanation: string;
  } {
    const baseFee = options?.baseFee ?? 250;
    const includedWeightKg = options?.includedWeightKg ?? 1.0;
    const perAdditionalKg = options?.perAdditionalKg ?? 120;
    const freeShippingThreshold = options?.freeShippingThreshold ?? 10000;
    const discountPkr = options?.discountPkr ?? 0;
    const hasFreeShippingCoupon = Boolean(options?.hasFreeShippingCoupon);

    // Free shipping threshold is evaluated on net merchandise subtotal after discounts
    const netMerchandiseSubtotal = Math.max(0, merchandiseSubtotalPkr - discountPkr);
    const isEligibleForFreeShipping =
      hasFreeShippingCoupon ||
      (freeShippingThreshold > 0 && netMerchandiseSubtotal >= freeShippingThreshold);

    if (isEligibleForFreeShipping) {
      return {
        shippingFee: 0,
        freeShippingApplied: true,
        baseFee,
        additionalWeightFee: 0,
        extraWeightKg: 0,
        extraSlabs: 0,
        explanation: `Complimentary Domestic Delivery applied (Net subtotal PKR ${netMerchandiseSubtotal.toLocaleString()} meets or exceeds threshold PKR ${freeShippingThreshold.toLocaleString()}).`,
      };
    }

    const extraWeightKg = Math.max(0, billableWeightKg - includedWeightKg);
    // Rounding rule: any fractional kg beyond included weight counts as the next full 1 kg slab
    const extraSlabs = Math.ceil(extraWeightKg);
    const additionalWeightFee = extraSlabs * perAdditionalKg;
    const shippingFee = baseFee + additionalWeightFee;

    return {
      shippingFee,
      freeShippingApplied: false,
      baseFee,
      additionalWeightFee,
      extraWeightKg: Number(extraWeightKg.toFixed(2)),
      extraSlabs,
      explanation: `Base fee PKR ${baseFee} (first ${includedWeightKg}kg) + ${extraSlabs} additional kg slab(s) @ PKR ${perAdditionalKg}/kg = PKR ${shippingFee}.`,
    };
  }

  /**
   * Parse dimension string like "30cm x 20cm x 10cm" or "30 x 20 x 10" into cm tuple
   */
  static parseDimensions(dimStr?: string): { length: number; width: number; height: number } {
    if (!dimStr) return { length: 25, width: 20, height: 10 };
    const matches = dimStr.match(/(\d+(?:\.\d+)?)/g);
    if (matches && matches.length >= 3) {
      return {
        length: Math.max(1, parseFloat(matches[0])),
        width: Math.max(1, parseFloat(matches[1])),
        height: Math.max(1, parseFloat(matches[2])),
      };
    }
    return { length: 25, width: 20, height: 10 };
  }

  /**
   * Calculate comprehensive shipment metrics
   */
  static calculate(req: ShippingCalculationRequest): ShippingCalculationResponse {
    const {
      destinationCountryIso,
      items = [],
      catalogProducts = [],
      settings,
      selectedCourier,
      hasFreeShippingCoupon = false,
      merchandiseSubtotalPkr,
      discountPkr = 0,
    } = req;

    const destIso = (destinationCountryIso || 'PK').toUpperCase().trim();
    const isDomestic = destIso === 'PK';

    // 1. Calculate Subtotal, Actual Weight, and Volumetric Weight
    let subtotalPkr = merchandiseSubtotalPkr ?? 0;
    let totalActualWeightKg = req.actualWeightKg ?? 0;
    let totalVolumetricWeightKg = req.volumetricWeightKg ?? 0;

    if (items.length > 0 && merchandiseSubtotalPkr === undefined) {
      subtotalPkr = 0;
      totalActualWeightKg = 0;
      totalVolumetricWeightKg = 0;

      for (const item of items) {
        const prod = catalogProducts.find((p) => p.id === item.productId);
        const unitPrice = prod ? prod.price : item.price;
        const unitPriceInPkr =
          settings.currency === 'PKR'
            ? unitPrice * (settings.usdToPkrRate || 278.5)
            : unitPrice;
        subtotalPkr += unitPriceInPkr * item.quantity;

        const unitWeight = prod?.weightKg ?? 0.8;
        totalActualWeightKg += unitWeight * item.quantity;

        const dims = this.parseDimensions(prod?.dimensions);
        const divisor = settings.domesticVolumetricDivisor || 5000;
        const volWeightItem = (dims.length * dims.width * dims.height) / divisor;
        totalVolumetricWeightKg += volWeightItem * item.quantity;
      }
    }

    const calculatedBillable = Math.max(totalActualWeightKg, totalVolumetricWeightKg);
    const billableWeightKg = req.billableWeightKg !== undefined
      ? req.billableWeightKg
      : Math.max(0.1, Number(calculatedBillable.toFixed(2)));

    // 2. Domestic Pakistan Calculation
    if (isDomestic) {
      const carrier = selectedCourier || settings.domesticSupportedCouriers[0] || 'TCS';
      const domesticResult = this.calculateDomesticRate(billableWeightKg, subtotalPkr, {
        baseFee: settings.domesticBaseFee ?? 250,
        includedWeightKg: settings.domesticIncludedWeightKg ?? 1.0,
        perAdditionalKg: settings.domesticAdditionalPerKg ?? 120,
        freeShippingThreshold: settings.domesticFreeShippingThreshold ?? 10000,
        hasFreeShippingCoupon,
        discountPkr,
      });

      return {
        isDomestic: true,
        destinationCountryIso: 'PK',
        zoneName: 'Pakistan Domestic',
        carrier,
        availableCouriers: settings.domesticSupportedCouriers,
        actualWeightKg: Number(totalActualWeightKg.toFixed(2)),
        volumetricWeightKg: Number(totalVolumetricWeightKg.toFixed(2)),
        billableWeightKg,
        baseFee: domesticResult.baseFee,
        additionalWeightFee: domesticResult.additionalWeightFee,
        freeShippingApplied: domesticResult.freeShippingApplied,
        finalShippingFee: domesticResult.shippingFee,
        currency: 'PKR',
        customsMode: 'NOT_APPLICABLE',
        customsNotice: 'Domestic National Delivery: Standard Sales Tax included. No customs duties apply within Pakistan.',
        estimatedDelivery: '2–4 business days via verified courier',
        requiresManualQuote: false,
        quoteAllowed: false,
        explanation: domesticResult.explanation,
      };
    }

    // 3. International Calculation via Configured Shipping Zones
    const matchingZone = settings.internationalZones?.find((z) =>
      z.countries.includes(destIso)
    );

    if (matchingZone) {
      const carrier = selectedCourier || matchingZone.courier;
      const isEligibleForFreeShipping =
        hasFreeShippingCoupon ||
        (Boolean(matchingZone.freeShippingThreshold) &&
          subtotalPkr >= (matchingZone.freeShippingThreshold || Infinity));

      let baseFee = matchingZone.baseFee;
      let additionalWeightFee = 0;
      let finalShippingFee = 0;

      if (isEligibleForFreeShipping) {
        finalShippingFee = 0;
      } else {
        const includedWeight = matchingZone.includedWeightKg || 1.0;
        const extraWeight = Math.max(0, billableWeightKg - includedWeight);
        const extraSlabs = Math.ceil(extraWeight);
        additionalWeightFee = extraSlabs * matchingZone.perAdditionalKgFee;
        finalShippingFee = baseFee + additionalWeightFee;
      }

      const customsNotice =
        matchingZone.customsMode === 'DAP'
          ? 'Delivered at Place (DAP): International buyer / importer is responsible for destination country customs clearance, import tariffs, and local VAT.'
          : matchingZone.customsMode === 'DDP'
          ? 'Delivered Duty Paid (DDP): Seller arranges customs clearance and prepays destination duties.'
          : 'Customs declaration attached with invoice.';

      return {
        isDomestic: false,
        destinationCountryIso: destIso,
        zoneName: matchingZone.name,
        carrier,
        availableCouriers: [carrier],
        actualWeightKg: Number(totalActualWeightKg.toFixed(2)),
        volumetricWeightKg: Number(totalVolumetricWeightKg.toFixed(2)),
        billableWeightKg,
        baseFee,
        additionalWeightFee,
        freeShippingApplied: isEligibleForFreeShipping,
        finalShippingFee,
        currency: 'PKR',
        customsMode: matchingZone.customsMode,
        customsNotice,
        estimatedDelivery: matchingZone.estimatedDelivery,
        requiresManualQuote: false,
        quoteAllowed: true,
        explanation: isEligibleForFreeShipping
          ? `Complimentary International Shipping to ${matchingZone.name}.`
          : `Zone "${matchingZone.name}" rate: PKR ${baseFee.toLocaleString()} base + ${additionalWeightFee.toLocaleString()} weight surcharge (${billableWeightKg}kg billable).`,
      };
    }

    // 4. International Destination without configured zone -> Requires Manual Quote
    return {
      isDomestic: false,
      destinationCountryIso: destIso,
      zoneName: 'International (Unlisted Zone)',
      carrier: 'Custom Courier Concierge (DHL / FedEx)',
      availableCouriers: ['DHL Express Concierge', 'FedEx International'],
      actualWeightKg: Number(totalActualWeightKg.toFixed(2)),
      volumetricWeightKg: Number(totalVolumetricWeightKg.toFixed(2)),
      billableWeightKg,
      baseFee: 0,
      additionalWeightFee: 0,
      freeShippingApplied: false,
      finalShippingFee: 0,
      currency: 'PKR',
      customsMode: 'DAP',
      customsNotice: 'International Destination: Requires custom courier freight quote and clearance review.',
      estimatedDelivery: 'Subject to concierge courier quote',
      requiresManualQuote: true,
      quoteAllowed: settings.allowInternationalManualQuotes,
      explanation: `No automatic courier tariff configured for country ${destIso}. You may submit a formal International Shipping Quote Request. Our logistics concierge will assess weight (${billableWeightKg}kg) and issue a binding freight quote.`,
    };
  }

  /**
   * Convert Calculation to Persistent Order Snapshot
   */
  static createSnapshot(resp: ShippingCalculationResponse): ShippingCalculationSnapshot {
    return {
      destCountryIso: resp.destinationCountryIso,
      destZoneName: resp.zoneName,
      carrier: resp.carrier,
      actualWeightKg: resp.actualWeightKg,
      volumetricWeightKg: resp.volumetricWeightKg,
      billableWeightKg: resp.billableWeightKg,
      baseFee: resp.baseFee,
      additionalWeightFee: resp.additionalWeightFee,
      freeShippingApplied: resp.freeShippingApplied,
      finalShippingFee: resp.finalShippingFee,
      currency: resp.currency,
      customsMode: resp.customsMode,
      customsNotice: resp.customsNotice,
      estimatedDelivery: resp.estimatedDelivery,
      requiresManualQuote: resp.requiresManualQuote,
      calculatedAt: new Date().toISOString(),
    };
  }
}
