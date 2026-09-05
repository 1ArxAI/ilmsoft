import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { 
  ArrowLeft, Users, GraduationCap, School, 
  Wallet, Calendar, Phone, Mail, TrendingUp,
  Activity, AlertCircle, Download, ExternalLink, RefreshCw,
  LogOut, ShieldCheck, MapPin
} from 'lucide-react';
import './AdminSchoolInsights.css';

type SchoolInfo = {
  id: string; school_name: string; contact: string; email: string;
  total_credits: number; credit_expires_at: string | null; created_at: string;
  address?: string;
};

interface InsightStats {
  students: { total: number; active: number; inactive: number; newCount: number; };
  classes: number;
  teachers: number;
  financials: { totalCollection: number; totalExpected: number; totalOutstanding: number; collectionRate: number; };
  recentActivity: any[];
}

export const AdminSchoolInsights = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [stats, setStats] = useState<InsightStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) { navigate('/login'); return; }
      const { data, error } = await supabase.from('admin_users').select('id').eq('user_id', user.id).single();
      if (error || !data) { navigate('/dashboard'); return; }
      fetchData();
    };
    checkAdmin();
  }, [id, user]);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: schoolData, error: schoolError } = await supabase.from('schools').select('id, school_name, contact, email, address, logo_url, total_credits, credit_expires_at, created_at').eq('id', id).single();
      if (schoolError) throw schoolError;
      setSchool(schoolData);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        { count: totalStudents },
        { count: activeStudents },
        { count: newStudents },
        { count: classesCount },
        { count: teachersCount },
        { data: totalsData },
        { data: recentPayments }
      ] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', id),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', id).eq('active', true),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', id).gte('created_at', thirtyDaysAgo.toISOString()),
        supabase.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', id).eq('active', true),
        supabase.from('teachers').select('*', { count: 'exact', head: true }).eq('school_id', id).eq('is_active', true),
        supabase.rpc('school_financial_totals', { p_school_id: id }).maybeSingle(),
        supabase.from('payments').select('id, received_amount, received_at, parents:parent_id(first_name, last_name)').eq('school_id', id).order('received_at', { ascending: false }).limit(8)
      ]);

      const t = (totalsData || {}) as { total_collection?: number; total_expected?: number; total_outstanding?: number };
      const totalCollection = Number(t.total_collection) || 0;
      const totalExpected = Number(t.total_expected) || 0;
      const totalOutstanding = Number(t.total_outstanding) || 0;
      const collectionRate = totalExpected > 0 ? (totalCollection / totalExpected) * 100 : 0;

      setStats({
        students: { total: totalStudents || 0, active: activeStudents || 0, inactive: (totalStudents || 0) - (activeStudents || 0), newCount: newStudents || 0 },
        classes: classesCount || 0,
        teachers: teachersCount || 0,
        financials: { totalCollection, totalExpected, totalOutstanding, collectionRate },
        recentActivity: recentPayments || []
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="insights-loader-wrap">
      <div className="pro-spinner" />
      <p>Building school intelligence report…</p>
    </div>
  );

  if (error || !school) return (
    <div className="insights-loader-wrap error">
      <AlertCircle size={48} className="text-danger" />
      <h2>Intelligence Report Failed</h2>
      <p>{error || 'School data could not be retrieved'}</p>
      <Button onClick={() => navigate('/admin')}>Back to Dashboard</Button>
    </div>
  );

  return (
    <div className="admin-shell insights-page">
      {/* Reusable Admin Header */}
      <header className="admin-header">
        <div className="admin-logo" onClick={() => navigate('/admin')}>
          <div className="admin-logo-icon"><GraduationCap size={20} /></div>
          <span className="admin-logo-text">ilm<em>soft</em></span>
        </div>
        <span className="admin-badge">Intelligence</span>
        <div className="admin-header-right">
          <Button variant="ghost" size="sm" onClick={fetchData} style={{ color: '#94a3b8' }}>
            <RefreshCw size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={async () => { await signOut(); navigate('/'); }}>
            <LogOut size={15} /> Logout
          </Button>
        </div>
      </header>

      <main className="insights-body">
        {/* Navigation & Breadcrumbs */}
        <div className="insights-nav">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="back-btn">
            <ArrowLeft size={16} /> Back to Dashboard
          </Button>
          <div className="nav-actions">
            <Button variant="secondary" size="sm"><Download size={14} /> Export Report</Button>
            <Button size="sm"><ExternalLink size={14} /> Visit Portal</Button>
          </div>
        </div>

        {/* School Profile Banner */}
        <section className="school-banner">
          <div className="banner-left">
            <div className="pro-avatar">{school?.school_name.charAt(0).toUpperCase()}</div>
            <div className="banner-info">
              <h1>{school?.school_name}</h1>
              <div className="banner-meta">
                <span className="meta-pill"><Mail size={12} /> {school?.email}</span>
                {school?.contact && <span className="meta-pill"><Phone size={12} /> {school?.contact}</span>}
                <span className="meta-pill"><Calendar size={12} /> Joined {school && new Date(school.created_at).toLocaleDateString()}</span>
                {school?.address && <span className="meta-pill"><MapPin size={12} /> {school.address}</span>}
              </div>
            </div>
          </div>
          <div className="banner-right">
            <div className="license-status">
              <ShieldCheck size={20} className="text-success" />
              <div>
                <div className="license-label">License Active</div>
                <div className="license-value">{school?.total_credits} Credits Remaining</div>
              </div>
            </div>
          </div>
        </section>

        {/* Intelligence Grid */}
        <div className="insights-grid">
          {/* Key Metrics Row */}
          <div className="metric-cards">
            {[
              { label: 'Total Enrollment', value: stats?.students.total, sub: `${stats?.students.active} Active Students`, icon: Users, color: 'blue', growth: stats?.students.newCount },
              { label: 'Academic Classes', value: stats?.classes, sub: 'Total Class Sections', icon: School, color: 'purple' },
              { label: 'Verified Faculty', value: stats?.teachers, sub: 'Total Teaching Staff', icon: GraduationCap, color: 'indigo' },
              { label: 'Collection Rate', value: `${stats?.financials.collectionRate.toFixed(1)}%`, sub: 'Fees Collection Efficiency', icon: TrendingUp, color: 'green', bar: stats?.financials.collectionRate },
            ].map((m, i) => (
              <div key={i} className={`metric-card ${m.color}`}>
                <div className="card-head">
                  <div className="card-icon"><m.icon size={20} /></div>
                  {m.growth && m.growth > 0 && <span className="growth-indicator">+{m.growth} new</span>}
                </div>
                <div className="card-main">
                  <div className="metric-value">{m.value}</div>
                  <div className="metric-label">{m.label}</div>
                  <div className="metric-sub">{m.sub}</div>
                </div>
                {m.bar !== undefined && (
                  <div className="card-progress">
                    <div className="progress-fill" style={{ width: `${m.bar}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Detailed Analysis Row */}
          <div className="analysis-row">
            {/* Financial Health Section */}
            <div className="analysis-card financial">
              <div className="card-header">
                <h3><Wallet size={18} /> Financial Performance</h3>
              </div>
              <div className="financial-stats">
                <div className="f-stat">
                  <span className="f-label">Total Collected</span>
                  <span className="f-value text-success">Rs {stats?.financials.totalCollection.toLocaleString()}</span>
                </div>
                <div className="f-stat">
                  <span className="f-label">Total Expected</span>
                  <span className="f-value">Rs {stats?.financials.totalExpected.toLocaleString()}</span>
                </div>
                <div className="f-divider" />
                <div className="f-stat highlight">
                  <span className="f-label">Total Outstanding</span>
                  <span className="f-value text-danger">Rs {stats?.financials.totalOutstanding.toLocaleString()}</span>
                </div>
              </div>
              <div className="financial-advisory">
                <AlertCircle size={16} />
                <p>
                  {stats && stats.financials.collectionRate < 75 
                    ? "Alert: Low collection efficiency detected. Suggest implementing strict recovery measures."
                    : "Note: Financial health is stable. Maintain current follow-up procedures."}
                </p>
              </div>
            </div>

            {/* Recent Activity Section */}
            <div className="analysis-card activity">
              <div className="card-header">
                <h3><Activity size={18} /> Recent System Activity</h3>
              </div>
              <div className="activity-table-wrap">
                <table className="activity-table">
                  <thead>
                    <tr>
                      <th>Entity</th><th>Date</th><th>Type</th><th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats?.recentActivity.map(p => (
                      <tr key={p.id}>
                        <td>
                          <div className="entity-cell">
                            <strong>{(p.parents as any)?.first_name} {(p.parents as any)?.last_name}</strong>
                            <span>Parent</span>
                          </div>
                        </td>
                        <td>{new Date(p.received_at).toLocaleDateString()}</td>
                        <td><span className="type-pill">Payment</span></td>
                        <td className="amount-cell text-success">Rs {p.received_amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    {stats?.recentActivity.length === 0 && (
                      <tr><td colSpan={4} className="empty-row">No recent transactions found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
