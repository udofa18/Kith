import { ShoppingBag, Store, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { SettingNote, SettingRow, SettingsSection, Subheading, Switch } from '../components/controls';
import { Select } from '../../../components/ui/Input';
import type { SectionProps } from './types';

const contentOptions = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'community', label: 'Community' },
  { value: 'only-me', label: 'Only me' },
] as const;

export default function CommerceSection({ settings, update, onNavigate }: SectionProps) {
  const navigate = useNavigate();
  const { commerce } = settings;

  const setCommerce = (patch: Partial<typeof commerce>) =>
    update((current) => ({ ...current, commerce: { ...current.commerce, ...patch } }));

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Storefront"
        description="How your products show up across the marketplace and your profile."
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/marketplace')}>
            Marketplace
          </Button>
        }
      >
        <SettingRow
          title="Who can see my storefront"
          description="Individual product visibility can still be changed from the product editor."
          stacked
        >
          <Select
            aria-label="Storefront visibility"
            value={commerce.storefrontVisibility}
            onChange={(event) => setCommerce({ storefrontVisibility: event.target.value as any })}
          >
            {contentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          title="Show the products tab"
          description="Adds a products section to your profile. Existing links keep working when this is off."
        >
          <Switch
            checked={settings.profile.showShowcase.products}
            onChange={(value) => {
              setCommerce({ showProducts: value });
              update((current) => ({
                ...current,
                profile: {
                  ...current.profile,
                  showShowcase: { ...current.profile.showShowcase, products: value },
                },
              }));
            }}
            label="Show products tab"
          />
        </SettingRow>

        <SettingRow
          title="Available for work"
          description="Adds an availability badge and a short enquiry prompt to your profile."
        >
          <Switch
            checked={settings.profile.availableForWork}
            onChange={(value) => {
              setCommerce({ availableForWork: value });
              update((current) => ({
                ...current,
                profile: { ...current.profile, availableForWork: value },
              }));
            }}
            label="Available for work"
          />
        </SettingRow>

        <SettingNote tone="info">
          Storefront visibility never overrides marketplace safety checks. Products that break marketplace rules are
          removed regardless of this setting.
        </SettingNote>
      </SettingsSection>

      <SettingsSection title="Buyers" description="How people ask questions before buying.">
        <Subheading>Messages</Subheading>
        <SettingRow
          title="Allow buyer messages"
          description="Buyers can message you about an order or a product question. This overrides a closed DM inbox for people with an active order."
        >
          <Switch
            checked={commerce.allowBuyerDMs}
            onChange={(value) => setCommerce({ allowBuyerDMs: value })}
            label="Allow buyer messages"
          />
        </SettingRow>
        <SettingRow
          title="Message settings"
          description="General DM rules still apply to everyone without an order."
        >
          <Button variant="ghost" size="sm" onClick={() => onNavigate('messaging')}>
            Open messages
          </Button>
        </SettingRow>

        <Subheading>Payouts and selling</Subheading>
        <SettingRow
          title="Payout account"
          description="Payouts are coming soon. You can still sell — earnings are saved in your Kith balance until withdrawals open."
        >
          <Button variant="secondary" size="sm" leftIcon={<Wallet size={14} />} onClick={() => navigate('/payouts')}>
            View earnings
          </Button>
        </SettingRow>
        <SettingRow
          title="Creator dashboard"
          description="Track sales, refunds and buyer questions in one place."
        >
          <Button variant="ghost" size="sm" leftIcon={<Store size={14} />} onClick={() => navigate('/dashboard')}>
            Open dashboard
          </Button>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Selling tools" description="Shortcuts to keep your storefront healthy.">
        <div className="grid gap-3 py-5 sm:grid-cols-2">
          {[
            {
              icon: ShoppingBag,
              title: 'Add a product',
              body: 'Publish a template, file, asset or service.',
              action: () => navigate('/marketplace/sell'),
            },
            {
              icon: Store,
              title: 'Review listings',
              body: 'Update pricing, files and availability.',
              action: () => navigate('/dashboard'),
            },
          ].map(({ icon: Icon, title, body, action }) => (
            <button
              key={title}
              type="button"
              onClick={action}
              className="rounded-control border border-border bg-surface-raised p-4 text-left transition-colors hover:border-primary/40"
            >
              <span className="mb-2 grid h-9 w-9 place-items-center rounded-control bg-primary/12 text-primary">
                <Icon size={17} />
              </span>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
            </button>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
