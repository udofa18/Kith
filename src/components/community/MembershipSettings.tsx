import { Plus, Trash2 } from 'lucide-react';
import { Card, SwitchRow, SaveBar, inputClass } from './settingsUi';

const ACCESS = [
  { id: 'public', label: 'Public', desc: 'Listed in search. Anyone can join straight away.' },
  { id: 'invite-only', label: 'Invite only', desc: 'Listed in search, but people have to request to join.' },
  { id: 'private', label: 'Private', desc: 'Hidden from search. People have to request to join.' },
];

const DEFAULTS = {
  accessType: 'public', approvalRequired: false, memberVerificationRequired: false,
  profileCompletionRequired: false, autoRoles: [] as string[], onboardingQuestions: [] as any[],
};

const clean = (control: any) => {
  const c = { ...DEFAULTS, ...(control || {}) };
  return {
    ...c,
    onboardingQuestions: (c.onboardingQuestions || [])
      .filter((q: any) => q.question?.trim())
      .map((q: any) => ({
        id: q.id, question: q.question.trim(), type: q.type || 'text', required: !!q.required,
        ...(q.type === 'multiple-choice' ? { options: (q.options || []).map((o: string) => o.trim()).filter(Boolean) } : {}),
      })),
  };
};

interface Props {
  form: any;
  setForm: (f: any) => void;
  saved: any;
  roles: any[];
  onSave: (updates: any) => Promise<void> | void;
  isSaving: boolean;
}

export default function MembershipSettings({ form, setForm, saved, roles, onSave, isSaving }: Props) {
  const control = { ...DEFAULTS, ...(form.membershipControl || {}) };
  const set = (patch: Record<string, unknown>) => setForm({ ...form, membershipControl: { ...control, ...patch } });
  const questions: any[] = control.onboardingQuestions || [];
  const requestsOnly = control.accessType !== 'public';

  const dirty = JSON.stringify(clean(control)) !== JSON.stringify(clean(saved?.membershipControl));
  const badQuestion = questions.find(q => q.question?.trim() && q.type === 'multiple-choice' && (q.options || []).filter((o: string) => o.trim()).length < 2);
  const error = badQuestion ? `"${badQuestion.question}" needs at least two options.` : null;

  const updateQuestion = (id: string, patch: any) => set({ onboardingQuestions: questions.map(q => q.id === id ? { ...q, ...patch } : q) });
  const addQuestion = () => set({ onboardingQuestions: [...questions, { id: Math.random().toString(36).slice(2, 11), question: '', type: 'text', required: false }] });
  const toggleRole = (id: string) => set({ autoRoles: control.autoRoles.includes(id) ? control.autoRoles.filter((r: string) => r !== id) : [...control.autoRoles, id] });

  const save = () => {
    const next = clean(control);
    return onSave({ isPrivate: next.accessType === 'private', membershipControl: next });
  };

  return (
    <div className="space-y-5">
      <Card title="Who can join" description="Choose how people get into your community.">
        <div role="radiogroup" className="space-y-2">
          {ACCESS.map(opt => {
            const on = control.accessType === opt.id;
            return (
              <button
                key={opt.id} role="radio" aria-checked={on} onClick={() => set({ accessType: opt.id })}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${on ? 'border-primary bg-primary/5' : 'border-foreground/10 hover:border-foreground/25'}`}
              >
                <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${on ? 'border-primary' : 'border-foreground/30'}`}>
                  {on && <span className="w-2 h-2 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-sm text-foreground/55">{opt.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-foreground/10">
          <SwitchRow
            title="Approve new members"
            hint={requestsOnly ? 'Always on for private and invite-only communities.' : 'Review each person before they join.'}
            checked={requestsOnly || control.approvalRequired}
            disabled={requestsOnly}
            onChange={v => set({ approvalRequired: v })}
          />
        </div>
      </Card>

      <Card title="Requirements" description="Checked when someone tries to join. Existing members aren't affected.">
        <div className="divide-y divide-foreground/10">
          <SwitchRow title="Verified accounts only" hint="Only people with a verified Kith profile can join." checked={control.memberVerificationRequired} onChange={v => set({ memberVerificationRequired: v })} />
          <SwitchRow title="Completed profile" hint="Joining requires a bio and a profile photo." checked={control.profileCompletionRequired} onChange={v => set({ profileCompletionRequired: v })} />
        </div>
      </Card>

      <Card title="Starting roles" description="Roles given to people when you approve their request.">
        {roles.length === 0 ? (
          <p className="text-sm text-foreground/55">You haven't created any roles yet. Add some under Roles & permissions.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roles.map(role => {
              const on = control.autoRoles.includes(role.id);
              return (
                <button
                  key={role.id} role="checkbox" aria-checked={on} onClick={() => toggleRole(role.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-foreground/15 text-foreground/70 hover:border-foreground/30'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color || '#94A3B8' }} />{role.name}
                </button>
              );
            })}
          </div>
        )}
        {!requestsOnly && !control.approvalRequired && control.autoRoles.length > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">Starting roles only apply when you approve requests. People joining a public community without approval don't receive them.</p>
        )}
      </Card>

      <Card title="Joining questions" description="Shown to people when they join. Answers appear on their join request.">
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-foreground/10 p-3 space-y-3">
              <div className="flex gap-2">
                <input
                  value={q.question} onChange={e => updateQuestion(q.id, { question: e.target.value })} maxLength={200}
                  placeholder={`Question ${i + 1}`} aria-label={`Question ${i + 1}`} className={inputClass}
                />
                <select value={q.type} onChange={e => updateQuestion(q.id, { type: e.target.value })} aria-label="Answer type" className={`${inputClass} !w-44`}>
                  <option value="text">Written answer</option>
                  <option value="multiple-choice">Multiple choice</option>
                </select>
                <button
                  onClick={() => set({ onboardingQuestions: questions.filter(x => x.id !== q.id) })}
                  aria-label="Remove question" className="p-2 rounded-lg text-foreground/40 hover:text-red-500 hover:bg-red-500/10"
                ><Trash2 size={16} /></button>
              </div>
              {q.type === 'multiple-choice' && (
                <input
                  value={(q.options || []).join(', ')} onChange={e => updateQuestion(q.id, { options: e.target.value.split(',').map(o => o.trimStart()) })}
                  placeholder="Options, separated by commas" aria-label="Options" className={inputClass}
                />
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
                <input type="checkbox" checked={!!q.required} onChange={e => updateQuestion(q.id, { required: e.target.checked })} className="accent-primary" />
                Required
              </label>
            </div>
          ))}
          {questions.length === 0 && <p className="text-sm text-foreground/55">No questions yet.</p>}
          <button onClick={addQuestion} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Plus size={15} /> Add question
          </button>
        </div>
      </Card>

      <SaveBar
        dirty={dirty} saving={isSaving} error={error} onSave={() => !error && save()}
        onDiscard={() => setForm({ ...form, membershipControl: { ...DEFAULTS, ...(saved?.membershipControl || {}) } })}
      />
    </div>
  );
}
