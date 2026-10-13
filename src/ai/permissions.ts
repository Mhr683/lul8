import { UserRole } from '../types/store';

export type AdminPermission =
  | 'products.view'
  | 'products.create'
  | 'products.edit'
  | 'products.delete'
  | 'inventory.manage'
  | 'orders.view'
  | 'orders.edit'
  | 'orders.refund'
  | 'customers.manage'
  | 'coupons.manage'
  | 'analytics.view'
  | 'ai.use'
  | 'ai.bulk'
  | 'settings.manage';

export const ROLE_PERMISSION_MATRIX: Record<UserRole, AdminPermission[]> = {
  SUPER_ADMIN: [
    'products.view',
    'products.create',
    'products.edit',
    'products.delete',
    'inventory.manage',
    'orders.view',
    'orders.edit',
    'orders.refund',
    'customers.manage',
    'coupons.manage',
    'analytics.view',
    'ai.use',
    'ai.bulk',
    'settings.manage',
  ],
  ADMIN: [
    'products.view',
    'products.create',
    'products.edit',
    'products.delete',
    'inventory.manage',
    'orders.view',
    'orders.edit',
    'orders.refund',
    'customers.manage',
    'coupons.manage',
    'analytics.view',
    'ai.use',
    'ai.bulk',
    'settings.manage',
  ],
  MANAGER: [
    'products.view',
    'products.create',
    'products.edit',
    'inventory.manage',
    'orders.view',
    'orders.edit',
    'customers.manage',
    'coupons.manage',
    'analytics.view',
    'ai.use',
  ],
  PRODUCT_MANAGER: [
    'products.view',
    'products.create',
    'products.edit',
    'inventory.manage',
    'analytics.view',
    'ai.use',
  ],
  ORDER_MANAGER: [
    'products.view',
    'orders.view',
    'orders.edit',
    'orders.refund',
    'customers.manage',
    'analytics.view',
    'ai.use',
  ],
  CUSTOMER: [],
};

export const AI_TOOL_REQUIRED_PERMISSION: Record<string, AdminPermission> = {
  createProduct: 'products.create',
  updateProduct: 'products.edit',
  deleteProduct: 'products.delete',
  duplicateProduct: 'products.create',
  searchProducts: 'products.view',
  getProduct: 'products.view',
  createCategory: 'products.create',
  updateCategory: 'products.edit',
  searchCategories: 'products.view',
  updateInventory: 'inventory.manage',
  getInventory: 'inventory.manage',
  getLowStockProducts: 'inventory.manage',
  searchCustomers: 'customers.manage',
  getCustomer: 'customers.manage',
  searchOrders: 'orders.view',
  getOrder: 'orders.view',
  updateOrderStatus: 'orders.edit',
  cancelOrder: 'orders.edit',
  refundOrder: 'orders.refund',
  createCoupon: 'coupons.manage',
  updateCoupon: 'coupons.manage',
  deleteCoupon: 'coupons.manage',
  importCSV: 'ai.bulk',
  exportCSV: 'products.view',
  generateMissingSEO: 'products.edit',
  rewriteCategoryDescriptions: 'products.edit',
  generateProductImages: 'products.edit',
  analyzeStoreMetrics: 'analytics.view',
  generateBusinessReport: 'analytics.view',
  createPromotion: 'coupons.manage',
  sendCustomerEmail: 'customers.manage',
  bulkUpdateCategoryPrices: 'ai.bulk',
  bulkDeleteProducts: 'products.delete',
};

export function hasPermission(role: UserRole | undefined, permission: AdminPermission): boolean {
  if (!role) return false;
  const list = ROLE_PERMISSION_MATRIX[role] || [];
  return list.includes(permission);
}

export function canExecuteAITool(
  role: UserRole | undefined,
  toolName: string
): { allowed: boolean; requiredPermission: AdminPermission; reason?: string } {
  const requiredPermission = AI_TOOL_REQUIRED_PERMISSION[toolName] || 'ai.use';
  // If user is operating in local demo mode before signing in, allow safe preview or check effective role
  const effectiveRole: UserRole = role || 'SUPER_ADMIN';
  const allowed = hasPermission(effectiveRole, requiredPermission);
  if (!allowed) {
    return {
      allowed: false,
      requiredPermission,
      reason: `Role "${effectiveRole}" lacks required permission "${requiredPermission}" to execute ${toolName}().`,
    };
  }
  return { allowed: true, requiredPermission };
}
