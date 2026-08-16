# Agos

Agos is a professional, offline-first inventory and sales management system designed for small to medium businesses. It features real-time stock tracking, sales reporting, and role-based access control, ensuring your business stays operational even without an internet connection.

## Features

- **Real-time Dashboard**: Monitor revenue, orders, and inventory health at a glance.
- **Inventory Management**: Add, edit, and track products with SKU and low-stock alerts.
- **Point of Sale (POS)**: Fast and intuitive checkout interface with multiple payment support.
- **Sales History**: Detailed logs of all transactions with receipt viewing.
- **Reports & Analytics**: Visual insights into monthly performance and category distribution.
- **Offline-First**: Built-in support for offline operations with automatic cloud synchronization.
- **Role-Based Access**: Secure access for Admins and Staff members.

## 🚀 How to Get Started (The Easy Way!)

Don't worry if you aren't a "tech person"! We have included an **automated setup script** that does all the work for you—including installing dependencies and adding a shortcut directly on your Desktop!

### Step 1: Download & Extract the Code 📂
1.  Look at the top of this page in AI Studio.
2.  Click the **Settings** (gear icon) or the **Export** button.
3.  Choose **"Download ZIP"**.
4.  Find that ZIP file on your computer, right-click it, and choose **"Extract All"**.

---

### Step 2: Run the One-Click Installer ⚡

#### 🪟 If you are on Windows:
1.  Double-click **`setup_local.bat`** inside your extracted folder.
2.  The script will verify if Node.js is installed. If not, it will open the download page.
3.  It will automatically run the `npm install` fix for you.
4.  It will put an **"Agos Local ERP"** shortcut directly on your Windows Desktop!
5.  It will launch the app in your browser at `http://localhost:3000`.

#### 🍎 If you are on macOS or Linux:
1.  Open your Terminal, navigate to the extracted folder, and run:
    ```bash
    chmod +x setup_local.sh && ./setup_local.sh
    ```
2.  This behaves exactly the same way, setting everything up and creating a Desktop shortcut for you.

---

### Step 3: Set up your "Cloud Brain" (Firebase) ☁️
The app needs a place to remember your sales. We use a free service called Firebase.
1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Click **"Add Project"**. Give it a fun name like "MyStore".
3.  Click through the buttons (you can say "No" to Google Analytics to make it faster).
4.  Once your project is ready, click the little **Web icon** (it looks like `</>`).
5.  Give your app a nickname and click "Register".
6.  You will see a bunch of code with words like `apiKey`. **Copy that whole block of text.**

### Step 4: Tell the App about the Brain 🧠
1.  Go back to your app folder.
2.  Create a new file (Right-click > New > Text Document).
3.  Rename it exactly to: `firebase-applet-config.json` (Make sure it doesn't end in `.txt`!).
4.  Open it with Notepad and paste the code you copied from Firebase. It should look like this:
    ```json
    {
      "apiKey": "YOUR_KEY_HERE",
      "authDomain": "...",
      "projectId": "...",
      "storageBucket": "...",
      "messagingSenderId": "...",
      "appId": "...",
      "firestoreDatabaseId": "(default)"
    }
    ```
5.  **Save and close.**

### Step 5: Turn it On! ⚡
1.  Go back to that black "Command Center" box.
2.  Type this and hit Enter:
    ```bash
    npm run dev
    ```
3.  It will say something like `Local: http://localhost:3000`.
4.  Hold **Ctrl** on your keyboard and click that link, or just type `http://localhost:3000` into your web browser.

**🎉 YOU DID IT! Your app is now running!**

---

## 📖 How to Use the App

### 1. Authentication
- Log in using your Google account.
- The first user to log in is typically granted Admin privileges.

### 2. Initial Setup (Settings)
- Navigate to **Settings** to add your product **Categories** and **Suppliers**.
- This is required before adding products to the inventory.

### 3. Managing Inventory
- Go to the **Inventory** tab to add your products.
- Set "Low Stock Alert" thresholds to get notified when items are running out.

### 4. Making Sales (POS)
- Use the **POS** tab to select products and add them to the cart.
- Choose a payment method (Cash, Card, or E-Wallet) and complete the checkout.
- Stock levels will update automatically.

### 5. Viewing Reports
- The **Dashboard** provides a quick overview.
- The **Reports** tab offers deeper analytics on revenue and product distribution.

## Technical Stack

- **Framework**: React 19 (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4.0
- **UI Components**: shadcn/ui
- **Database**: Firebase Firestore (with Offline Persistence)
- **Authentication**: Firebase Auth (Google)
- **Charts**: Recharts
- **Icons**: Lucide React

## Offline Support

Agos uses Firestore's `persistentLocalCache`. This means:
- Data is cached locally in your browser (IndexedDB).
- You can perform sales and view inventory while offline.
- Changes are queued and automatically synced to the cloud once a connection is restored.
- Multi-tab synchronization is supported.

## License

MIT
