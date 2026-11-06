import { Check, Monitor, Moon, Palette, ShieldCheck, Sun, Type } from 'lucide-react';
import { Select } from '../../../components/ui/Input';
import { ACCENTS } from '../defaults';
import {
  Segmented,
  SettingNote,
  SettingRow,
  SettingsSection,
  Subheading,
  Switch,
} from '../components/controls';
import type { SectionProps } from './types';

const THEMES = [
  { value: 'system' as const, label: 'System', icon: Monitor },
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
];

const TEXT_SCALES = [
  { value: 'sm' as const, label: 'Small' },
  { value: 'md' as const, label: 'Default' },
  { value: 'lg' as const, label: 'Large' },
  { value: 'xl' as const, label: 'Largest' },
];

export default function AppearanceSection({ settings, update }: SectionProps) {
  const { appearance } = settings;

  const setAppearance = (patch: Partial<typeof appearance>) =>
    update((current) => ({
      ...current,
      appearance: { ...current.appearance, ...patch },
    }));

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Theme"
        description="Kith ships with a warm dark theme by default. System follows your device appearance."
      >
        <div className="grid gap-3 py-5 sm:grid-cols-3">
          {THEMES.map(({ value, label, icon: Icon }) => {
            const active = appearance.theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAppearance({ theme: value })}
                aria-pressed={active}
                className={`relative rounded-control border p-4 text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/8'
                    : 'border-border bg-surface-raised hover:border-border-strong'
                }`}
              >
                <span
                  className={`mb-3 grid h-9 w-9 place-items-center rounded-control ${
                    active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon size={17} />
                </span>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {value === 'system' ? 'Match this device' : value === 'light' ? 'Bright and airy' : 'Warm and low-lit'}
                </p>
                {active && <Check size={15} className="absolute right-3 top-3 text-primary" />}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Accent color"
        description="Tints primary actions, links, focus rings and highlights. Every accent is tuned for both themes."
      >
        <div className="grid grid-cols-2 gap-2 py-5 sm:grid-cols-3">
          {ACCENTS.map((accent) => {
            const active = appearance.accent === accent.id;
            return (
              <button
                key={accent.id}
                type="button"
                onClick={() => setAppearance({ accent: accent.id })}
                aria-pressed={active}
                className={`flex items-center gap-3 rounded-control border p-3 text-left transition-colors ${
                  active
                    ? 'border-primary bg-primary/8'
                    : 'border-border bg-surface-raised hover:border-border-strong'
                }`}
              >
                <span
                  className="h-7 w-7 shrink-0 rounded-full border border-black/10 shadow-sm"
                  style={{ background: accent.swatch }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{accent.label}</span>
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-faint">
                    {active ? 'Selected' : 'Accent'}
                  </span>
                </span>
                {active && <Check size={14} className="shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>

        <div className="mb-5 rounded-control border border-border bg-surface-raised p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
            <Palette size={11} /> Preview
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-control bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              Primary action
            </span>
            <span className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground">
              Secondary
            </span>
            <span className="rounded-pill bg-accent/15 px-3 py-1 text-[11px] font-semibold text-accent">
              Highlight
            </span>
            <span className="text-xs font-semibold text-primary underline underline-offset-4">Text link</span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Accessibility" description="Make Kith easier to read and calmer to use.">
        <Subheading>Readability</Subheading>
        <SettingRow
          title="Contrast"
          description="High contrast strengthens borders and muted text without changing the palette."
          stacked
        >
          <Segmented
            ariaLabel="Contrast"
            value={appearance.contrast}
            onChange={(value) => setAppearance({ contrast: value })}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'high', label: 'High' },
            ]}
            fullWidth
          />
        </SettingRow>

        <SettingRow
          title="Text size"
          description="Scales the whole interface, including messages and the editor."
          stacked
        >
          <Segmented
            ariaLabel="Text size"
            size="sm"
            value={appearance.textScale}
            onChange={(value) => setAppearance({ textScale: value })}
            options={TEXT_SCALES}
            fullWidth
          />
        </SettingRow>

        <SettingRow
          title="Readable font"
          description="Uses a more legible sans for long passages and code comments."
        >
          <Switch
            checked={appearance.readableFont}
            onChange={(value) => setAppearance({ readableFont: value })}
            label="Readable font"
          />
        </SettingRow>

        <SettingRow
          title="Color-blind friendly colors"
          description="Swaps red and green status cues for shapes and labels so meaning never relies on color alone."
        >
          <Switch
            checked={appearance.colorBlindSafe}
            onChange={(value) => setAppearance({ colorBlindSafe: value })}
            label="Color-blind friendly colors"
          />
        </SettingRow>

        <Subheading>Motion and layout</Subheading>
        <SettingRow
          title="Reduce motion"
          description="Turns off decorative transitions and autoplay motion. System follows your device setting."
          stacked
        >
          <Select
            aria-label="Reduce motion"
            value={appearance.reduceMotion}
            onChange={(event) => setAppearance({ reduceMotion: event.target.value as any })}
          >
            <option value="system">Follow system</option>
            <option value="on">Always reduce</option>
            <option value="off">Full motion</option>
          </Select>
        </SettingRow>

        <SettingRow
          title="Display density"
          description="Compact fits more on screen. Comfortable adds breathing room."
          stacked
        >
          <Segmented
            ariaLabel="Display density"
            value={appearance.density}
            onChange={(value) => setAppearance({ density: value })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
            fullWidth
          />
        </SettingRow>

        <SettingRow
          title="Focus mode"
          description="Quiets the activity rail while you write or build. It never hides navigation or the feed, and the rail returns to full strength on hover."
        >
          <Switch
            checked={appearance.focusMode}
            onChange={(value) => setAppearance({ focusMode: value })}
            label="Focus mode"
          />
        </SettingRow>

        <Subheading>Media</Subheading>
        <SettingRow
          title="Captions"
          description="Turn on captions by default for videos and live rooms. You can still switch them per video."
        >
          <Switch
            checked={appearance.captions}
            onChange={(value) => setAppearance({ captions: value })}
            label="Captions by default"
          />
        </SettingRow>

        <SettingRow title="Autoplay" description="When videos start playing in the feed." stacked>
          <Select
            aria-label="Autoplay"
            value={appearance.autoplay}
            onChange={(event) => setAppearance({ autoplay: event.target.value as any })}
          >
            <option value="always">Always</option>
            <option value="wifi">On Wi-Fi only</option>
            <option value="never">Never</option>
          </Select>
        </SettingRow>

        <SettingRow
          title="Data saver"
          description="Loads lower-resolution images and avoids preloading videos. Helpful on slow connections."
        >
          <Switch
            checked={appearance.dataSaver}
            onChange={(value) => setAppearance({ dataSaver: value })}
            label="Data saver"
          />
        </SettingRow>

        <SettingNote tone="success">
          Appearance changes apply instantly on this device and sync to every browser you sign into.
        </SettingNote>
      </SettingsSection>

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <Type size={15} className="mt-0.5 shrink-0 text-primary" />
        <p>
          Need a different font or a screen-reader tweak? Kith respects your operating system's accessibility
          settings and keeps keyboard focus visible at all times.
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
        <p>
          Theme and accent are stored on your account, not just this browser, so Kith looks the same everywhere.
        </p>
      </div>
    </div>
  );
}
