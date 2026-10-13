export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateProductPayload(input: {
  name?: string;
  sku?: string;
  price?: number;
  stock?: number;
  category?: string;
}): ValidationResult {
  const errors: string[] = [];
  if (!input.name || typeof input.name !== 'string' || input.name.trim().length < 2) {
    errors.push('Product name must be at least 2 characters.');
  }
  if (input.name && input.name.length > 200) {
    errors.push('Product name cannot exceed 200 characters.');
  }
  if (input.sku !== undefined && input.sku.trim() !== '' && !/^[a-zA-Z0-9_-]+$/.test(input.sku.trim())) {
    errors.push('SKU must contain only alphanumeric characters, hyphens, or underscores.');
  }
  if (input.price === undefined || isNaN(Number(input.price)) || Number(input.price) <= 0) {
    errors.push('Price must be a valid positive number (> 0).');
  }
  if (input.stock !== undefined && (isNaN(Number(input.stock)) || Number(input.stock) < 0)) {
    errors.push('Stock quantity cannot be negative.');
  }
  if (!input.category || typeof input.category !== 'string' || input.category.trim().length === 0) {
    errors.push('Product category is required.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateCsvFileUpload(file: {
  name: string;
  size: number;
  type?: string;
}): ValidationResult {
  const errors: string[] = [];
  const maxBytes = 10 * 1024 * 1024; // 10MB max CSV/TSV upload
  const ext = file.name.toLowerCase().split('.').pop() || '';
  if (!['csv', 'tsv', 'txt'].includes(ext)) {
    errors.push('File extension must be .csv, .tsv, or .txt');
  }
  if (file.size > maxBytes) {
    errors.push('CSV file exceeds maximum size limit of 10MB.');
  }
  if (file.size === 0) {
    errors.push('Uploaded file is empty.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateCouponPayload(input: {
  code?: string;
  type?: string;
  value?: number;
  minCartAmount?: number;
}): ValidationResult {
  const errors: string[] = [];
  if (!input.code || !/^[A-Z0-9_-]{2,40}$/.test(input.code.toUpperCase())) {
    errors.push('Coupon code must be 2–40 uppercase alphanumeric characters.');
  }
  if (!input.type || !['PERCENTAGE', 'FIXED', 'FREE_SHIPPING', 'BOGO'].includes(input.type)) {
    errors.push('Invalid coupon discount type.');
  }
  if (input.value === undefined || isNaN(Number(input.value)) || Number(input.value) < 0) {
    errors.push('Coupon value must be non-negative.');
  }
  if (input.type === 'PERCENTAGE' && Number(input.value) > 100) {
    errors.push('Percentage discount cannot exceed 100%.');
  }
  return { valid: errors.length === 0, errors };
}

// Auto-detect CSV/TSV Delimiter (, ; \t |)
export function detectCsvDelimiter(rawText: string): string {
  const sample = rawText.replace(/^\uFEFF/, '').trim();
  if (!sample) return ',';

  // Check first 5 non-empty lines outside quotes
  const lines = sample.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
  if (lines.length === 0) return ',';

  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const line of lines) {
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && counts[ch] !== undefined) {
        counts[ch]++;
      }
    }
  }

  // Priority detection: Tab (from spreadsheet copy/paste) -> Semicolon -> Pipe -> Comma
  if (counts['\t'] > 0 && counts['\t'] >= counts[',']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  if (counts['|'] > counts[','] && counts['|'] > counts[';']) return '|';
  return ',';
}

// Full RFC-4180 Compliant Multi-line CSV & TSV Parser
export function parseCsvRFC4180(
  rawText: string,
  preferredDelimiter?: string
): {
  rows: string[][];
  malformedQuotes: boolean;
  detectedDelimiter: string;
} {
  const clean = rawText.replace(/^\uFEFF/, '');
  const delimiter =
    preferredDelimiter && preferredDelimiter !== 'auto'
      ? preferredDelimiter
      : detectCsvDelimiter(clean);

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let malformedQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const nextCh = clean[i + 1];

    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        // Escaped quotation "" -> "
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      // Cell delimiter
      currentRow.push(sanitizeCsvCell(currentCell));
      currentCell = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      // Line break outside of quotes
      if (ch === '\r' && nextCh === '\n') {
        i++; // skip \n in \r\n
      }
      currentRow.push(sanitizeCsvCell(currentCell));
      currentCell = '';

      // Only add row if it contains at least one non-empty cell
      if (currentRow.some((c) => c.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += ch;
    }
  }

  // Handle final row if file does not end with a trailing newline
  if (inQuotes) {
    malformedQuotes = true;
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(sanitizeCsvCell(currentCell));
    if (currentRow.some((c) => c.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return { rows, malformedQuotes, detectedDelimiter: delimiter };
}

// Single-line CSV Line Parser (backward-compatibility)
export function parseCsvLineRFC4180(
  line: string,
  delimiter = ','
): { cells: string[]; malformedQuotes: boolean } {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(sanitizeCsvCell(current));
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(sanitizeCsvCell(current));
  return { cells, malformedQuotes: inQuotes };
}

// Robust Price Parser (Handles $, PKR, Rs, ₨, ₹, €, £, trailing /-, /=, European/US decimals, spaces)
export function parseNumericPrice(raw: string): number {
  if (!raw || typeof raw !== 'string') return NaN;
  let cleaned = raw.trim();

  // Strip wrapping quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '').trim();

  // Strip trailing Pakistani/Indian ledger notation like /-, /=, /_
  cleaned = cleaned.replace(/[/][\-=_]+$/g, '').trim();

  // Strip currency prefixes, suffixes, and words
  cleaned = cleaned.replace(/[$€£¥₨₹]/g, '');
  cleaned = cleaned.replace(/\b(usd|eur|gbp|pkr|rs|inr|cad|aud|rupees?|rupee)\b/gi, '');
  cleaned = cleaned.replace(/rs\.?/gi, '');
  cleaned = cleaned.trim();

  // If both dot and comma exist: determine which is thousands and which is decimal
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      // European format: 1.500,50 -> dot is thousands, comma is decimal
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Standard US format: 1,500.50 -> comma is thousands, dot is decimal
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Only comma exists
    if (/^\d+,\d{1,2}$/.test(cleaned)) {
      // European decimal: "45,50" -> 45.50
      cleaned = cleaned.replace(',', '.');
    } else {
      // Thousands separator: "15,000" or "1,50,000" -> 15000
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes('.')) {
    // Only dot exists. If multiple dots (e.g., 1.500.000), strip dots as thousands separator
    const dotCount = (cleaned.match(/\./g) || []).length;
    if (dotCount > 1) {
      cleaned = cleaned.replace(/\./g, '');
    }
  }

  // Strip spaces
  cleaned = cleaned.replace(/\s+/g, '');
  // Keep only digits, minus, and dot
  cleaned = cleaned.replace(/[^0-9.-]/g, '');

  const val = Number(cleaned);
  return isNaN(val) ? NaN : Math.max(0, val);
}

// Auto-detect whether staged CSV text indicates PKR, USD, or Direct pricing
export function detectPriceCurrency(
  sampleText: string,
  headers: string[] = []
): 'PKR' | 'USD' | 'DIRECT' {
  const lowerText = sampleText.toLowerCase();
  const lowerHeaders = headers.map((h) => h.toLowerCase()).join(' ');

  // Strong signals for PKR / Pakistani Rupees
  if (
    lowerText.includes('pkr') ||
    lowerText.includes('rs.') ||
    lowerText.includes('rs ') ||
    lowerText.includes('₨') ||
    lowerText.includes('/-') ||
    lowerHeaders.includes('pkr') ||
    lowerHeaders.includes('rupee') ||
    lowerHeaders.includes('rs')
  ) {
    return 'PKR';
  }

  // Strong signals for USD ($)
  if (
    lowerText.includes('$') ||
    lowerText.includes('usd') ||
    lowerHeaders.includes('usd') ||
    lowerHeaders.includes('dollar')
  ) {
    return 'USD';
  }

  // If there are numbers > 300 without an explicit dollar sign, in Pakistani stores these are almost always PKR (e.g. 1500, 2500, 4000)
  const numbers = sampleText.match(/\b\d{3,7}(?:\.\d{2})?\b/g);
  if (numbers && numbers.length > 0) {
    const vals = numbers.map(Number).filter((n) => !isNaN(n));
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg >= 350 && !lowerText.includes('$') && !lowerHeaders.includes('usd')) {
      return 'PKR';
    }
  }

  return 'DIRECT';
}

// Robust Stock Parser (Defaults to 15 if omitted or blank)
export function parseNumericStock(
  raw: string,
  defaultStock = 15
): { stock: number; isDefault: boolean } {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { stock: defaultStock, isDefault: true };
  }
  const cleaned = raw.trim().replace(/,/g, '');
  const val = Number(cleaned);
  if (isNaN(val) || val < 0) {
    return { stock: defaultStock, isDefault: true };
  }
  return { stock: Math.round(val), isDefault: false };
}

export function sanitizeCsvCell(raw: string): string {
  let cleaned = raw.trim();
  // Strip dangerous spreadsheet formula prefixes (=, +, -, @) when followed by non-numeric text
  if (/^[=+\-@]/.test(cleaned) && isNaN(Number(cleaned))) {
    cleaned = cleaned.replace(/^[=+\-@]+/, '');
  }
  // Strip any script tags
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  return cleaned.trim();
}

export function validateAIToolArgs(
  toolName: string,
  args: Record<string, any>
): ValidationResult {
  const errors: string[] = [];
  switch (toolName) {
    case 'createProduct':
      return validateProductPayload({
        name: args.name,
        sku: args.sku,
        price: Number(args.price),
        stock: args.stock !== undefined ? Number(args.stock) : 15,
        category: args.category,
      });
    case 'updateProduct':
      if (!args.productIdOrName || String(args.productIdOrName).trim().length === 0) {
        errors.push('productIdOrName is required for updateProduct.');
      }
      if (args.price !== undefined && (isNaN(Number(args.price)) || Number(args.price) <= 0)) {
        errors.push('Updated price must be > 0.');
      }
      if (args.stock !== undefined && (isNaN(Number(args.stock)) || Number(args.stock) < 0)) {
        errors.push('Updated stock cannot be negative.');
      }
      break;
    case 'duplicateProduct':
    case 'deleteProduct':
    case 'generateProductImages':
      if (!args.productIdOrName || String(args.productIdOrName).trim().length === 0) {
        errors.push(`productIdOrName is required for ${toolName}.`);
      }
      break;
    case 'updateInventory':
      if (!args.productIdOrName || String(args.productIdOrName).trim().length === 0) {
        errors.push('productIdOrName is required for updateInventory.');
      }
      if (args.newStock === undefined || isNaN(Number(args.newStock)) || Number(args.newStock) < 0) {
        errors.push('newStock must be a non-negative integer (>= 0).');
      }
      break;
    case 'bulkUpdateCategoryPrices':
      if (!args.category || String(args.category).trim().length === 0) {
        errors.push('category is required for bulkUpdateCategoryPrices.');
      }
      const hasPct = args.percentageChange !== undefined && !isNaN(Number(args.percentageChange));
      const hasAmt = args.amountChange !== undefined && !isNaN(Number(args.amountChange));
      if (!hasPct && !hasAmt) {
        errors.push('Either amountChange or percentageChange must be provided for bulkUpdateCategoryPrices.');
      }
      if (hasPct && (Number(args.percentageChange) < -90 || Number(args.percentageChange) > 1000)) {
        errors.push('percentageChange must be between -90% and +1000%.');
      }
      if (args.currency && !['USD', 'PKR', 'RS', 'RUPEES'].includes(String(args.currency).toUpperCase().trim())) {
        errors.push('currency must be USD or PKR.');
      }
      break;
    case 'createCoupon':
      return validateCouponPayload({
        code: args.code,
        type: args.type,
        value: Number(args.value),
        minCartAmount: args.minCartAmount !== undefined ? Number(args.minCartAmount) : 0,
      });
    case 'deleteCoupon':
      if (!args.code || String(args.code).trim().length === 0) {
        errors.push('Coupon code is required for deleteCoupon.');
      }
      break;
    case 'updateOrderStatus':
    case 'cancelOrder':
    case 'refundOrder':
      if (!args.orderNumberOrId || String(args.orderNumberOrId).trim().length === 0) {
        errors.push(`orderNumberOrId is required for ${toolName}.`);
      }
      break;
    case 'sendCustomerEmail':
      if (!args.toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(args.toEmail).trim())) {
        errors.push('A valid recipient email address (toEmail) is required.');
      }
      if (!args.subject || String(args.subject).trim().length === 0) {
        errors.push('Email subject is required.');
      }
      if (!args.message || String(args.message).trim().length === 0) {
        errors.push('Email message body is required.');
      }
      break;
  }
  return { valid: errors.length === 0, errors };
}
