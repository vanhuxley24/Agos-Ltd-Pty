import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, LogIn, AlertCircle, Database, Waves } from 'lucide-react';
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
      
      // Refresh page redirect or navigate
      window.location.href = '/pos';
    } catch (err: any) {
      toast.error(`Offline login failed: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    console.log("Login: Starting Google Login process...");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      console.log("Login: Calling signInWithPopup...");
      const result = await signInWithPopup(auth, provider);
      console.log("Login: signInWithPopup successful, user:", result.user.email);
      const user = result.user;

      // Check if user profile exists
      console.log("Login: Checking user profile in Firestore...");
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      console.log("Login: User profile exists:", userDoc.exists());

      if (!userDoc.exists()) {
        const primaryAdminEmails = ['vanhuxley24@gmail.com', 'v4peavenue@gmail.com', 'dutchlordsilvertongue24@gmail.com'];
        const isPrimaryAdmin = user.email && primaryAdminEmails.includes(user.email.toLowerCase());
        let role = isPrimaryAdmin ? 'admin' : null;

        if (!isPrimaryAdmin) {
          // Check for pending invites
          try {
            const invitesRef = collection(db, 'invites');
            const q = query(invitesRef, where('email', '==', user.email), where('status', '==', 'pending'));
            const inviteSnap = await getDocs(q);

            if (!inviteSnap.empty) {
              const inviteDoc = inviteSnap.docs[0];
              const inviteData = inviteDoc.data();
              role = inviteData.role;
              // Mark invite as accepted
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

        // Create profile
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
        // Profile exists, but let's make sure any pending invites are marked as accepted
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
        console.log("Login: User dismissed or closed the sign-in popup.");
        toast.info("Sign-in cancelled. Click below to try again whenever you're ready.");
      } else if (isPopupBlocked) {
        console.warn("Login: Popup blocked by browser.", error);
        toast.warning("Sign-in popup was blocked by your browser. Please allow popups or use Offline Mode.");
        setShowOffline(true);
      } else if (isUnauthorizedDomain) {
        console.warn("Login: Unauthorized domain for OAuth.", error);
        toast.error("This domain is not authorized for Google Sign-In. You can use Offline Mode to log in.");
        setShowOffline(true);
      } else if (isNetworkError) {
        console.warn("Login: Network error during authentication.", error);
        toast.error("Network error connecting to authentication service.");
        toast.info("You can easily bypass this by logging in using Offline Mode below.");
        setShowOffline(true);
      } else {
        console.error("Login failed:", error);
        toast.error(`Login failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-100/90 p-4 overflow-hidden font-sans">
      {/* Background Stylized Agos Shapes */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#1C2D4E] rounded-full mix-blend-multiply opacity-25 filter blur-2xl pointer-events-none" />
      <div className="absolute top-1/3 -right-20 w-80 h-80 bg-[#D4AF37] rounded-full mix-blend-multiply opacity-20 filter blur-3xl pointer-events-none" />
      <div className="absolute -bottom-28 left-1/4 w-[500px] h-[500px] bg-indigo-900/20 rounded-full filter blur-3xl pointer-events-none" />

      <Card className="max-w-md w-full shadow-2xl border-slate-200/90 bg-white/95 backdrop-blur-md rounded-[28px] relative z-10">
        <CardHeader className="text-center space-y-4 pt-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-[#1C2D4E] to-[#15233D] rounded-2xl flex items-center justify-center shadow-lg shadow-[#1C2D4E]/20 border border-[#D4AF37]/30">
            <Waves className="w-9 h-9 text-[#D4AF37]" />
          </div>
          <div>
            <CardTitle className="text-3xl font-extrabold tracking-tight text-[#1C2D4E] font-heading">AGOS ERP</CardTitle>
            <CardDescription className="text-slate-500 mt-1 font-medium">
              Smart Local-First Store & Inventory Portal
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <div className="text-center text-xs text-slate-600 font-medium leading-relaxed">
            Sign in to access store operations, barcodes, cash registers, and multi-location management.
          </div>

          <div className="bg-[#F5F2ED] border border-[#E5E1DA] rounded-2xl p-3.5 text-xs text-[#1C2D4E] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-[11px] uppercase tracking-wider text-[#A0522D]">Sandbox Environment Note</p>
              <p className="leading-relaxed text-slate-600">
                If Firebase is not yet fully configured with your live custom credentials, click the <strong className="underline cursor-pointer text-[#1C2D4E]" onClick={() => setShowOffline(true)}>Offline Local Mode</strong> link below to launch a secure local session.
              </p>
            </div>
          </div>

          <Button 
            onClick={handleGoogleLogin} 
            disabled={loading}
            className="w-full h-12 gap-3 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm rounded-xl font-bold text-sm"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            <span>Continue with Google</span>
          </Button>

          {!showOffline ? (
            <div className="text-center">
              <button 
                type="button"
                onClick={() => setShowOffline(true)}
                className="text-xs text-[#1C2D4E] hover:text-[#2B4570] underline font-bold"
              >
                Or sign in using Offline Local Mode
              </button>
            </div>
          ) : (
            <div className="space-y-4 border border-amber-200/80 bg-amber-50/40 p-4 rounded-2xl mt-4 text-left">
              <div className="flex items-center gap-2 text-[#1C2D4E] font-bold text-sm">
                <Database className="w-4 h-4 text-[#D4AF37]" />
                <span>Local-First Offline Session</span>
              </div>
              <p className="text-xs text-slate-600 leading-normal">
                No internet or Firebase connection is required. Data is stored locally on this workstation.
              </p>
              
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input 
                    type="email" 
                    value={offlineEmail}
                    onChange={(e) => setOfflineEmail(e.target.value)}
                    className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1C2D4E] text-slate-800"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Display Name
                  </label>
                  <input 
                    type="text" 
                    value={offlineName}
                    onChange={(e) => setOfflineName(e.target.value)}
                    className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1C2D4E] text-slate-800"
                    placeholder="e.g. Administrator"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Access Role
                  </label>
                  <select 
                    value={offlineRole}
                    onChange={(e) => setOfflineRole(e.target.value)}
                    className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1C2D4E] text-slate-800"
                  >
                    <option value="admin">Administrator (Full Access)</option>
                    <option value="manager">Manager (Intermediate Access)</option>
                    <option value="staff">Staff (POS / Attendance Access)</option>
                  </select>
                </div>

                <Button 
                  onClick={handleOfflineLogin}
                  className="w-full h-11 bg-gradient-to-r from-[#1C2D4E] to-[#2B4570] hover:opacity-95 text-[#D4AF37] font-bold rounded-xl shadow-lg shadow-[#1C2D4E]/20 transition-all mt-2"
                >
                  Launch Offline ERP
                </Button>
                
                <div className="text-center pt-1">
                  <button 
                    type="button"
                    onClick={() => setShowOffline(false)}
                    className="text-[10px] text-slate-400 hover:text-slate-600 underline font-medium"
                  >
                    Back to Google Sign-in
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/50 rounded-b-[28px] pt-4 pb-6">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
            <LogIn className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Secure Enterprise Authentication</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;
