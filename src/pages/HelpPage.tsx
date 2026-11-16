import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, LifeBuoy, MessageCircle, ShieldCheck } from 'lucide-react';
import PageHero from '../components/ui/PageHero';
import { Badge } from '../components/ui/Badge';

const TOPICS = [
  {
    icon: BookOpen,
    title: 'Getting started',
    body: 'Set up a profile, find a community, and learn how rooms, events and the journal fit together.',
    to: '/communities',
    action: 'Browse communities',
  },
  {
    icon: MessageCircle,
    title: 'Your account',
    body: 'Signing in, notifications, messages, and the settings that keep Kith feeling like yours.',
    to: '/login',
    action: 'Sign in',
  },
  {
    icon: ShieldCheck,
    title: 'Safety & moderation',
    body: 'How hosts moderate rooms, what private means, and how to report something that feels wrong.',
    to: '/communities',
    action: 'Read the community rules',
  },
];

export default function HelpPage() {
  return (
    <div className="bg-[#0e0b13] text-[#f7f2e8]">
      <PageHero
        containerClassName="max-w-[1100px]"
        eyebrow={
          <Badge variant="primary" dot>
            Help &amp; support
          </Badge>
        }
        title={
          <>
            A hand when you
            <br />
            <span className="font-serif font-normal italic tracking-[-0.03em] text-[#ffb65c]">need one.</span>
          </>
        }
        titleClassName="max-w-[18ch] text-[clamp(2.4rem,5.4vw,4rem)] font-semibold leading-[0.94] tracking-[-0.065em] md:text-[clamp(2.4rem,5.4vw,4rem)]"
        description="Most answers live here. If yours doesn't, write to us — a person reads it."
        actions={
          <a
            href="mailto:hello@kith.community"
            className="inline-flex items-center gap-2 rounded-full bg-[#f7f2e8] px-5 py-3 text-[13px] font-bold text-[#171120] transition-transform hover:-translate-y-0.5"
          >
            <LifeBuoy size={16} />
            Email support
          </a>
        }
      />

      <div className="mx-auto max-w-[1100px] px-5 pb-24 pt-10 md:px-8">
        <div className="grid gap-3 md:grid-cols-3">
          {TOPICS.map((topic) => (
            <article
              key={topic.title}
              className="flex h-full flex-col rounded-[24px] border border-[#ffffff0f] bg-[#141019] p-5"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff6b4a]/10 text-[#ff6b4a]">
                <topic.icon size={18} />
              </span>
              <h2 className="mt-4 font-display text-[18px] font-semibold tracking-[-0.02em]">
                {topic.title}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[#f7f2e8]/50">{topic.body}</p>
              <Link
                to={topic.to}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#ffb65c] hover:text-[#ff6b4a]"
              >
                {topic.action}
                <ArrowRight size={14} />
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-4 rounded-[26px] border border-[#ffffff0f] bg-[#141019] p-6 md:p-8">
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em]">Common questions</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {[
              ['Is Kith free?', 'Yes. Joining, following and most community activity are free. Some hosts charge for memberships, events or their work, and you always see the price in naira before you join.'],
              ['Do I need an account to look around?', 'No. Browse communities, events, the marketplace and the journal first. When you want to join a room or buy something, Open Kith will take you to sign in.'],
              ['What happens when I join a community?', 'You join as a member, see its rooms, and can take part in the conversation. You can leave quietly whenever you like.'],
              ['How do I sell my work?', 'Open your creator dashboard, add a product with a naira price, and share it with your circle. Checkout is built in.'],
            ].map(([question, answer]) => (
              <div key={question}>
                <p className="text-sm font-semibold">{question}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[#f7f2e8]/50">{answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
