import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowRight, 
  Users, 
  Video, 
  Trophy, 
  Store, 
  User as UserIcon, 
  Wallet, 
  MessageSquare, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Globe, 
  Zap, 
  Rocket, 
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  Layout,
  MousePointer2
} from 'lucide-react';
import KithLogo from '../components/KithLogo';

const FeatureCard = ({ icon: Icon, title, desc, delay }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 0.5 }}
    className="group relative p-8 glass rounded-[2rem] border border-white/5 hover:border-primary/50 transition-all duration-500 overflow-hidden"
  >
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="relative z-10">
      <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-500">
        <Icon className="text-primary" size={28} />
      </div>
      <h3 className="text-2xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
        {title}
      </h3>
      <p className="text-white/50 leading-relaxed group-hover:text-white/70 transition-colors">
        {desc}
      </p>
    </div>
  </motion.div>
);

const MetricItem = ({ label, value, icon: Icon }: any) => (
  <div className="flex flex-col items-center md:items-start gap-1 p-6 md:p-0">
    <div className="flex items-center gap-2 text-primary/80 mb-1">
      <Icon size={16} />
      <span className="text-[10px] uppercase tracking-[0.2em] font-mono font-bold leading-none">{label}</span>
    </div>
    <span className="text-3xl md:text-4xl font-bold tracking-tight text-white">{value}</span>
  </div>
);

const TabContent = ({ id, activeId, children }: any) => (
  <AnimatePresence mode="wait">
    {activeId === id && (
      <motion.div
        key={id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.4 }}
        className="relative h-full"
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState('community');

  const tabs = [
    { id: 'community', label: 'Communities', icon: Users },
    { id: 'chat', label: 'Live Chat', icon: MessageSquare },
    { id: 'meetings', label: 'Meetings', icon: Video },
    { id: 'challenges', label: 'Challenges', icon: Trophy },
    { id: 'wallet', label: 'Earnings', icon: Wallet },
  ];

  return (
    <div className="relative overflow-hidden bg-[#050505]">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-purple/10 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-pink/10 blur-[150px] rounded-full animate-pulse delay-1000" />
      </div>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 md:pt-48 md:pb-40 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-[10px] font-mono tracking-wider font-bold text-white/60">V1.0.0_ALPHA_IS_LIVE</span>
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-8 leading-[0.9] text-white">
              The <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-brand-pink to-brand-orange animate-gradient">
                Creator Economy.
              </span>
            </h1>
            
            <p className="text-xl text-white/50 max-w-xl mb-12 leading-relaxed">
              Kith is the all-in-one ecosystem for deep communities, live collaboration, 
              and effortless monetization. Build your legacy, own your data, and grow your wealth.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Link 
                to="/feed" 
                className="w-full sm:w-auto px-10 py-5 bg-white text-black rounded-2xl font-black text-lg hover:scale-105 transition-all shadow-2xl shadow-white/10 flex items-center justify-center gap-3"
              >
                Launch Protocol <Rocket size={22} className="animate-bounce" />
              </Link>
              <Link 
                to="/explore" 
                className="w-full sm:w-auto px-10 py-5 glass border-white/10 text-white rounded-2xl font-bold text-lg hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                Explore Marketplace <Store size={22} />
              </Link>
            </div>

            <div className="mt-12 flex items-center gap-6 grayscale opacity-40">
              <div className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-widest font-bold font-mono">Powered by</span>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/20" />
                  <div className="w-24 h-4 bg-white/20 rounded" />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: 5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            {/* Main Product Card */}
            <div className="relative glass rounded-[3rem] p-4 border-white/20 shadow-[0_0_100px_rgba(124,58,237,0.2)] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-brand-pink/5 to-transparent" />
              <div className="relative aspect-[4/3] rounded-[2rem] overflow-hidden bg-[#0A0A0A]">
                <div className="absolute inset-0 flex flex-col p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20" />
                      <div className="space-y-1.5">
                        <div className="w-24 h-3 bg-white/10 rounded" />
                        <div className="w-16 h-2 bg-white/5 rounded" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-8 h-8 rounded-lg bg-white/5" />
                      <div className="w-8 h-8 rounded-lg bg-white/5" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 h-full">
                    <div className="rounded-3xl bg-white/5 border border-white/10 p-6 flex flex-col justify-between">
                      <TrendingUp className="text-primary" />
                      <div className="space-y-2">
                        <div className="w-12 h-2 bg-white/10 rounded" />
                        <div className="text-2xl font-bold font-mono tracking-tighter">$12,450.00</div>
                      </div>
                    </div>
                    <div className="rounded-3xl bg-gradient-to-br from-primary to-brand-pink p-6 flex flex-col justify-between text-black">
                      <Trophy />
                      <div className="text-sm font-black uppercase tracking-wider">Top Creator</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Mini Cards */}
            <motion.div 
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-10 -right-10 glass p-5 rounded-2xl border-white/10 shadow-2xl flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Users size={20} className="text-orange-500" />
              </div>
              <div>
                <div className="text-[10px] text-white/50 uppercase font-bold tracking-wider">New Member</div>
                <div className="text-sm font-bold">@alex_kraft</div>
              </div>
            </motion.div>

            <motion.div 
              animate={{ y: [0, 20, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute -bottom-10 -left-10 glass p-5 rounded-2xl border-white/10 shadow-2xl flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-500">
                <TrendingUp size={20} />
              </div>
              <div>
                <div className="text-[10px] text-white/50 uppercase font-bold tracking-wider">Revenue</div>
                <div className="text-sm font-bold">+$2,450.00</div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Metrics Bar */}
      <section className="py-12 border-y border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:divide-x md:divide-white/10">
            <MetricItem label="Global Creators" value="12,450+" icon={UserIcon} />
            <MetricItem label="Active Hubs" value="3,200+" icon={Layout} />
            <MetricItem label="Monthly Payouts" value="$1.2M+" icon={Wallet} />
            <MetricItem label="Daily Events" value="150+" icon={Globe} />
          </div>
        </div>
      </section>

      {/* Ecosystem Features Grid */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24">
            <motion.span 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="text-primary font-mono text-sm tracking-[0.4em] uppercase mb-6 block"
            >
              Modular_Architecture
            </motion.span>
            <h2 className="text-4xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
              One ecosystem. <br />
              <span className="text-white/40 italic">Limitless possibilities.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 text-white">
            <FeatureCard 
              icon={Users} 
              title="Hyper-Communities" 
              desc="Build deeply nested channels, roles, and token-gated access systems that scale from 10 to 10M members." 
              delay={0.1}
            />
            <FeatureCard 
              icon={Video} 
              title="Integrated Meetings" 
              desc="Host high-fidelity voice and video sessions directly inside your group. No more external links required." 
              delay={0.2}
            />
            <FeatureCard 
              icon={Trophy} 
              title="Gamified Growth" 
              desc="Drive retention with automated challenges, daily quests, and local leaderboard integrations." 
              delay={0.3}
            />
            <FeatureCard 
              icon={Store} 
              title="Unified Marketplace" 
              desc="Sell ebooks, courses, design assets, and dev tools with zero-friction checkout processes." 
              delay={0.4}
            />
            <FeatureCard 
              icon={UserIcon} 
              title="Creator Identity" 
              desc="Build a high-trust reputation score backed by on-platform verified activity and earnings." 
              delay={0.5}
            />
            <FeatureCard 
              icon={Wallet} 
              title="Protocol Wallet" 
              desc="Track earnings, manage subscriptions, and send XP rewards with a built-in financial dashboard." 
              delay={0.6}
            />
          </div>
        </div>
      </section>

      {/* How it Works Timeline */}
      <section className="py-32 px-6 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
            <div>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8 italic text-white">
                From zero to <br />
                <span className="text-primary">hyper-scale.</span>
              </h2>
              <div className="space-y-12 relative">
                <div className="absolute left-6 top-8 bottom-8 w-px bg-white/10" />
                
                {[
                  { step: "01", title: "Initialize Hub", icon: Sparkles, desc: "Create your unique creator profile and spin up your community hub in seconds." },
                  { step: "02", title: "Deploy Channels", icon: MessageSquare, desc: "Configure chat, voice, and marketplace modules tailored to your specific ecosystem." },
                  { step: "03", title: "Distribute & Earn", icon: Zap, desc: "Invite your audience, launch challenges, and watch your rep and revenue scale automatically." }
                ].map((item, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.2 }}
                    className="flex gap-10 relative z-10"
                  >
                    <div className="w-12 h-12 rounded-full bg-black border-2 border-primary flex items-center justify-center font-mono font-bold text-sm text-primary shadow-[0_0_20px_rgba(124,58,237,0.3)]">
                      {item.step}
                    </div>
                    <div className="pt-2 text-white">
                      <div className="flex items-center gap-3 mb-3">
                        <item.icon size={20} className="text-white/60" />
                        <h4 className="text-2xl font-bold">{item.title}</h4>
                      </div>
                      <p className="text-white/40 max-w-md">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="sticky top-32">
                <div className="aspect-square glass rounded-[4rem] flex items-center justify-center overflow-hidden">
                  <div className="relative w-full h-full flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 border-[40px] border-white/[0.02] rounded-full"
                    />
                    <KithLogo size={200} className="relative z-10 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Showcase Tabs */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 italic text-white">Deep Interface</h2>
            <div className="flex flex-wrap justify-center gap-4 bg-white/5 p-2 rounded-2xl border border-white/10 backdrop-blur-xl">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                    activeTab === tab.id 
                    ? 'bg-white text-black shadow-xl shadow-white/10' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <tab.icon size={18} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="glass rounded-[3rem] p-4 border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
            
            <TabContent id="community" activeId={activeTab}>
              <div className="aspect-video bg-[#0A0A0A] rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
                <Users size={80} className="text-primary mb-8 animate-bounce" />
                <h3 className="text-3xl font-bold mb-4 text-white">Hierarchical Hubs</h3>
                <p className="max-w-xl text-white/50 text-lg">
                  Beautiful, scalable layout for nested channels, categories, and private member areas.
                </p>
              </div>
            </TabContent>

            <TabContent id="chat" activeId={activeTab}>
              <div className="aspect-video bg-[#0A0A0A] rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
                <MessageSquare size={80} className="text-brand-pink mb-8" />
                <h3 className="text-3xl font-bold mb-4 text-white">Real-time Pulse</h3>
                <p className="max-w-xl text-white/50 text-lg">
                  Ultra-fast socket communication with thread support, reactions, and native rich media embeds.
                </p>
              </div>
            </TabContent>

            <TabContent id="meetings" activeId={activeTab}>
              <div className="aspect-video bg-[#0A0A0A] rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
                <Video size={80} className="text-brand-blue mb-8" />
                <h3 className="text-3xl font-bold mb-4 text-white">Native Broadcasts</h3>
                <p className="max-w-xl text-white/50 text-lg">
                  Built-in WebRTC engine for seamless screen sharing, webcam, and spatial audio voice channels.
                </p>
              </div>
            </TabContent>

            <TabContent id="challenges" activeId={activeTab}>
              <div className="aspect-video bg-[#0A0A0A] rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
                <Trophy size={80} className="text-brand-orange mb-8" />
                <h3 className="text-3xl font-bold mb-4 text-white">Incentive Engines</h3>
                <p className="max-w-xl text-white/50 text-lg">
                  Automated XP distribution, timed bounties, and community-wide missions to drive engagement.
                </p>
              </div>
            </TabContent>

            <TabContent id="wallet" activeId={activeTab}>
              <div className="aspect-video bg-[#0A0A0A] rounded-[2rem] p-12 flex flex-col items-center justify-center text-center">
                <Wallet size={80} className="text-green-500 mb-8" />
                <h3 className="text-3xl font-bold mb-4 text-white">Earnings Core</h3>
                <p className="max-w-xl text-white/50 text-lg">
                  Unified dashboard for marketplace sales, subscription revenue, and creator tip payouts.
                </p>
              </div>
            </TabContent>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-8 italic text-white">The Legacy Era vs <span className="text-primary italic">Kith Protocol</span></h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:divide-x lg:divide-white/10">
            <div className="space-y-8 p-12 glass rounded-[3rem] border-red-500/10 bg-red-500/[0.02]">
              <h3 className="text-3xl font-bold text-red-500/80 mb-12 flex items-center gap-4 italic">
                Fragmented Stack <XCircle />
              </h3>
              {[
                "Discord for chat (messy)",
                "Zoom for meetings (disconnected)",
                "Stripe/Gumroad for sales (external)",
                "Waitlists/Forms for challenges",
                "Data owned by centralized giants",
                "Fragmented user experience"
              ].map((item, i) => (
                <div key={i} className="flex gap-4 text-white/40 items-center text-lg">
                  <XCircle size={20} /> {item}
                </div>
              ))}
            </div>
            <div className="space-y-8 p-12 glass rounded-[3rem] border-primary/20 bg-primary/[0.02] neon-glow">
              <h3 className="text-3xl font-bold text-primary mb-12 flex items-center gap-4 italic">
                Unified Ecosystem <CheckCircle2 />
              </h3>
              {[
                "Unified creator hub",
                "Built-in native broadcasts",
                "Integrated 1-click marketplace",
                "Automated challenges & XP",
                "Full data ownership",
                "Polished, consistent friction-free UI"
              ].map((item, i) => (
                <div key={i} className="flex gap-4 text-white items-center text-lg">
                  <CheckCircle2 size={20} className="text-primary" /> {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Split Section */}
      <section className="py-32 px-6 text-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-32">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            className="group"
          >
            <div className="text-[10px] font-mono tracking-widest text-primary mb-4 uppercase">Persona_01</div>
            <h3 className="text-5xl font-bold mb-8 italic">For the <span className="text-primary italic">Creator.</span></h3>
            <div className="space-y-6">
              {[
                { label: "Direct Monetization", desc: "Sell products directly to your most engaged community members." },
                { label: "Automated Reputation", desc: "Your content and activity build your platform-wide XP score." },
                { label: "Community Networking", desc: "Find collaborators and high-ticket opportunities within elite hubs." }
              ].map((benefit, i) => (
                <div key={i} className="p-8 glass rounded-3xl group-hover:bg-white/[0.02] transition-colors border-white/5">
                  <h4 className="font-bold text-xl mb-2">{benefit.label}</h4>
                  <p className="text-white/50">{benefit.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            className="group"
          >
            <div className="text-[10px] font-mono tracking-widest text-brand-pink mb-4 uppercase">Persona_02</div>
            <h3 className="text-5xl font-bold mb-8 italic">For the <span className="text-brand-pink italic">Hub Owner.</span></h3>
            <div className="space-y-6">
              {[
                { label: "Engagement Flywheels", desc: "Retention is built-in with XP triggers and automated events." },
                { label: "Zero-Platform Decay", desc: "Your community stays together with native meetings and chat." },
                { label: "Scalable Economics", desc: "Take a cut of marketplace sales or run premium hub subscriptions." }
              ].map((benefit, i) => (
                <div key={i} className="p-8 glass rounded-3xl group-hover:bg-white/[0.02] transition-colors border-white/5">
                  <h4 className="font-bold text-xl mb-2">{benefit.label}</h4>
                  <p className="text-white/50">{benefit.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Footer */}
      <section className="py-40 px-6 relative overflow-hidden text-white">
        <div className="absolute inset-0 bg-primary/20 blur-[200px] rounded-full scale-150 animate-pulse" />
        <div className="max-w-5xl mx-auto glass rounded-[5rem] p-12 md:p-32 text-center relative z-10 border-white/10 shadow-[0_0_100px_rgba(124,58,237,0.3)]">
          <KithLogo size={120} className="mx-auto mb-12 animate-pulse" />
          <h2 className="text-5xl md:text-8xl font-black tracking-tighter mb-12 italic">
            The future <br /> is <span className="text-primary italic">Kith.</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            <Link 
              to="/signup" 
              className="w-full sm:w-auto px-16 py-6 bg-white text-black rounded-[2rem] font-black text-2xl hover:scale-110 transition-all flex items-center justify-center gap-4"
            >
              Join Protocol <ArrowRight size={28} />
            </Link>
          </div>
          <div className="mt-20 flex flex-wrap justify-center gap-x-12 gap-y-6 text-white/30 font-mono text-xs uppercase tracking-widest">
            <Link to="/explore" className="hover:text-white transition-colors">Marketplace</Link>
            <Link to="/feed" className="hover:text-white transition-colors">Neural Feed</Link>
            <Link to="/docs" className="hover:text-white transition-colors">Documentation</Link>
            <Link to="/status" className="hover:text-white transition-colors">Status_Report</Link>
          </div>
        </div>
      </section>

      {/* Floating Action Button */}
      <motion.div 
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-8 right-8 z-50 flex items-center gap-3 p-2 pl-6 glass border-white/20 rounded-full shadow-2xl"
      >
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white/60">System Ready</span>
        <button className="bg-primary p-4 rounded-full text-white hover:scale-110 transition-transform">
          <MessageSquare size={20} />
        </button>
      </motion.div>
    </div>
  );
}
