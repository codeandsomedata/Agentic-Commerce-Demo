# Firestore Security Specification

## 1. Data Invariants
1. **Product Identity vs. Offer Separation**: Every `/products/{productId}/offers/{offerId}` document MUST reference an existing parent `/products/{productId}` document via `exists()`, and `data.productId == productId`.
2. **Verified Write Identity**: All catalog mutations (`products`, `offers`) and `reservations` writes require `request.auth != null && request.auth.token.email_verified == true` and `data.ownerId == request.auth.uid` (or `userId == request.auth.uid`), or verified admin status.
3. **Immutable Ownership & Timestamps**: `ownerId`, `userId`, `productId`, and `createdAt` cannot change after creation; `createdAt == request.time` on create and `updatedAt == request.time` on create/update.
4. **Strict Payload & Size Caps**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), all strings enforce explicit `.size()` bounds, `dietary_tags` is bounded `<= 10` items with string index validation, and `keys().hasAll(...) && keys().hasOnly(...)` rejects ghost fields.
5. **Reservation Isolation & Terminal Lock**: Reservations contain user ownership (`userId`) and are strictly readable (`get` and `list`) only by the owning `userId` or admin; once cancelled (`status == 'cancelled'`), reservations are locked against further non-admin updates.

## 2. Adversarial "Dirty Dozen" Test Payloads
1. **Unauthenticated Product Write**: Attempt `create` on `/products/prod-1` with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Attempt `create` on `/products/prod-1` with `email: 'somdatta46@gmail.com'` and `email_verified: false` -> `PERMISSION_DENIED`.
3. **Shadow Ghost Field Injection**: Attempt `create` on `/products/prod-1` including extra field `isAdminApproved: true` -> `PERMISSION_DENIED`.
4. **Identity Spoofing on Product**: Attempt `create` on `/products/prod-1` with `ownerId: 'victim_uid'` when `auth.uid == 'attacker_uid'` -> `PERMISSION_DENIED`.
5. **ID Poisoning**: Attempt `create` on `/products/..%2Fadmin` or a 300-char ID -> `PERMISSION_DENIED`.
6. **Orphaned Offer Write**: Attempt `create` on `/products/nonexistent/offers/offer-1` -> `PERMISSION_DENIED`.
7. **Offer Parent Mismatch**: Attempt `create` on `/products/prod-1/offers/offer-1` with `productId: 'prod-2'` -> `PERMISSION_DENIED`.
8. **Negative Price / Stock Exhaustion**: Attempt `update` on `/products/prod-1/offers/offer-1` with `price: -5` or `stock_count: -1` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Attempt `create` on `/reservations/res-1` with backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Reservation Cross-User Scrape (`list` / `get`)**: Attempt `list` or `get` on `/reservations` where `resource.data.userId != request.auth.uid` -> `PERMISSION_DENIED`.
11. **Terminal State Mutation**: Attempt `update` on `/reservations/res-1` after `status == 'cancelled'` -> `PERMISSION_DENIED`.
12. **Self-Assigned Admin Escalation**: Attempt `create` on `/admins/attacker_uid` -> `PERMISSION_DENIED`.
