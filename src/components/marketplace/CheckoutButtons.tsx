import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { auth } from '../../firebase';
import {
  CheckoutCurrency,
  CheckoutKind,
  CheckoutOptions,
  PaymentError,
  PaymentProviderId,
  formatPrice,
  getCheckoutOptions,
  startCheckout,
} from '../../lib/payments';
import { cn } from '../../lib/cn';

interface CheckoutButtonsProps {
  kind: CheckoutKind;
  targetId: string;
  tierId?: string;
  label: string;
  className?: string;
  buttonClassName?: string;
  /** Where to send the buyer after a free order is granted. Defaults to the library. */
  freeRedirect?: (orderId: string) => string;
}

/**
 * Server-priced checkout buttons.
 *
 * The amount, currency and available providers come from `/api/payments/checkout-options`, never
 * from product/event props. When more than one provider can charge the currency, the buyer chooses.
 */
export default function CheckoutButtons({
  kind,
  targetId,
  tierId,
  label,
  className,
  buttonClassName,
  freeRedirect,
}: CheckoutButtonsProps) {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [busy, setBusy] = useState<PaymentProviderId | 'free' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, user => setUid(user?.uid ?? null)), []);

  useEffect(() => {
    if (!uid) {
      setOptions(null);
      return;
    }
    let cancelled = false;
    setError(null);
    getCheckoutOptions(kind, targetId, tierId)
      .then(result => {
        if (!cancelled) setOptions(result);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load checkout');
      });
    return () => {
      cancelled = true;
    };
  }, [uid, kind, targetId, tierId]);

  const begin = async (provider?: PaymentProviderId) => {
    if (!uid) {
      navigate('/login');
      return;
    }
    setBusy(provider ?? 'free');
    setError(null);
    try {
      const current = options ?? (await getCheckoutOptions(kind, targetId, tierId));
      if (!options) setOptions(current);

      if (current.free) {
        const result = await startCheckout(kind, targetId, tierId);
        if (!result.free) throw new Error('Checkout could not start. Please try again.');
        toast.success('Added to your library');
        navigate(freeRedirect ? freeRedirect(result.orderId) : `/library?order=${result.orderId}`);
        return;
      }

      const available = current.providers.map(p => p.id);
      if (available.length === 0) {
        throw new PaymentError(unavailableMessage(current.currency), 400);
      }

      let chosen = provider;
      if (!chosen) {
        if (available.length === 1) {
          chosen = available[0];
        } else {
          // Render the provider choice now that the options are loaded.
          setBusy(null);
          return;
        }
      }
      if (!available.includes(chosen)) {
        throw new PaymentError('That payment method is not available for this order.', 400);
      }

      const result = await startCheckout(kind, targetId, tierId, chosen);
      if (result.free) {
        toast.success('Added to your library');
        navigate(freeRedirect ? freeRedirect(result.orderId) : `/library?order=${result.orderId}`);
        return;
      }
      if (!result.authorizationUrl) throw new Error('Checkout could not start. Please try again.');
      window.location.href = result.authorizationUrl;
    } catch (e) {
      if (e instanceof PaymentError && e.status === 409) {
        navigate('/library');
        return;
      }
      const message = e instanceof Error ? e.message : 'Checkout failed';
      setError(message);
      toast.error(message);
      setBusy(null);
    }
  };

  const providerChoices =
    options && !options.free && options.providers.length > 1 ? options.providers : null;
  const noProviders = options && !options.free && options.providers.length === 0;
  const sellerNotReady = options && !options.free && !options.sellerReady;

  return (
    <div className={cn('space-y-2', className)}>
      {providerChoices ? (
        providerChoices.map(provider => (
          <button
            key={provider.id}
            type="button"
            onClick={() => begin(provider.id)}
            disabled={busy !== null || sellerNotReady === true}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-full border border-border bg-foreground px-4 py-3.5 text-[13px] font-bold text-background transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50',
              buttonClassName,
            )}
          >
            {busy === provider.id ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                Pay with {provider.label}
                {options && !options.free ? (
                  <span className="font-normal opacity-70">{formatPrice(options.amountMinor, options.currency)}</span>
                ) : null}
              </>
            )}
          </button>
        ))
      ) : (
        <button
          type="button"
          onClick={() => begin()}
          disabled={busy !== null || noProviders === true || sellerNotReady === true}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 py-3.5 text-[13px] font-bold text-background transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50',
            buttonClassName,
          )}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              {label}
              {options && !options.free ? (
                <span className="font-normal opacity-70">{formatPrice(options.amountMinor, options.currency)}</span>
              ) : null}
            </>
          )}
        </button>
      )}

      {sellerNotReady ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The seller is still finishing payout setup. Check back shortly.
        </p>
      ) : noProviders ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {options ? unavailableMessage(options.currency) : null}
        </p>
      ) : error ? (
        <p role="alert" className="text-[11px] leading-relaxed text-destructive">
          {error}
        </p>
      ) : null}

      {options && !options.free && (options.comingSoonProviders?.length ?? 0) > 0 ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {options.comingSoonProviders.map(provider => provider.label).join(', ')} checkout is coming
          soon. Paystack is available now.
        </p>
      ) : null}
    </div>
  );
}

function unavailableMessage(currency: CheckoutCurrency): string {
  return `Checkout isn't available in ${currency} on this deployment yet. The seller needs to set a price in a supported currency.`;
}
