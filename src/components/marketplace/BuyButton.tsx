import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { auth } from '../../firebase';
import { startCheckout, PaymentError, CheckoutKind } from '../../lib/payments';

interface BuyButtonProps {
  kind: CheckoutKind;
  targetId: string;
  label: string;
}

export default function BuyButton({ kind, targetId, label }: BuyButtonProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (!auth.currentUser) {
      navigate('/login');
      return;
    }
    setBusy(true);
    try {
      const result = await startCheckout(kind, targetId);
      if (result.free) {
        toast.success('Added to your library');
        navigate(`/library?order=${result.orderId}`);
        return;
      }
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
        return;
      }
      throw new Error('Checkout could not start. Please try again.');
    } catch (e) {
      if (e instanceof PaymentError && e.status === 409) {
        navigate('/library');
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Checkout failed');
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-bold text-sm flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-lg disabled:opacity-50"
    >
      {busy ? 'Redirecting to payment...' : label}
    </button>
  );
}
