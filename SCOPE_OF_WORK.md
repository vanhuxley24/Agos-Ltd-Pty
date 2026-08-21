# SCOPE OF WORK (SOW)

**Project Name:** Agos Retail POS & Inventory Suite  
**Client:** v4peavenue@gmail.com (Vape Avenue)  
**Developer:** AI Coding Assistant & System Architect  
**Effective Date:** July 3, 2026  

---

## 1. PROJECT OVERVIEW
The **Agos Retail POS & Inventory Suite** is a full-stack, enterprise-grade cloud-hosted software system designed specifically to streamline multi-branch retail registers, track accurate real-time inventory, partition role-based staff visibility, implement multi-tier pricing architectures, and calculate precise financial ledgers (including tax distributions).

This document outlines the operational boundaries, milestones, and technical specifications delivered as part of the system development.

---

## 2. FUNCTIONAL SPECIFICATIONS & SCOPE DELIVERABLES

### Milestone 1: Authentication & Dynamic Location-Based Profiles
*   **Secure Cloud Authentication:** Direct Firebase Auth integration with secure user login, state monitoring, and dynamic profile redirection.
*   **Role-Based Security Tiers:** Distinct system behaviors for `Admin` vs. `Staff` (Cashier) profiles.
*   **Branch/Location Assignment:** Every user profile is assigned a specific active branch/location (e.g., Main Branch, Warehouse, North Branch).

### Milestone 2: Multi-Tier Catalog & Branch Inventory Control
*   **Multi-Branch Stocks Tracking:** Multi-variable inventory quantities associated with unique branches.
*   **Admin & Staff Stock Views:** Access to standard catalog records and inventory items to facilitate store transactions.
*   **Multi-Tier Pricing:** Independent pricing metrics configurable per product (e.g., Standard Retail, VIP Member Price, Employee Price, Wholesale Tier).
*   **Dynamic Low-Stock Alert Thresholds:** Customizable warning levels per location to highlight products nearing depletion.

### Milestone 3: POS Register System & Checkout Flow
*   **Visual Grid Catalog:** Displays product cards styled with live pricing and categorical tags inside the register panel.
*   **Dynamic Pricing Engine:** Cart updates price-level calculations instantly based on the selected customer account tier.
*   **Barcode & SKU Indexing:** Integrated fast-filter fields supporting keyboard enter-submission for physical scan triggers.
*   **Financial Checkout Calculations:** Real-time summary detailing Gross Totals, **12% VAT calculations**, custom discounts, and dual-ledger split payment capabilities (Cash, Card, E-Wallet, Split).

### Milestone 4: General Ledger & Business Intelligence
*   **Income & Expense Tracking:** Direct ledger inputs to account for operations overhead, payroll, supply acquisitions, and rental lines.
*   **Live Analytics Matrix:** High-performance data charts indicating profit margins, daily revenue metrics, and branch-specific performance reports.
*   **Real-time Audit Logs:** Immutable database registers logging user actions (e.g., cashouts, profile creation, stock adjustments, sales completions) to deter internal shrinkage.

### Milestone 5: Enterprise Logistics & Multi-Item Transfers
*   **Multi-Item Stock Transfers:** Inter-branch logistics orchestrator allowing multiple inventory lines to be dispatched in one atomic batch operation.
*   **Live Stock Validations:** Source location inventory balances are validated per item in real-time, preventing out-of-stock anomalies.
*   **Wide Modal Form Standardization:** Unified all interactive forms (`PurchaseOrderForm`, `StockTransferForm`, `StockAdjustmentForm`, `ProductForm`, `ReturnForm`) with spacious `lg:max-w-4xl` layouts.

### Milestone 6: On-Demand Query Guardrails & Read Shields
*   **Serverless Read Optimization:** Universal `DateRangeQueryGuardrail` engine across Reports, Dashboard, Sales History, and Attendance.
*   **Pre-Query Volume Estimation:** Lightweight `getCountFromServer()` metadata checks to inspect exact document counts before fetching full collections.

---

## 3. TECH STACK & ARCHITECTURE

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend Runtime** | React 18+ & TypeScript | Strictly typed component layouts, high performance. |
| **Development Engine**| Vite | Modern asset bundle pipeline. |
| **Styling Framework**  | Tailwind CSS | Utilitarian design tokens, responsive presets. |
| **Database & Auth**   | Firebase (Firestore & Auth) | Real-time listeners, server-less security rule structures. |
| **Data Visuals**      | Recharts & Lucide Icons | Responsive interactive SVG charts & iconography. |

---

## 4. PROJECT TIMELINE & OUTCOME VERIFICATION

| Phase | Description | Deliverables | Status |
| :---: | :--- | :--- | :---: |
| **01** | Database Schema & Core Architecture | Firestore collections design, user profile matrices. | **Completed** |
| **02** | Inventory Control & Security Filters | Role-based visibility logic, multi-branch quantities. | **Completed** |
| **03** | Register POS & Smart Views | Category/brand-grouped default list view, grid toggle. | **Completed** |
| **04** | General Ledger & Financial Reports | Audit log pipeline, tax breakdowns, live graphs. | **Completed** |
| **05** | Multi-Item Transfers & Form System | Batch stock transfers, wide form standardizations. | **Completed** |
| **06** | Query Guardrails & Final Compilation | Read cost estimator, build verification, docs. | **Completed** |

---

## 5. DEVELOPER PROTECTIONS, LICENSING, & SUPPORT AGREEMENT

### 5.1 Intellectual Property & Proprietary Rights
The Developer retains all copyright, ownership, and intellectual property (IP) rights over the custom source code, system configurations, database architectures, and graphical interface designs developed for this project. The Client (Vape Avenue) is granted a perpetual, non-exclusive, non-transferable, single-entity license to execute and utilize this software solely for their retail operations.

### 5.2 Anti-Piracy & Non-Distribution Clause
The Client is strictly prohibited from copying, duplicating, redistributing, sub-licensing, renting, leasing, selling, or transferring the source code, asset packages, or any derivative works of this application to any third-party developer, business entity, or competitor. 

### 5.3 Permanent Support & Violation Penalties
*   **Permanent Support Guarantee:** The Developer agrees to provide perpetual (lifetime) technical support for the core application (including bug fixes, minor performance optimization updates, and emergency database recovery guidance).
*   **Support Termination Policy:** **Any breach of the Non-Distribution Clause (e.g., sharing, copying, or reselling this suite to others) will result in the immediate, automatic, and irreversible termination of all permanent support agreements.** Any future technical intervention will then be billed at standard consulting hourly rates.

### 5.4 Payment Condition for Support Activation
The permanent support agreement is strictly contingent upon the full settlement of the remaining financial balance (**$4,000.00** USD) as documented in Invoice **INV-2026-0703**. Failure to settle the final payment suspends all technical support and development guarantees.

### 5.5 Limitation of Liability
The software is provided "as-is" without any express or implied warranties. The Developer shall not be held liable for any indirect, incidental, or consequential damages, including but not limited to loss of business revenues, retail database corruption, sales downtime, or inventory inaccuracies.

---

## 6. SYSTEM PATCH NOTES & REVISION HISTORY

To preserve the pristine definitions of the core milestones while accounting for the latest system releases, this section documents all feature improvements and security updates implemented as part of post-milestone patches.

### Patch v2.1: On-Demand Guardrail Queries & Serverless Quota Shields
*   **Universal Query Guardrail Engine:** Integrated `DateRangeQueryGuardrail` across Dashboard, Reports, Sales History, and Attendance modules to eliminate unintentional broad cloud queries.
*   **Server Count Pre-Estimation:** Executes lightweight `getCountFromServer()` metadata checks to inspect exact document volume and calculate expected read consumption before executing range queries.
*   **Active Loaded Range Verification:** Provides visual badge feedback, manual apply switches, and reset fallbacks to safeguard serverless database billing.

### Patch v2.0: Multi-Item Branch Stock Transfers & Wide Form Standardization
*   **Multi-Item Stock Transfers:** Transformed Branch Stock Transfers into a multi-item logistics interface with dynamic stock checkers and atomic batch commits.
*   **Wide Dialog Form Architecture:** Re-engineered all system modals (`PurchaseOrderForm`, `StockTransferForm`, `StockAdjustmentForm`, `ProductForm`, `ReturnForm`) with spacious `lg:max-w-4xl` layouts to remove scroll clipping.
*   **Audit Trail Expansion:** Every multi-item stock transfer automatically dispatches granular balance tracking to the immutable audit log.

### Patch v1.9: POS Customer Autocomplete, Staff Directory Access & Management Authorization
*   **POS Customer Autocomplete Search:** Replaced static customer dropdowns with dynamic search autocomplete supporting name/phone/email filtering and barcode loyalty cards.
*   **Staff Directory Access:** Granted Staff role users access to Directory for viewing and registering Customers and Loyalty Cards.
*   **Manager Void Approvals:** Enabled Managers alongside Administrators to void sales, returns, and purchase orders.

### Patch v1.8: Customer Search & Default Selection Rework
*   **Customer Name Search in Sales History:** Enabled customer filtering across Sales, Returns, and Pending Payments.
*   **Finance Cash Account Alignment:** Linked default cash filtering directly to configured cash accounts.
*   **Saturday–Friday Weekly Cycle:** Aligned weekly reporting cycles to Saturday–Friday periods.

### Patch v1.7: Editable Checkout, Range Schedules, & Admin Controls
*   **Editable Checkout Totals & Approvals:** Allowed staff to override transaction totals with manager approval workflows.
*   **Date Ranges on Schedules:** Enabled start/end date ranges with auto-plotting in staff scheduling.
*   **Admin-Restricted Expense Deletion:** Protected expense records with automatic balance refunds on deletion.

### Patch v1.3: Employee Performance & Shift Analytics
*   **Interactive Analytics Dashboard:** Deployed a dedicated "Employee Performance" dashboard view inside the manager control deck enabling direct analysis of staff productivity and KPI benchmarks.
*   **Real-Time Data Integration:** Established active Firestore listener subscriptions over `users` and `attendance` logs to dynamically process staff work histories, clocked hours, and register checkouts in real time.
*   **Multi-Variable Leaderboard Highlights:** Implemented high-contrast, beautiful visual metric cards recognizing top-performing employees across four pillars: Top Sales Volume (units), Top Revenue Generator (monetary value), Most Hours Worked (attendance), and Sales Efficiency (units sold/hour).
*   **Interactive Comparison KPI Charts:** Built responsive Recharts-based bar visualization models allowing administrators to seamlessly toggle and compare active metrics (Net Units Sold, Clocked Hours, Revenue Generated, Units/Hour) across the entire team on the fly.
*   **Staff Performance Ledger:** Structured a detailed, responsive data table complete with instant fuzzy-search filtering and role categorization (Staff, Manager, Admin) showing full ledger rows on desktop and responsive card decks on mobile views.
*   **Returns Accuracy Audit Pipeline:** Integrated active calculation of a **Returns Accuracy Rate** (Net sales versus total quantities plus returns) per staff profile to audit register accuracies and deter shrinkage.

### Patch v1.2: Branch-Level Inventory Permissions
*   **Role-Based Security Bounds:** Enforced localized stock visibility for non-administrative profiles. Staff accounts are isolated to seeing inventory levels only at their assigned operating branch.
*   **Admin Command Deck:** Kept global, multi-branch stock distribution tables restricted exclusively to authorized administrative logins to prevent sensitive asset leakages.

### Patch v1.1: Multi-Mode Register POS Views
*   **Hierarchical Grouped List View (Default Layout):** Added a highly organized layout to the POS register that automatically groups all products by **Category** and **Brand**. This addresses retail scalability, enabling high-speed lookups and reduced visual clutter for cashiers.
*   **Visual Grid Toggle:** Implemented an on-screen view-toggle control to seamlessly switch between the new Grouped List layout and the traditional card-based Grid layout.
*   **Add Qty Multiplier Panel:** Integrated block quantity controls directly into the top search bar, allowing cashiers to scale cart inputs quickly before selection.

---

## 7. REVISION AND SIGN-OFF

The specifications mapped inside this Scope of Work represent the finalized, compiled, and tested system deliverables. No further features will be introduced beyond these defined functional parameters without a formal change order.

**Signed by Authorized Representatives:**

__________________________________  
**Client: Vape Avenue Representative**  
Date: ________________________  

__________________________________  
**Lead System Architect**  
Date: July 3, 2026  
