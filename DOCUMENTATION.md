# Agos — Architectural & Operational Documentation

Welcome to the official developer and operator documentation for **Agos**. This document serves as a comprehensive system guide, outlining the application’s design patterns, database architecture, multi-tier pricing, code modules, visual systems, and backup/restore workflows.

---

## 1. APPLICATION OVERVIEW

### App Name & Purpose
* **App Name:** Agos
* **Purpose:** A robust, real-time, full-featured retail management application designed to handle multi-branch retail operations, rapid barcoded point-of-sale checkout, dynamic multi-tier customer pricing, automated ledger-grade bookkeeping, purchase order orchestration, and store employee attendance logs.

### Core Value Proposition
This platform is built for fast-paced retail environments (such as electronics, vape and e-cigarette specialty shops, or boutique storefronts) looking to bridge the gap between brick-and-mortar register activities and cloud-synchronized executive reporting. It eliminates discrepancies in cash registers, automates stock-level tracking across sub-locations, manages purchase order cycles with suppliers, and tracks employee performance—all from a single, unified interface that runs smoothly on both modern desktop environments and mobile tablets.

### Key Workflows
1. **Dynamic Storefront Checkout (POS):** 
   Cashiers initiate high-speed transactions by adding items via fuzzy-search or scan inputs. The system queries active promotions and identifies customer-specific price tiers in real time. Transactions automatically split computed prices into VAT tax portions (using standard 12% calculation), handle split-method payments, update inventory levels on success, and push entries directly to the historical sales journals.
2. **Double-Entry Ledger Bookkeeping (Finance):** 
   Financial managers log account profiles (operational cash flow, vault storage, card processing accounts, accounts payable), record capital deposits/expenses, track real-time margin ratios, and perform store reconciliation exercises.
3. **Purchase Ordering & Stock Intake (Purchasing & Stock Adjustments):**
   When dynamic inventory counts slide below a custom warning threshold, managers draft Purchase Orders (PO) assigned to suppliers, approve order arrivals to instantly increment product quantities, and log precise manual overrides with documented audit justifications.
4. **Employee Verification and Shift Logs (Attendance):**
   Employees verification via individual logins, clocking in and clocking out with timestamp receipts to compile real-time, payroll-ready reports of regular and overtime hours.
5. **Data Protection and Redundancy Control (Backup & Settings):**
   Administrators can construct offline JSON snapshot archives representing the complete state of the retail database in one-click, and perform clean database restores to resolve data corruption or switch database instances.

---

## 2. SYSTEM ARCHITECTURE & TECH STACK

### Tech Stack
* **Core Layout Framework:** [React 18+](https://react.dev/) integrated with [Vite](https://vitejs.dev/) for high-speed compilation and client bundling.
* **Component Utility Library:** Custom UI structures compiled via [Tailwind CSS](https://tailwindcss.com/) utility classes, with a fluid design paradigm and structural typography paired with the functional `@import "tailwindcss";` compiler.
* **Real-time Synchronization Engine:** [Firebase Firestore](https://firebase.google.com/products/firestore) for active-sync document pipelines, multi-document batch operations, and snapshot state hooks.
* **Identity Management:** Google Firebase Authentication for credential verification and secure session persistence.
* **Icon Representation Set:** Icons sourced uniformly from the [Lucide React](https://lucide.dev/) library.

### Data Model & Schema

Below is a detailed representation of the structured database schemas declared and used in this ecosystem.

```
                  ┌─────────────────┐
                  │    Locations    │ (Multiple branches/outlets)
                  └────────┬────────┘
                           │ 1
                           │
                           │ N
┌──────────────┐  1    ┌───┴─────┐ N  1 ┌───────────────┐
│  Categories  ├───────┤Products ├──────┤ Price Tiers   │
└──────────────┘       └───┬─────┘      └───────────────┘
                           │ 1
                           │
                           │ N
                       ┌───┴─────┐ N  1 ┌───────────────┐
                       │  Sales  ├──────┤  Customers    │
                       └─────────┘      └───────────────┘
```

#### Primary Firestore Entities:

| Collection ID | Purpose | Essential Fields & Types |
| :--- | :--- | :--- |
| **locations** | Manages branches or retail outlets. | `id` (string), `name` (string), `code` (string), `address` (string), `phone` (string) |
| **categories** | For grouping products in POS/Inventory. | `id` (string), `name` (string), `description` (string) |
| **brands** | Represents product manufacturing brands. | `id` (string), `name` (string) |
| **suppliers** | External vendors for inventory restocking. | `id` (string), `name` (string), `contactPerson` (string), `email` (string), `phone` (string) |
| **products** | Product inventory records. | `id` (string), `sku` (string), `barcode` (string), `name` (string), `categoryId` (string), `brandId` (string), `cost` (number), `price` (number), `qty` (number), `minStock` (number), `locationId` (string), `tierPrices` (object: `Record<tierId, price>`) |
| **priceTiers** | Specialized custom customer pricing. | `id` (string), `name` (string), `discountPercentage` (number) |
| **customers** | Handles credit and tier records. | `id` (string), `name` (string), `phone` (string), `email` (string), `priceTierId` (string) |
| **sales** | Holds invoices and completed checkouts. | `id` (string), `invoiceNo` (string), `timestamp` (Timestamp), `cashierId` (string), `customerId` (string), `subtotal` (number), `discount` (number), `tax` (number), `total` (number), `paymentMethod` (string), `locationId` (string), `items` (array: `SaleItem[]`) |
| **purchaseOrders** | Purchasing logs for external validation. | `id` (string), `poNumber` (string), `supplierId` (string), `status` (string: `'pending' \| 'received'`), `totalAmount` (number), `items` (array: `POItem[]`) |
| **accounts** | Double-entry ledger accounts. | `id` (string), `name` (string), `type` (string: `'cash' \| 'bank' \| 'credit'`), `balance` (number) |
| **attendance** | Employee clock-in and work log tracking. | `id` (string), `userId` (string), `userName` (string), `date` (string), `clockIn` (Timestamp), `clockOut` (Timestamp), `status` (string), `hoursWorked` (number) |
| **audit_logs** | Real-time system activity tracker. | `id` (string), `timestamp` (Timestamp), `userId` (string), `userName` (string), `action` (string), `details` (string) |

---

## 3. COMPONENT & FILE STRUCTURE

### Directory Tree

The Agos codebase compiles through a clean modular structure, with a clear separation of business logic and view representations:

```
/
├── .env.example                     # Reference file for system secrets
├── metadata.json                    # Platform runtime config and permissions
├── package.json                     # Dependency manifest and executable scripts
├── vite.config.ts                   # Core bundling pipeline parameters
├── index.html                       # Base single page index configuration
└── src/
    ├── main.tsx                     # Primary bootstrap entry hook
    ├── index.css                    # Tailwind CSS definitions and custom typography
    ├── App.tsx                      # Core routing, system hooks & global guards
    ├── types/
    │   └── index.ts                 # Centralized system schemas and TypeScript enums
    ├── contexts/
    │   └── AuthContext.tsx          # Real-time state hub for identity and role validation
    ├── components/
    │   ├── ErrorBoundary.tsx        # Fallback view wrapper for React syntax/runtime errors
    │   ├── Layout.tsx               # Primary viewport grid framing side navigation
    │   ├── BarcodeScanner.tsx       # Text input/camera adapter for register parsing
    │   ├── ProductForm.tsx          # Reusable view modal for creating and updating stock
    │   ├── PurchaseOrderForm.tsx    # Procurement log orchestrator
    │   ├── ReturnForm.tsx           # Cashback transaction adjustments
    │   └── StockAdjustmentForm.tsx  # Direct inventory write adjustments
    └── pages/
        ├── Dashboard.tsx            # Business intelligence visualizer
        ├── Login.tsx                # Secure credential checking & offline fallback
        ├── POS.tsx                  # Transaction register interface
        ├── Inventory.tsx            # Storage control grid and cataloging
        ├── Purchasing.tsx           # Supplier transactions ledger
        ├── SalesHistory.tsx         # Transaction invoices and voids log
        ├── Finance.tsx              # Double-entry general ledger
        ├── Attendance.tsx           # Employee timecard clocks
        ├── Directory.tsx            # Customers, price tiers, and suppliers
        ├── Reports.tsx              # Exportable cash flow analysis reports
        └── Settings.tsx             # System parameters & DB Backup module
```

### State Management
* **Global Access Patterns:** Global system states—including session status, logged-in profiles, authorization clearances, and offline parameters—are handled by a high-level React Context Provider, `AuthContext.tsx`.
* **Real-time Synchronization Subscription:** The pages register active listener handles with `onSnapshot` queries to bind directly with Cloud Firestore. When an asset, transaction, or setting document shifts at the backend level, React components render changes dynamically, reflecting the accurate state instantly.
* **Ref/State Instacing:** To prevent layout lag, state arrays (e.g., active POS cart, quick barcode scans) run locally inside page-specific hooks. Direct commits write to the database in atomic actions (e.g., `writeBatch()`) to prevent partial failures in data consistency.

---

## 4. USER GUIDE & INTERFACES

### Screen-by-Screen Breakdown

#### 1. POS Registry Checkout (`/src/pages/POS.tsx`)
* **What the Cashier Sees:** A dual-column register view. The left-hand segment holds product groupings, search boxes, category filters, and product grid cards with live pricing. The right-hand segment displays the transaction cart, tax calculations (12% VAT), and quick-action payment keys.
* **Interaction Flow:** Scanning a barcode instantly pulls product details into the cart. Selecting a custom account matches their designated Price Tier, automatically recalculating sub-totals. Cashiers click `Pay`, confirm the cash/card/split allocation, and hit complete. The transaction is instantly pushed to Firestore, updating database quantities and logging financial entries in real-time.

#### 2. Inventory and Multi-Tier Catalogs (`/src/pages/Inventory.tsx`)
* **What the Inspector Sees:** A density-optimized listing containing warning chips for items running below minimum stock. Features tools for creating, editing, and deleting products.
* **Component Form:** Product details allow assigning dynamic, tier-specific selling variables directly. This allows a product with standard pricing of $100 to be assigned individual tier costs: $90 for VIP customers, and $85 for internal staff.

#### 3. General Ledger Business Hub (`/src/pages/Finance.tsx`)
* **What the Auditor Sees:** Accounts summary cards (Cash, Vault, Bank accounts) showing real-time ledger balances. The page holds active forms to record deposits and expenses, alongside structural tables displaying transactional histories (Capital Injections, Operating Costs, Rent, Utilities).

#### 4. Settings & Database Control Panel (`/src/pages/Settings.tsx`)
* **What the Admin Sees:** Business rules configuration (Tax margins, Currency preferences), Go-Live Production reset mechanics, and the master **Database Backup & Restore** cards.
* **The Backup Mechanism:** Clicking `Export JSON Backup` serializes each database document across all standard collections (e.g., products, sales, customers, directories, audit logs) into a single, structured backup JSON. It serializes complex datatypes (such as Firestore's Timestamp) safely into structured properties.
* **The Restore Process:** Select a local JSON file, opt for either **Merge & Update (Safe)** or **Pure Overwrite (Clean Replace)**, input the string confirmation `RESTORE`, and launch. The interface utilizes atomic Firestore batches of up to 400 entries per pipeline to ensure consistent restores.

---

### Edge Cases & Error Handling

* **Missing Key Offsets / Offline Local Mode:** If cloud Firestore initialization behaves as blocked, the application displays a descriptive link enabling admins to run POS routines entirely inside an integrated **Offline Sandbox Mode**.
* **Zero or Empty Form Triggers:** Form submission is guarded by validation checks at the user interface level, preventing broken configurations from reaching database fields.
* **Network & Database Outages:** Firewalls and network timeouts are caught gracefully. Database processes present retry triggers alongside clean indicators via `/src/components/ErrorBoundary.tsx` to prevent complete viewport failures.

---

## 5. LOCAL SETUP & DEPLOYMENT GUIDE

### Prerequisites
1. **NodeJS Engine:** A modern version of standard runtime NodeJS installed locally (Node LTS version 18 or superior is strongly recommended).
2. **Environment Key Values:** Configure `.env` using `.env.example` as a template. Note that keys must NOT run client side prefixes unless deliberately required:
   ```env
   # Firebase Cloud Core Configurations
   VITE_FIREBASE_API_KEY=your_core_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
   VITE_FIREBASE_PROJECT_ID=your_project_id_here
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
   VITE_FIREBASE_APP_ID=your_app_id_here
   ```

### Installation Steps

Execute this sequential script sequence inside your terminal to pull, mount, and launch this POS setup inside your workspace:

```bash
# 1. Access project workspace directory
cd parent-folder/pos-inventory-suite

# 2. Install all necessary dependencies declared inside package.json
npm install

# 3. Boot the local development hot reload server
npm run dev
```

The system will initialize a local dev server, accessible directly at `http://localhost:3000`.

### Deployment Instructions

#### Deploying on Vercel:
1. Initialize a Git repository, commit clean tracking files, and push them upstream to GitHub.
2. Link your repository with a new project in your **Vercel Dashboard**.
3. Apply these settings in the project configurations:
   * **Framework Preset:** `Vite`
   * **Build Command:** `npm run build`
   * **Output Directory:** `dist`
4. Copy all required keys and parameters from your local `.env` file, paste them into the **Environment Variables** panel in Vercel settings, and trigger build.

### 5.5 Software Patch Notes (Revision History)

To maintain a clean tracking records index without altering the core operational scopes of the system, this section details subsequent incremental updates, features, and patches released to production.

#### Patch v1.1: Flexible POS View Modes & Grouped Hierarchy
*   **Feature Integration:** Implemented toggleable register layouts in the Point-of-Sale (POS) interface (`/src/pages/POS.tsx`), adding interactive **List Mode** and **Grid Mode** selectors.
*   **Aesthetic Organization:** In List Mode, products are hierarchically grouped by **Category** and **Brand** out-of-the-box. This delivers structured catalog visibility, high-speed cash register workflows, and cleaner lists under heavy inventory counts.
*   **Add Qty Multiplier:** Added high-performance quantity increment/decrement blocks directly next to the search filter, enabling rapid bulk entry.

#### Patch v1.2: Branch-Level Inventory Permissions & Isolation
*   **Security Isolation:** Programmed strict location boundaries in the Inventory panel (`/src/pages/Inventory.tsx`). Non-administrative Staff (Cashiers) are strictly isolated to view only the stock counts associated with their assigned branch/location.
*   **Global Distribution Map:** Secured the multi-branch global stock grid, keeping it visible exclusively to authorized Admin accounts to deter unauthorized distribution leaks.

#### Patch v1.3: Employee Performance & Shift Analytics
*   **Interactive Analytics Dashboard:** Implemented a new, premium "Employee Performance" dashboard view inside the central reporting module (`/src/pages/Dashboard.tsx`) giving authorized managers comprehensive visual insights into employee sales activity and shift attendance.
*   **Active Subscriptions Pipeline:** Established real-time onSnapshot data streaming with Firebase Firestore for both the `users` and `attendance` collections, ensuring calculations on regular hours, overtime, and register orders stay actively synchronized.
*   **Multi-Tier KPI Leaderboards:** Created visual winner cards summarizing four essential retail KPI winners: Top Sales Volume (units), Top Revenue Generator (monetary sales), Most Hours Worked (attendance shifts), and Sales Efficiency (average units sold per logged hour).
*   **Toggleable Recharts bar charts:** Engineered an interactive Recharts bar comparison chart with customizable data toggle selection allowing operators to visually map and analyze team productivity (Net Units Sold, Hours Worked, Revenue, and Units/Hour) at a glance.
*   **Staff Ledger Grid with Multi-Device Compatibility:** Built a detailed Staff Performance Ledger table enabling real-time name searches, user-role filter selects, desktop-aligned table rows, and responsive, fluid mobile card stacks.
*   **Register Shrinkage and Return Audits:** Coded real-time tracking of individual cashier return frequencies and calculated a **Returns Accuracy Rate** to help administrators track customer satisfaction, measure accuracy, and prevent internal shrinkage.

---

## 6. SYSTEM SIGN-OFF & APPROVAL

This operational documentation outlines the approved and verified features of the **Agos** retail suite. By signing below, the representing stakeholders confirm that the system meets all current architectural requirements, functional parameters, and operational design expectations.

### Signatures

| Representing Party | Role / Designation | Signature / Stamp | Date Signed |
| :--- | :--- | :--- | :--- |
| **v4peavenue@gmail.com** | Product Owner / Lead Sponsor | ___________________________ | __________________ |
| **System Architect** | Chief Engineering Lead | ___________________________ | __________________ |
| **Lead Developer** | AI Coding Assistant | *Digitally Certified* | 2026-07-03 |
