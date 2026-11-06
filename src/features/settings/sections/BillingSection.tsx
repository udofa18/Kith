import { CreditCard, ExternalLink, Receipt, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { SettingNote, SettingRow, SettingsSection, Subheading } from '../components/controls';
import type { SectionProps } from './types';

export default function BillingSection(_props: SectionProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Purchases"
        description="Marketplace purchases are one-time card payments handled by Stripe. Tickets, boosts and files appear in your library."
        action={
          <Button variant="secondary" size="sm" leftIcon={<Receipt size={13} />} onClick={() => navigate('/library')}>
            Library
          </Button>
        }
      >
        <SettingRow
          title="Payment methods"
          description="Cards are stored by Stripe. Kith never sees or stores your full card number."
        >
          <Button variant="ghost" size="sm" rightIcon={<ExternalLink size={12} />} onClick={() => navigate('/library')}>
            Manage
          </Button>
        </SettingRow>
        <SettingRow
          title="Receipts"
          description="Every successful payment is emailed to your account address. You can also download invoices from the library."
        >
          <Button variant="ghost" size="sm" onClick={() => navigate('/library')}>
            View receipts
          </Button>
        </SettingRow>
        <SettingRow
          title="Browse marketplace"
          description="Templates, files, assets and services from other builders."
        >
          <Button variant="ghost" size="sm" onClick={() => navigate('/marketplace')}>
            Open marketplace
          </Button>
        </SettingRow>
        <SettingNote tone="info">
          Refunds are handled per the seller's policy and marketplace rules. Contact the seller first, then Kith
          support if you cannot resolve it.
        </SettingNote>
      </SettingsSection>

      <SettingsSection
        title="Creator payouts"
        description="Earnings from products, tickets and boosts are held in your Kith balance until you withdraw."
        action={
          <Button variant="secondary" size="sm" leftIcon={<Wallet size={13} />} onClick={() => navigate('/payouts')}>
            Payouts
          </Button>
        }
      >
        <Subheading>Balance</Subheading>
        <SettingRow
          title="Available balance"
          description="Withdraw any time after the holding period. Payouts usually arrive in 2–3 business days."
        >
          <span className="rounded-pill border border-border bg-surface-raised px-3 py-1 text-[11px] font-semibold text-muted-foreground">
            See dashboard
          </span>
        </SettingRow>
        <SettingRow
          title="Payout account"
          description="Connect Stripe to receive transfers. Identity checks are required by law."
        >
          <Button variant="secondary" size="sm" leftIcon={<CreditCard size={13} />} onClick={() => navigate('/payouts')}>
            Manage
          </Button>
        </SettingRow>
        <SettingRow
          title="Creator dashboard"
          description="Sales, refunds, fees and payout history in one place."
        >
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            Open dashboard
          </Button>
        </SettingRow>

        <SettingNote tone="warning" title="Withdraw before deleting">
          Deleting an account does not refund past purchases and may make an unpaid balance harder to recover. Withdraw
          first.
        </SettingNote>
      </SettingsSection>

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <Receipt size={15} className="mt-0.5 shrink-0 text-faint" />
        <p>
          Need an invoice with a company name or VAT number? Update your billing details from a receipt in the library
          before downloading it.
        </p>
      </div>
    </div>
  );
}
