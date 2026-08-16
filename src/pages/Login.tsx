import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TrendingUp, LogIn, AlertCircle, Database, Waves, Sparkles, ShieldCheck, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { logAction } from '@/lib/audit';
import { useAuth } from '../contexts/AuthContext';

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { loginOffline } = useAuth();

  const [offlineEmail, setOfflineEmail] = useState('');
  const [offlineName, setOfflineName] = useState('');
  const [offlineRole, setOfflineRole] = useState('admin');
  const [showOffline, setShowOffline] = useState(false);

  const handleOfflineLogin = async () => {
    if (!offlineEmail.trim() || !offlineName.trim()) {
      toast.error("Please enter both email and name");
      return;
    }
    
    setLoading(true);
    try {
      await loginOffline(offlineEmail.trim(), offlineName.trim(), offlineRole);
      toast.success(`Logged in as ${offlineName} (${offlineRole.toUpperCase()})`);
      
      window.location.href = '/pos';
    } catch (err: any) {
      toast.error(`Offline login failed: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        const primaryAdminEmails = ['vanhuxley24@gmail.com', 'v4peavenue@gmail.com', 'dutchlordsilvertongue24@gmail.com'];
        const isPrimaryAdmin = user.email && primaryAdminEmails.includes(user.email.toLowerCase());
        let role = isPrimaryAdmin ? 'admin' : null;

        if (!isPrimaryAdmin) {
          try {
            const invitesRef = collection(db, 'invites');
            const q = query(invitesRef, where('email', '==', user.email), where('status', '==', 'pending'));
            const inviteSnap = await getDocs(q);

            if (!inviteSnap.empty) {
              const inviteDoc = inviteSnap.docs[0];
              const inviteData = inviteDoc.data();
              role = inviteData.role;
              try {
                await updateDoc(doc(db, 'invites', inviteDoc.id), { status: 'accepted' });
              } catch (e) {
                console.warn("Could not update invite status:", e);
              }
            }
          } catch (e) {
            console.warn("Could not check invites:", e);
          }
        }

        if (!role) {
          toast.error("Access Denied: You haven't been invited to this system.");
          await auth.signOut();
          setLoading(false);
          return;
        }

        const profileData = {
          email: user.email,
          name: user.displayName || user.email?.split('@')[0] || 'User',
          role: role,
          createdAt: new Date().toISOString()
        };
        await setDoc(userDocRef, profileData);
        
        await logAction(
          { id: user.uid, email: user.email!, name: user.displayName || '', role: role as any },
          'SIGN_UP',
          'User signed up and logged in'
        );
      } else {
        try {
          const invitesRef = collection(db, 'invites');
          const q = query(invitesRef, where('email', '==', user.email), where('status', '==', 'pending'));
          const inviteSnap = await getDocs(q);
          
          for (const inviteDoc of inviteSnap.docs) {
            try {
              await updateDoc(doc(db, 'invites', inviteDoc.id), { status: 'accepted' });
            } catch (e) {
              console.warn("Could not mark invite as accepted:", e);
            }
          }
        } catch (e) {
          console.warn("Error querying invites:", e);
        }

        const profileData = userDoc.data();
        
        const primaryAdminEmails = ['vanhuxley24@gmail.com', 'v4peavenue@gmail.com', 'dutchlordsilvertongue24@gmail.com'];
        if (user.email && primaryAdminEmails.includes(user.email.toLowerCase()) && profileData.role !== 'admin') {
          await updateDoc(userDocRef, { role: 'admin' });
          profileData.role = 'admin';
        }

        await logAction(
          { id: user.uid, email: user.email!, name: user.displayName || '', role: profileData.role },
          'LOGIN',
          'User logged in'
        );
      }

      navigate('/');
    } catch (error: any) {
      const isPopupClosed = error.code === 'auth/popup-closed-by-user' || 
                            error.code === 'auth/cancelled-popup-request' || 
                            error.code === 'auth/user-cancelled' ||
                            error.message?.includes('popup-closed-by-user') ||
                            error.message?.includes('cancelled-popup-request');
      const isPopupBlocked = error.code === 'auth/popup-blocked' || 
                             error.message?.includes('popup-blocked');
      const isNetworkError = error.code === 'auth/network-request-failed' || 
                             error.message?.toLowerCase().includes('network');
      const isUnauthorizedDomain = error.code === 'auth/unauthorized-domain' ||
                                    error.message?.includes('unauthorized-domain');

      if (isPopupClosed) {
        toast.info("Sign-in cancelled. Click below to try again whenever you're ready.");
      } else if (isPopupBlocked) {
        toast.warning("Sign-in popup was blocked by your browser. Please allow popups or use Offline Mode.");
        setShowOffline(true);
      } else if (isUnauthorizedDomain) {
        toast.error("This domain is not authorized for Google Sign-In. You can use Offline Mode to log in.");
        setShowOffline(true);
      } else if (isNetworkError) {
        toast.error("Network error connecting to authentication service.");
        toast.info("You can easily bypass this by logging in using Offline Mode below.");
        setShowOffline(true);
      } else {
        toast.error(`Login failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EBF0F6] p-4 font-sans">
      
      {/* Neomorphic Card Container */}
      <div className="max-w-md w-full neo-flat-xl rounded-[32px] p-6 sm:p-8 space-y-6 relative">
        
        {/* Header with Extruded Waves Icon */}
        <div className="text-center space-y-3 pt-2">
          <div className="mx-auto size-16 rounded-2xl neo-flat flex items-center justify-center border border-white/90 shadow-md">
            <Waves className="size-9 text-blue-600 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800 font-heading">
              AGOS ERP
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-0.5">
              Neomorphic Local-First Store & POS Portal
            </p>
          </div>
        </div>

        {/* Info Capsule */}
        <div className="neo-inset-sm rounded-2xl p-3.5 text-xs text-slate-600 flex items-start gap-3">
          <ShieldCheck className="size-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-[11px] uppercase tracking-wider text-slate-700">Enterprise Access</p>
            <p className="leading-relaxed text-slate-500 font-medium">
              Sign in with your authorized Google account or use the local-first offline terminal mode.
            </p>
          </div>
        </div>

        {/* Google Sign In Button */}
        <button 
          onClick={handleGoogleLogin} 
          disabled={loading}
          className="w-full h-12 gap-3 neo-btn rounded-full flex items-center justify-center font-bold text-sm text-slate-700 cursor-pointer disabled:opacity-50"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="size-5" />
          <span>Continue with Google</span>
        </button>

        {/* Offline Mode Section */}
        {!showOffline ? (
          <div className="text-center pt-1">
            <button 
              type="button"
              onClick={() => setShowOffline(true)}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
            >
              Or launch using Offline Local Terminal
            </button>
          </div>
        ) : (
          <div className="space-y-4 neo-inset p-5 rounded-3xl text-left">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
              <Database className="size-4 text-blue-600" />
              <span>Local-First Offline Station</span>
            </div>
            
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 px-1">
                  Email Address
                </label>
                <Input 
                  type="email" 
                  value={offlineEmail}
                  onChange={(e) => setOfflineEmail(e.target.value)}
                  placeholder="admin@store.local"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 px-1">
                  Display Name
                </label>
                <Input 
                  type="text" 
                  value={offlineName}
                  onChange={(e) => setOfflineName(e.target.value)}
                  placeholder="e.g. Master Cashier"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 px-1">
                  Access Role
                </label>
                <select 
                  value={offlineRole}
                  onChange={(e) => setOfflineRole(e.target.value)}
                  className="w-full h-10 px-4 text-sm neo-input rounded-full font-semibold text-slate-800 focus:outline-none"
                >
                  <option value="admin">Administrator (Full Access)</option>
                  <option value="manager">Manager (Branch Operations)</option>
                  <option value="staff">Staff (POS & Attendance)</option>
                </select>
              </div>

              <Button 
                variant="primary"
                onClick={handleOfflineLogin}
                className="w-full h-11 text-white font-bold rounded-full mt-2 text-sm"
              >
                Launch Offline Station
              </Button>
              
              <div className="text-center pt-1">
                <button 
                  type="button"
                  onClick={() => setShowOffline(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline font-semibold cursor-pointer"
                >
                  Back to Google Sign-in
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 text-center border-t border-slate-200/60">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
            <LogIn className="size-3.5 text-blue-600" />
            <span>Secure Point of Sale & ERP Gateway</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
