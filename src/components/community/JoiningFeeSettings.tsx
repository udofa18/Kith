import { useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { db } from '../../firebase';
import { Card, SaveBar } from './settingsUi';
import FeeEditor from './FeeEditor';
import { feeFields, feeOf, formatFee, validateFee, type CommunityFee } from '../../lib/communityPricing';
import { queueAudit } from '../../lib/communityRoles';

/** Joining fee. The draft lives here so the page can tell what has changed from what is saved. */
export default function JoiningFeeSettings({ communityId, community }: { communityId: string; community: any }) {
  const saved = feeOf(community);
  const [draft, setDraft] = useState<CommunityFee | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const fee = draft === undefined ? saved : draft;
  const dirty = JSON.stringify(fee) !== JSON.stringify(saved);
  const error = fee ? validateFee(fee) : null;
  const needsApproval = community?.membershipControl?.approvalRequired || (community?.membershipControl?.accessType ?? 'public') !== 'public';

  const save = async () => {
    if (error) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'communities', communityId), { ...feeFields(fee), updatedAt: serverTimestamp() });
      queueAudit(batch, communityId, { action: 'community.fee', details: fee ? `set to ${formatFee(fee)}` : 'made free' });
      await batch.commit();
      setDraft(undefined);
      toast.success(fee ? 'Joining fee saved' : 'Joining is now free');
    } catch {
      toast.error("Couldn't save the joining fee");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold">Joining fee</h3>
        <p className="text-sm text-foreground/55">Charge a one-time fee to join your community.</p>
      </div>

      <Card title="Fee">
        <FeeEditor value={fee} onChange={setDraft} />
      </Card>

      <Card title="How it works">
        <ul className="space-y-2 text-sm text-foreground/70 list-disc pl-5">
          <li>{needsApproval ? 'Because people request to join, the fee is taken when you approve them, and only if they can afford it.' : 'The fee is taken when someone joins, so they need enough XP first.'}</li>
          <li>The fee is paid in XP and goes to you, the community owner. You aren't charged to join your own community.</li>
          <li>Members who are already in aren't charged, and changing the fee later doesn't refund anyone.</li>
          <li>Card payments aren't available yet.</li>
        </ul>
      </Card>

      <SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onDiscard={() => setDraft(undefined)} />
    </div>
  );
}
