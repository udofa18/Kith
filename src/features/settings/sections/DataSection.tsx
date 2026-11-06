import { useState } from 'react';
import { Database, Download, History, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import ConfirmModal from '../../../components/ConfirmModal';
import { clearRecentSearches } from '../../search/api';
import { SettingNote, SettingRow, SettingsSection, Subheading, Switch } from '../components/controls';
import type { SectionProps } from './types';

const SEEN_STATUSES_KEY = 'kith:seen-statuses';

export default function DataSection({ settings, update, profile }: SectionProps) {
  const { data } = settings;
  const [clearing, setClearing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const setData = (patch: Partial<typeof data>) =>
    update((current) => ({ ...current, data: { ...current.data, ...patch } }));

  const downloadArchive = () => {
    const archive = {
      exportedAt: new Date().toISOString(),
      account: {
        uid: profile?.uid,
        username: profile?.username,
        displayName: profile?.displayName,
        email: profile?.email,
        createdAt: profile?.createdAt,
      },
      profile: profile ?? {},
      settings: settings,
      note: 'This is a browser-generated copy of the data available to your signed-in account. Files, messages and analytics exports are requested separately from the privacy team.',
    };

    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kith-archive-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Download started');
  };

  const clearLocalHistory = async () => {
    setClearing(true);
    try {
      clearRecentSearches();
      localStorage.removeItem(SEEN_STATUSES_KEY);
      setData({ searchHistory: false, watchHistory: false });
      toast.success('Local history cleared');
      setConfirming(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Your data"
        description="Download a copy of your profile and settings, or control what Kith remembers on this device."
        action={
          <Button variant="secondary" size="sm" leftIcon={<Download size={13} />} onClick={downloadArchive}>
            Export
          </Button>
        }
      >
        <SettingRow
          title="Download your archive"
          description="A JSON file with your public profile and every settings choice. Large media, messages and purchases require a separate request."
        >
          <Button variant="ghost" size="sm" leftIcon={<Database size={13} />} onClick={downloadArchive}>
            Download JSON
          </Button>
        </SettingRow>

        <Subheading>History</Subheading>
        <SettingRow
          title="Save search history"
          description="Recent searches appear when you focus the search bar."
        >
          <Switch
            checked={data.searchHistory}
            onChange={(value) => setData({ searchHistory: value })}
            label="Save search history"
          />
        </SettingRow>
        <SettingRow
          title="Save watch history"
          description="Remembers where you left long videos and replays."
        >
          <Switch
            checked={data.watchHistory}
            onChange={(value) => setData({ watchHistory: value })}
            label="Save watch history"
          />
        </SettingRow>
        <SettingRow
          title="Use activity for personalisation"
          description="Likely interests and ranking signals. Turning this off stops new signals from being used."
        >
          <Switch
            checked={data.personalization}
            onChange={(value) => setData({ personalization: value })}
            label="Use activity for personalisation"
          />
        </SettingRow>

        <SettingRow
          title="Clear history on this device"
          description="Removes recent searches, seen statuses and other local caches. Your posts and messages are not deleted."
        >
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<History size={13} />}
            onClick={() => setConfirming(true)}
          >
            Clear
          </Button>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Privacy controls" description="Quick links to the settings people ask about most.">
        <SettingRow
          title="Account data"
          description="Kith stores your profile, content, messages and transaction records while your account is active."
        >
          <span className="text-[11px] font-semibold text-muted-foreground">On file</span>
        </SettingRow>
        <SettingRow
          title="Analytics"
          description="Aggregated, non-identifying product usage. Personalisation controls live in Feed & content."
        >
          <span className="text-[11px] font-semibold text-muted-foreground">
            {data.personalization ? 'On' : 'Off'}
          </span>
        </SettingRow>
        <SettingNote tone="info">
          Deleted content may remain in backups for up to 30 days before being permanently removed.
        </SettingNote>
      </SettingsSection>

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
        <p>
          Exports are generated on your device and never uploaded. Keep the file somewhere safe if it contains
          personal notes.
        </p>
      </div>

      <ConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={clearLocalHistory}
        title="Clear local history?"
        message="This removes recent searches and seen statuses from this browser and turns search and watch history off. Your account and content stay exactly as they are."
        confirmText="Clear history"
        variant="warning"
        loading={clearing}
      />

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <Trash2 size={15} className="mt-0.5 shrink-0 text-faint" />
        <p>
          To delete your account or request a full server-side export, use the Danger zone below.
        </p>
      </div>
    </div>
  );
}
