import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, Download, Rocket, ArrowRight } from 'lucide-react';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export default function SuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const productId = searchParams.get('productId');
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId || !auth.currentUser) return;

    const finalizePurchase = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'products', productId));
        if (docSnap.exists()) {
          setProduct(docSnap.data());
          
          // Record purchase
          await addDoc(collection(db, 'purchases'), {
            buyerUid: auth.currentUser.uid,
            productId,
            amount: docSnap.data().price,
            stripeSessionId: sessionId,
            createdAt: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error finalizing purchase:', error);
      } finally {
        setLoading(false);
      }
    };

    finalizePurchase();
  }, [productId, sessionId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-primary font-mono">FINALIZING_TRANSACTION...</div>;

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl w-full rounded-[40px] border border-white/5 bg-[#0A0A0A] p-12 text-center relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] rounded-full" />
        
        <div className="w-24 h-24 bg-primary/20 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-2xl border border-primary/20">
          <CheckCircle2 className="text-primary" size={48} />
        </div>

        <h1 className="text-4xl font-black tracking-tighter mb-4">Transaction Confirmed</h1>
        <p className="text-white/50 mb-12 text-lg font-medium">
          You now have lifetime access to <span className="text-white font-black">{product?.title}</span>. 
          Your assets are ready for download in your dashboard.
        </p>

        <div className="space-y-4">
          <Link 
            to={`/products/${productId}`} 
            className="w-full py-5 bg-primary text-white rounded-[24px] font-black text-xl shadow-2xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-all neon-glow"
          >
            Access Product <Rocket size={24} />
          </Link>
          <Link 
            to="/explore" 
            className="w-full py-5 border border-white/5 bg-white/5 text-white/50 rounded-[24px] font-black text-xl flex items-center justify-center gap-3 hover:bg-white/10 hover:text-white transition-all"
          >
            Explore More <ArrowRight size={24} />
          </Link>
        </div>

        <div className="mt-12 pt-8 border-t border-foreground/10 flex items-center justify-center gap-8 text-xs text-foreground/40 font-mono">
          <span>TX_ID: {sessionId?.slice(0, 12)}...</span>
          <span>STATUS: VERIFIED</span>
        </div>
      </motion.div>
    </div>
  );
}
