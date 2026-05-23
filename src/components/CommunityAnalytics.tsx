import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import { TrendingUp, Users, MessageSquare, Award, Clock, Layout, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface AnalyticsProps {
  communityId: string;
}

const COLORS = ['#00F2FF', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444'];

export default function CommunityAnalytics({ communityId }: AnalyticsProps) {
  const [stats, setStats] = useState<any>(null);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        // Fetch community basic stats
        const commSnap = await getDoc(doc(db, 'communities', communityId));
        const commData = commSnap.data();

        // Simulate daily data (in production, this would come from a 'analytics' subcollection)
        // For demo, we'll generate some realistic looking trends
        const mockDailyData = Array.from({ length: 7 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - (6 - i));
          return {
            date: date.toLocaleDateString([], { weekday: 'short' }),
            active: Math.floor(Math.random() * 50) + 20,
            messages: Math.floor(Math.random() * 200) + 50,
            xp: Math.floor(Math.random() * 1000) + 500
          };
        });

        setDailyData(mockDailyData);
        setStats({
          postsCount: commData?.stats?.postsCount || 0,
          messagesCount: commData?.stats?.messagesCount || 0,
          totalXp: commData?.stats?.totalXp || 0
        });
        setLoading(false);
      } catch (error) {
        console.error("Analytics fetch error:", error);
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [communityId]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-8 pb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Total XP Generated" 
          value={(stats?.totalXp || 0).toLocaleString()} 
          icon={<Award className="text-yellow-500" />} 
          trend="+12%" 
          positive 
        />
        <StatCard 
          label="Engagement Rate" 
          value="24.8%" 
          icon={<Zap className="text-primary" />} 
          trend="+5.2%" 
          positive 
        />
        <StatCard 
          label="Daily Messages" 
          value={(stats?.messagesCount || 0).toLocaleString()} 
          icon={<MessageSquare className="text-blue-500" />} 
          trend="-2.1%" 
        />
        <StatCard 
          label="Active Retention" 
          value="68%" 
          icon={<Users className="text-purple-500" />} 
          trend="+0.5%" 
          positive 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Trend */}
        <div className="glass rounded-[32px] p-6 border border-foreground/5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg">Engagement Activity</h3>
            <select className="bg-foreground/5 border-none text-xs font-bold rounded-lg px-3 py-1 outline-none text-foreground/50">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00F2FF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00F2FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10}} />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="messages" stroke="#00F2FF" fillOpacity={1} fill="url(#colorXp)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attendance Distribution */}
        <div className="glass rounded-[32px] p-6 border border-foreground/5">
          <h3 className="font-bold text-lg mb-6">Activity by Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                />
                <Bar dataKey="active" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, trend, positive }: any) {
  return (
    <div className="glass rounded-3xl p-6 border border-foreground/5 relative overflow-hidden group">
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs font-bold text-foreground/30 uppercase tracking-widest mb-1">{label}</p>
          <h4 className="text-2xl font-black">{value}</h4>
          <div className={`flex items-center gap-1 mt-2 text-[10px] font-bold ${positive ? 'text-green-400' : 'text-red-400'}`}>
            {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend} <span className="text-foreground/20 font-normal">vs last week</span>
          </div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:scale-110 transition-transform">
          {icon}
        </div>
      </div>
      <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/20 transition-colors" />
    </div>
  );
}
