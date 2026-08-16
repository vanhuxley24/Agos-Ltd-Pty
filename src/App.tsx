import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocationProvider } from './contexts/LocationContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { TooltipProvider } from './components/ui/tooltip';
import ErrorBoundary from './components/ErrorBoundary';
import { Layout } from './components/Layout';

import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { POS } from './pages/POS';
import { SalesHistory } from './pages/SalesHistory';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { Purchasing } from './pages/Purchasing';
import { Directory } from './pages/Directory';
import { Finance } from './pages/Finance';
import { Attendance } from './pages/Attendance';

const PageLoader = (
  <div className="min-h-screen flex items-center justify-center bg-[#FDFCF8]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1C2D4E]"></div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return PageLoader;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return <Layout>{children}</Layout>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return PageLoader;
  }

  if (!user || !isAdmin) {
    return <Navigate to="/pos" />;
  }

  return <Layout>{children}</Layout>;
};

const ManagerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isManager, loading } = useAuth();

  if (loading) {
    return PageLoader;
  }

  if (!user || !isManager) {
    return <Navigate to="/pos" />;
  }

  return <Layout>{children}</Layout>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LocationProvider>
          <SettingsProvider>
            <TooltipProvider>
              <Router>
                <Suspense fallback={PageLoader}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                    <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                    <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
                    <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
                    <Route path="/purchasing" element={<ManagerRoute><Purchasing /></ManagerRoute>} />
                    <Route path="/pos" element={<ProtectedRoute><POS /></ProtectedRoute>} />
                    <Route path="/sales" element={<ProtectedRoute><SalesHistory /></ProtectedRoute>} />
                    <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
                    <Route path="/finance" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
                    <Route path="/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
                    <Route path="/directory" element={<ProtectedRoute><Directory /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                  </Routes>
                </Suspense>
              </Router>
              <Toaster position="top-right" richColors />
            </TooltipProvider>
          </SettingsProvider>
        </LocationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
