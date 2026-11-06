import { useEffect, useState } from 'react';
import { Ban, RotateCcw, ShieldCheck, UserX } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import { Button } from '../../../components/ui/Button';
import ConfirmModal from '../../../components/ConfirmModal';
import { getUser } from '../../messages/api';
import { getPreferences, savePreferences } from '../../feed/signals/store';
import { EMPTY_PREFERENCES } from '../../feed/types';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SettingNote, SettingRow, SettingsSection } from '../components/controls';
import type { SectionProps } from './types';

interface BlockedPerson {
  id: string;
  name: string;
  username: string;
  photo: string;
}

export default function RestrictedSection(_props: SectionProps) {
  const uid = auth.currentUser?.uid;
  const [blocked, setBlocked] = useState<BlockedPerson[] | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [mutedCount, setMutedCount] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsubscribe = onSnapshot(collection(db, 'users', uid, 'blockedUsers'), async (snapshot) => {
      const people = await Promise.all(
        snapshot.docs.map(async (entry) => {
          const user = await getUser(entry.id);
          return {
            id: entry.id,
            name: user?.displayName || user?.username || 'Member',
            username: user?.username || '',
            photo: user?.profileImage || user?.photoURL || '',
          };
        }),
      );
      setBlocked(people);
    });
    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    getPreferences(uid)
      .then((preferences) => {
        setHiddenCount(preferences.hiddenItemIds.length);
        setMutedCount(preferences.mutedCreatorIds.length);
      })
      .catch(() => undefined);
  }, [uid, resetting]);

  const unblock = async (person: BlockedPerson) => {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, 'users', uid, 'blockedUsers', person.id));
      toast.success(`Unblocked ${person.name}`);
    } catch {
      toast.error("Couldn't unblock this person");
    }
  };

  const resetRecommendations = async () => {
    if (!uid) return;
    setResetting(true);
    try {
      await savePreferences(uid, EMPTY_PREFERENCES);
      setHiddenCount(0);
      setMutedCount(0);
      toast.success('Recommendations reset');
      setResetOpen(false);
    } catch {
      toast.error("Couldn't reset recommendations");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Blocked accounts"
        description="Blocked people cannot message you, follow you, tag you or see your profile."
      >
        {blocked === null ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading blocked accounts…</p>
        ) : blocked.length === 0 ? (
          <div className="py-6">
            <EmptyState
              icon={<UserX size={22} />}
              title="No blocked accounts"
              description="People you block from a profile or chat will appear here."
            />
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {blocked.map((person) => (
              <div key={person.id} className="flex items-center gap-3 py-3">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                  {person.photo ? (
                    <img src={person.photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[11px] font-bold text-muted-foreground">
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{person.name}</p>
                  {person.username && <p className="truncate text-[11px] text-faint">@{person.username}</p>}
                </div>
                <Button variant="secondary" size="sm" leftIcon={<Ban size={13} />} onClick={() => unblock(person)}>
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Feed filters"
        description="Content you asked Kith to show less of. This does not block anyone."
      >
        <SettingRow
          title="Hidden posts"
          description="Posts you removed from your feed with “Hide this post”."
          stacked
        >
          <span className="rounded-pill border border-border bg-surface-raised px-3 py-1 text-[11px] font-semibold text-muted-foreground">
            {hiddenCount} hidden
          </span>
        </SettingRow>
        <SettingRow
          title="Muted creators"
          description="Creators whose posts you asked to see less often."
          stacked
        >
          <span className="rounded-pill border border-border bg-surface-raised px-3 py-1 text-[11px] font-semibold text-muted-foreground">
            {mutedCount} muted
          </span>
        </SettingRow>
        <SettingRow
          title="Reset recommendations"
          description="Clears hidden posts, muted creators and topic signals. Follows and blocks stay untouched."
        >
          <Button variant="secondary" size="sm" leftIcon={<RotateCcw size={13} />} onClick={() => setResetOpen(true)}>
            Reset
          </Button>
        </SettingRow>
        <SettingNote tone="info">
          Muting is quiet by design: the other person is never notified and can still follow you.
        </SettingNote>
      </SettingsSection>

      <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
        <p>
          Blocking is enforced in Firestore rules, not just the interface. Unblocking restores access but does not
          re-follow anyone automatically.
        </p>
      </div>

      <ConfirmModal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={resetRecommendations}
        title="Reset your recommendations?"
        message="Kith will forget the posts you hid and the creators you muted. Your follows, blocks and saved items are not affected."
        confirmText="Reset recommendations"
        variant="warning"
        loading={resetting}
      />
    </div>
  );
}
