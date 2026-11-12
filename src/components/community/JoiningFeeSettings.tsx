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
        <p className="text-sm text-foreground/55">Charge XP or real money to join your community.</p>
      </div>

      <Card title="Fee">
        <FeeEditor value={fee} onChange={setDraft} />
      </Card>

      <Card title="How it works">
        <ul className="space-y-2 text-sm text-foreground/70 list-disc pl-5">
          <li>{needsApproval ? 'Because people request to join, they pay when you approve them. Real-money members pay from their own account after approval.' : 'The fee is taken when someone joins.'}</li>
          <li>XP fees are one-time and go straight to you. Real-money fees are collected by Paystack and credited to your Kith balance, less the platform fee.</li>
          <li>Monthly fees renew automatically every month. Leaving the community stops future payments. If a renewal fails, access pauses until the payment succeeds.</li>
          <li>The fee goes to you, the community owner. You aren't charged to join your own community.</li>
          <li>Members who are already in aren't charged again, and changing the fee later doesn't refund anyone or change an existing subscription.</li>
        </ul>
      </Card>

      <SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onDiscard={() => setDraft(undefined)} />
    </div>
  );
}
