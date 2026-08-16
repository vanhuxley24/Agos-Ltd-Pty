import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Location } from '../types';
import { useAuth } from './AuthContext';

interface LocationContextType {
  locations: Location[];
  selectedLocationId: string | 'all';
  selectedLocation: Location | null;
  setSelectedLocationId: (id: string | 'all') => void;
  loading: boolean;
}

const LocationContext = createContext<LocationContextType>({
  locations: [],
  selectedLocationId: 'all',
  selectedLocation: null,
  setSelectedLocationId: () => {},
  loading: true,
});

export const useLocations = () => useContext(LocationContext);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isAdmin, isManager } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'locations'), (snapshot) => {
      const locs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
      setLocations(locs);
      setLoading(false);
    }, (error) => {
      if (error.code === 'permission-denied') {
        setLoading(false);
        return;
      }
      console.error("Error listening to locations:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Handle initial selection and restrictions
  useEffect(() => {
    if (!loading) {
      if (!isAdmin && !isManager && profile?.locationId) {
        // Non-admin and non-manager staff are locked to their assigned location
        setSelectedLocationId(profile.locationId);
      } else if (isAdmin || isManager) {
        // Admins and Managers can use stored preference or default to 'all'
        const stored = localStorage.getItem('selectedLocationId');
        if (stored && (stored === 'all' || locations.some(l => l.id === stored))) {
          setSelectedLocationId(stored);
        } else {
          setSelectedLocationId('all');
        }
      } else {
        // No restriction but no assignment, stay on 'all'
        setSelectedLocationId('all');
      }
    }
  }, [profile?.locationId, profile?.role, isAdmin, isManager, loading, locations.length]);

  const handleSetSelectedLocationId = (id: string | 'all') => {
    if (!isAdmin && !isManager) {
      // Only Admins and Managers can change location
      return;
    }
    setSelectedLocationId(id);
    localStorage.setItem('selectedLocationId', id);
  };

  const selectedLocation = locations.find(l => l.id === selectedLocationId) || null;

  return (
    <LocationContext.Provider 
      value={{ 
        locations, 
        selectedLocationId, 
        selectedLocation, 
        setSelectedLocationId: handleSetSelectedLocationId,
        loading 
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
