import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Waves, Sparkles, ShieldCheck, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { logAction } from '@/lib/audit';

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
        toast.warning("Sign-in popup was blocked by your browser. Please allow popups to continue.");
      } else if (isUnauthorizedDomain) {
        toast.error("This domain is not authorized for Google Sign-In.");
      } else if (isNetworkError) {
        toast.error("Network error connecting to authentication service. Please check your connection.");
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
      <div className="max-w-md w-full neo-flat-xl rounded-2xl p-6 sm:p-8 space-y-6 relative border border-white/90 shadow-[10px_10px_24px_#C8D3E2,-10px_-10px_24px_#FFFFFF]">
        
        {/* Header with Extruded Waves Icon */}
        <div className="text-center space-y-3 pt-2">
          <div className="mx-auto size-16 rounded-xl bg-[#111827] neo-flat-sm flex items-center justify-center border border-white/90 shadow-md">
            <Waves className="size-9 text-sky-400 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800 font-heading">
              AGOS ERP
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-0.5">
              Retail Store &amp; Point of Sale Portal
            </p>
          </div>
        </div>

        {/* Info Capsule */}
        <div className="neo-inset-sm rounded-xl p-3.5 text-xs text-slate-600 flex items-start gap-3">
          <ShieldCheck className="size-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-[11px] uppercase tracking-wider text-slate-700">Enterprise Access</p>
            <p className="leading-relaxed text-slate-500 font-medium">
              Sign in with your authorized Google workspace account to access store registers and inventory.
            </p>
          </div>
        </div>

        {/* Google Sign In Button */}
        <button 
          onClick={handleGoogleLogin} 
          disabled={loading}
          className="w-full h-12 gap-3 neo-flat rounded-lg flex items-center justify-center font-bold text-sm text-slate-700 hover:text-slate-900 border border-white/90 shadow-md hover:shadow-lg active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="size-5" />
          <span>Continue with Google</span>
        </button>

        {/* Footer */}
        <div className="pt-2 text-center border-t border-slate-200/60">
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
            <LogIn className="size-3.5 text-blue-600" />
            <span>Secure Point of Sale &amp; ERP Gateway</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
