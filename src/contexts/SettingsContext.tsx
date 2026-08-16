import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';

export interface SystemSettings {
  currency: string;
  loyaltyEnabled?: boolean;
  loyaltyTier1Discount?: number; // Discount amount in Pesos for 5th item milestone
  loyaltyTier2Discount?: number; // Discount amount in Pesos for 10th item milestone
}

interface SettingsContextType {
  settings: SystemSettings;
  updateCurrency: (currency: string) => Promise<void>;
  updateLoyaltySettings: (loyaltyEnabled: boolean, tier1Discount: number, tier2Discount: number) => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>({ 
    currency: '₱',
    loyaltyEnabled: true,
    loyaltyTier1Discount: 50,
    loyaltyTier2Discount: 100
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as SystemSettings;
        setSettings({
          currency: data.currency || '₱',
          loyaltyEnabled: data.loyaltyEnabled ?? true,
          loyaltyTier1Discount: data.loyaltyTier1Discount ?? 50,
          loyaltyTier2Discount: data.loyaltyTier2Discount ?? 100
        });
      } else {
        // Initialize with default if it doesn't exist
        setSettings({ 
          currency: '₱',
          loyaltyEnabled: true,
          loyaltyTier1Discount: 50,
          loyaltyTier2Discount: 100
        });
      }
      setLoading(false);
    }, (error) => {
      // Avoid throwing error if it's just a permission issue while logging out
      if (error.code === 'permission-denied') {
        setLoading(false);
        return;
      }
      handleFirestoreError(error, OperationType.GET, 'settings/global');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const updateCurrency = async (currency: string) => {
    if (!isAdmin) return;
    await setDoc(doc(db, 'settings', 'global'), { 
      currency,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  };

  const updateLoyaltySettings = async (loyaltyEnabled: boolean, tier1Discount: number, tier2Discount: number) => {
    if (!isAdmin) return;
    await setDoc(doc(db, 'settings', 'global'), { 
      loyaltyEnabled,
      loyaltyTier1Discount: tier1Discount,
      loyaltyTier2Discount: tier2Discount,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateCurrency, updateLoyaltySettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
