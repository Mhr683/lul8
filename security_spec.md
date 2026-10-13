# Security Specification — Atelier Aurelia E-Commerce Platform

## 1. Data Invariants
1. **Default Deny**: All unlisted collections and paths are strictly denied (`allow read, write: if false;`).
2. **PII Isolation**: `/users/{userId}` contains user email and phone; `get` and `list` are strictly restricted to the document owner (`request.auth.uid == userId`) or a verified Admin (`isAdmin()`).
3. **Privilege Escalation Prevention**: Regular users creating their `/users/{userId}` document can ONLY set `role == 'CUSTOMER'` unless they are the bootstrapped Super Admin (`specialforme683@gmail.com` with `email_verified == true`). During updates, non-admins cannot modify `role`, `uid`, or `createdAt`.
4. **Catalog Integrity**: `/products/{productId}`, `/categories/{categoryId}`, `/coupons/{couponId}`, and `/settings/{settingId}` are publicly readable for storefront visitors (`get`, `list`), but writes (`create`, `update`, `delete`) are strictly restricted to `isAdmin()` with full schema and boundary validation (`isValidProduct`, `isValidCategory`, `isValidCoupon`, `isValidSetting`).
5. **Order Isolation & Terminal State Locking**: `/orders/{orderId}` can only be read (`get`, `list`) by the order owner (`resource.data.userId == request.auth.uid`) or `isAdmin()`. Customers can create orders only where `incoming().userId == request.auth.uid`. Once an order reaches a terminal state (`CANCELLED`, `REFUNDED`, `DELIVERED`, `RETURNED`), non-admins cannot update it.
6. **Strict Timestamp & Key Validation**: All writes validate `hasAll` and `hasOnly` allowed keys, enforce string `.size()` bounds, regex patterns on IDs/SKUs/slugs, and prevent shadow fields.

## 2. The "Dirty Dozen" Payloads
1. **Shadow Field Injection on Product**: `{ id: "p1", sku: "SKU-1", ..., isShadowAdmin: true }` -> Rejected by `hasOnly()`.
2. **Self-Assigned Admin Role on User Signup**: `{ uid: "attacker", email: "a@b.com", name: "Eve", role: "SUPER_ADMIN", createdAt: "..." }` -> Rejected by role gate (`role == 'CUSTOMER'`).
3. **Unverified Admin Email Spoof**: Token with `email == 'specialforme683@gmail.com'` but `email_verified == false` attempting product deletion -> Rejected by `request.auth.token.email_verified == true`.
4. **Cross-User PII Read**: Authenticated user `uid_1` attempting `get(/users/uid_2)` -> Rejected by `isOwner(userId) || isAdmin()`.
5. **Blanket User List Scraping**: Authenticated user attempting `list(/users)` without `resource.data.uid == request.auth.uid` -> Rejected by query enforcer.
6. **Order Identity Spoofing**: Authenticated user `uid_1` creating an order with `userId: "uid_2"` -> Rejected by `incoming().userId == request.auth.uid`.
7. **Order Terminal State Mutation**: Non-admin attempting to update an order whose `existing().status == 'REFUNDED'` -> Rejected by terminal state lock.
8. **ID Poisoning Attack**: Creating a document with a 2KB document ID or special characters -> Rejected by `isValidId(id)`.
9. **Value Poisoning on Product Update**: Admin or user updating `price` to a string `"free"` or negative number `-500` -> Rejected by `isValidProduct(incoming())`.
10. **Immutable Field Modification**: Updating `createdAt` or `userId` on an existing Order or User -> Rejected by `incoming().createdAt == existing().createdAt`.
11. **Unauthorized Coupon Creation**: Customer attempting to create a 100% discount coupon in `/coupons` -> Rejected by `isAdmin()`.
12. **Audit Log Tampering**: Any user attempting to `delete` or `update` an `/audit_logs/{logId}` entry -> Rejected (`allow update, delete: if false;`).
