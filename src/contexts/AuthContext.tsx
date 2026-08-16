import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '@/lib/firestore-utils';

interface AuthContextType {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isManager: false,
  updateProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, { ...data, updatedAt: new Date() }, { merge: true });
      toast.success('Profile updated');
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error('Failed to update profile');
      throw error;
    }
  };

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Listen to user profile changes
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setProfile(prev => {
              if (
                prev &&
                prev.id === docSnap.id &&
                prev.role === data.role &&
                prev.name === data.name &&
                prev.email === data.email &&
                prev.locationId === data.locationId
              ) {
                return prev; // Return same reference if data hasn't visually changed
              }
              return { id: docSnap.id, ...data } as UserProfile;
            });
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.warn("AuthContext: Error fetching profile snapshot:", error);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      unsubscribeAuth();
    };
  }, []);

  const primaryAdmins = ['vanhuxley24@gmail.com', 'v4peavenue@gmail.com', 'dutchlordsilvertongue24@gmail.com'];
  const userEmail = user?.email?.toLowerCase() || '';
  const roleLower = (profile?.role || '').toLowerCase().trim();
  const isAdmin = roleLower === 'admin' || primaryAdmins.includes(userEmail);
  const isManager = roleLower === 'admin' || roleLower === 'manager' || primaryAdmins.includes(userEmail);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isManager, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
