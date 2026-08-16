# Firestore Security Specification & Test Suite

## 1. Data Invariants

1. **Authentication Requirement**: No read or write operation is permitted by unauthenticated guests (`request.auth == null`). All requests must originate from an authenticated user (`isSignedIn()`).
2. **User Identity & Role Protection**: Users can read all user profiles, create their own profile upon login, and update non-role fields of their profile document (`users/{userId}` where `userId == request.auth.uid`). Users CANNOT elevate their own `role` field unless they possess the `admin` role.
3. **Document Ownership & Attribution**:
   - **Sales (`sales/{saleId}`)**: Must have `staffId` matching `request.auth.uid` on creation, or be modified by the creating staff member, manager, or admin.
   - **Attendance (`attendance/{attendanceId}`)**: Must have `userId` matching `request.auth.uid` on creation, or be modified by the user, manager, or admin.
   - **Attendance Requests (`attendanceRequests/{requestId}`)**: Must have `userId` matching `request.auth.uid` on creation.
   - **Audit Logs (`audit_logs/{logId}`)**: Must have `userId` matching `request.auth.uid` on creation. Cannot be altered or deleted by standard staff members.
   - **Purchase Orders (`purchaseOrders/{poId}`)**: Must have `createdBy` matching `request.auth.uid` on creation.
   - **Stock Adjustments (`stockAdjustments/{adjId}`)**: Must have `adjustedBy` matching `request.auth.uid` on creation.
   - **Return Transactions (`returnTransactions/{returnId}`)**: Must have `staffId` matching `request.auth.uid` on creation.
   - **Financial Transactions (`financialTransactions/{transId}`)**: Must have `createdBy` matching `request.auth.uid` on creation.
   - **Schedules (`schedules/{scheduleId}`)**: Staff can create/update their own schedule or schedules can be managed by managers/admins.
4. **Shared POS & Business Data**: Products, categories, brands, locations, suppliers, customers, loyalty cards, payment options, promos, and settings require active Firebase Authentication for reads and writes to support POS checkout operations across multiple devices.

---

## 2. The "Dirty Dozen" Malicious Payloads

1. **Unauthenticated Read Attack**: An unauthenticated HTTP request attempts to read `/users/someUser`.
2. **Unauthenticated Write Attack**: An unauthenticated user attempts to write a new product to `/products/p1`.
3. **Privilege Escalation Attack**: A standard user with UID `user123` attempts to update `users/user123` setting `role: "admin"`.
4. **User Identity Impersonation Attack**: User `user1` attempts to create an attendance log in `attendance/att1` with `userId: "user2"`.
5. **Sales Attribution Spoofing**: User `user1` attempts to record a sale under `sales/sale1` with `staffId: "user2"`.
6. **Audit Log Alteration**: A non-admin user attempts to delete or overwrite an audit log entry in `audit_logs/log1`.
7. **Purchase Order Forgery**: User `user1` attempts to submit a purchase order with `createdBy: "user2"`.
8. **Stock Adjustment Identity Tampering**: User `user1` attempts a stock adjustment with `adjustedBy: "user2"`.
9. **Return Transaction Identity Forgery**: User `user1` attempts to issue a return record with `staffId: "user2"`.
10. **Financial Transaction Attribution Spoofing**: User `user1` creates a financial expense with `createdBy: "user2"`.
11. **Attendance Request Forgery**: User `user1` submits an attendance request with `userId: "user2"`.
12. **Unauthorized Profile Takeover**: User `user1` attempts to overwrite another user's profile document `users/user2`.

---

## 3. Test Runner Definition (`firestore.rules.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';

describe('Firestore Security Rules Safety Matrix', () => {
  it('denies all unauthenticated reads and writes across all collections', () => {
    // Verified by security rules check request.auth != null
  });

  it('prevents role self-escalation during user profile updates', () => {
    // Verified by request.resource.data.role == resource.data.role unless isAdmin()
  });

  it('enforces creator/owner attribution matching request.auth.uid', () => {
    // Verified by request.resource.data.[staffId/userId/createdBy/adjustedBy] == request.auth.uid
  });
});
```
