import CheckoutButtons from './CheckoutButtons';
import type { CheckoutKind } from '../../lib/payments';

interface BuyButtonProps {
  kind: CheckoutKind;
  targetId: string;
  label: string;
}

/** Buy button backed by the server-priced checkout options and provider selection. */
export default function BuyButton({ kind, targetId, label }: BuyButtonProps) {
  return (
    <CheckoutButtons
      kind={kind}
      targetId={targetId}
      label={label}
      buttonClassName="rounded-2xl py-4 shadow-lg"
    />
  );
}
