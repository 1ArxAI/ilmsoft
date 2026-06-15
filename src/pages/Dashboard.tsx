import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
// Direct UI parts
import { InvoicePrinter } from '../components/InvoicePrinter';
import { PaymentReceipt } from '../components/PaymentReceipt';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  LayoutDashboard, GraduationCap, DollarSign,
  Users2, CreditCard, History as HistoryIcon, LogOut, AlertTriangle, Clock,
  CheckCircle, XCircle, BookOpen,
  Receipt, Banknote, ChevronDown, Settings, BarChart2, Calendar
} from 'lucide-react';
import './Dashboard.css';

// Lazy load heavy manager components
const SuppliersManager = lazy(() => import('../components/SuppliersManager').then(m => ({ default: m.SuppliersManager })));
const ParentsManager = lazy(() => import('../components/ParentsManager').then(m => ({ default: m.ParentsManager })));
const StudentsManager = lazy(() => import('../components/StudentsManager').then(m => ({ default: m.StudentsManager })));
const ExtraFeeCollectionManager = lazy(() => import('../components/ExtraFeeCollectionManager').then(m => ({ default: m.ExtraFeeCollectionManager })));
const TeachersManager = lazy(() => import('../components/TeachersManager').then(m => ({ default: m.TeachersManager })));
const ExtraFeesManager = lazy(() => import('../components/ExtraFeesManager').then(m => ({ default: m.ExtraFeesManager })));
const StudentPromotion = lazy(() => import('../components/StudentPromotionModule').then(m => ({ default: m.default })));
const CustomReceiptManager = lazy(() => import('../components/CustomReceiptManager').then(m => ({ default: m.CustomReceiptManager })));
const ExamManager = lazy(() => import('../components/ExamManager').then(m => ({ default: m.default })));
const ExamResultsManager = lazy(() => import('../components/ExamResultsSpreadsheet'));
const ResultCardManager = lazy(() => import('../components/ResultCardManager'));

const ClassesManager = lazy(() => import('../components/ClassesManager').then(m => ({ default: m.ClassesManager })));
const IncomeManager = lazy(() => import('../components/IncomeManager').then(m => ({ default: m.IncomeManager })));
const ExpenseManager = lazy(() => import('../components/ExpenseManager').then(m => ({ default: m.ExpenseManager })));
const FeeStatsManager = lazy(() => import('../components/FeeStatsManager').then(m => ({ default: m.FeeStatsManager })));
const SchoolProfileManager = lazy(() => import('../components/SchoolProfileManager').then(m => ({ default: m.SchoolProfileManager })));
const TeamManager = lazy(() => import('../components/TeamManager').then(m => ({ default: m.TeamManager })));
const FeeGenerationManager = lazy(() => import('../components/FeeGenerationManager').then(m => ({ default: m.FeeGenerationManager })));
const LedgerManager = lazy(() => import('../components/LedgerManager').then(m => ({ default: m.LedgerManager })));
const MissingFeeManager = lazy(() => import('../components/MissingFeeManager').then(m => ({ default: m.MissingFeeManager })));
const PaymentPortalV2 = lazy(() => import('../components/PaymentPortalV2').then(m => ({ default: m.PaymentPortalV2 })));
const ArchiveManager = lazy(() => import('../components/ArchiveManager').then(m => ({ default: m.ArchiveManager })));

// Loading fallback for lazy components
const ManagerFallback = () => (
  <div className="manager-loading">
    <div className="spinner" />
    <span>Loading…</span>
  </div>
);

type Tab = 'overview' | 'fee-stats' | 'classes' | 'people' | 'people-students' | 'people-parents' | 'people-teachers' | 'people-archive' | 'finances' | 'finances-income' | 'finances-expense' | 'finances-suppliers' | 'finances-extra-fees' | 'finances-custom-receipt' | 'team' | 'profile' | 'extra-fees' | 'buy' | 'history' | 'fees-generate' | 'fees-view' | 'fees-payment' | 'fees-missing' | 'exams-terms' | 'exams-promotion' | 'exams-results' | 'exams-results-cards';

const PAGE_TITLES: Record<Tab, string> = {
  overview: '',
  'fee-stats': 'Fee Stats',
  classes: 'Classes',
  team: 'Team Management',
  buy: 'Buy Credits',
  profile: 'School Profile',
  'extra-fees': 'Extra Fees',
  history: 'Payment History',
  people: 'People',
  'people-parents': 'Parents & Guardians',
  'people-students': 'Students',
  'people-teachers': 'Teachers',
  'people-archive': 'Deactivated Records',
  finances: 'Finances',
  'finances-income': 'Income',
  'finances-expense': 'Expenses',
  'finances-suppliers': 'Suppliers',
  'finances-extra-fees': 'One-Time Fee Collection',
  'finances-custom-receipt': 'Invoice & Payment Generator',
  'fees-generate': 'Generate Fees',
  'fees-view': 'Ledger & Statements',
  'fees-payment': 'Receive Payment',
  'fees-missing': 'Missing Fees',
  'exams-terms': 'Examination Terms',
  'exams-promotion': 'Student Promotion',
  'exams-results': 'Exam Results',
  'exams-results-cards': 'Academic Result Cards',
};

const currentMonthStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const Dashboard = () => {
  const { profile, role, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<Tab>('overview');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [payMethod, setPayMethod] = useState<'JazzCash' | 'Bank'>('JazzCash');
  const [plan, setPlan] = useState<{ credits: number; pkr: number } | null>(null);
  const [reference, setReference] = useState('');
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: string }>({ text: '', type: '' });
  const [history, setHistory] = useState<any[]>([]);
  const [creditExpired, setCreditExpired] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [overviewStats, setOverviewStats] = useState({ parents: 0, students: 0, classes: 0 });
  const [focusedParentId, setFocusedParentId] = useState<string | null>(null);
  const [showPrinterOverlay, setShowPrinterOverlay] = useState(false);
  const [showReceiptOverlay, setShowReceiptOverlay] = useState(false);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [adminSettings, setAdminSettings] = useState<any>(null);

  const changeTab = (t: Tab) => {
    if (creditExpired && t !== 'buy' && t !== 'history') {
      setMsg({ text: 'Access locked: Please purchase credits first.', type: 'error' });
      setTab('buy');
      return;
    }
    setTab(t);
  };

  const checkCredits = useCallback(() => {
    if (!profile) return;
    const now = new Date();
    const exp = profile.credit_expires_at ? new Date(profile.credit_expires_at) : null;
    const expired = !!exp && exp <= now;
    const days = exp ? Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / 86400000)) : profile.total_credits;
    setCreditExpired(expired || profile.total_credits <= 0);
    setDaysLeft(days);
    if (expired || profile.total_credits <= 0) setTab('buy');
  }, [profile]);

  const loadOverviewStats = useCallback(async () => {
    if (!profile) return;
    try {
      const [parentsRes, studentsRes, classesRes] = await Promise.all([
        supabase.from('parents').select('id', { count: 'exact', head: true }).eq('school_id', profile.id),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', profile.id),
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', profile.id),
      ]);
      setOverviewStats({
        parents: parentsRes.count || 0,
        students: studentsRes.count || 0,
        classes: classesRes.count || 0,
      });
    } catch (err: any) {
      console.error('Error loading overview stats:', err);
      setMsg({ text: 'Failed to load dashboard statistics', type: 'error' });
      setOverviewStats({ parents: 0, students: 0, classes: 0 });
    }
  }, [profile]);

  const loadAdminSettings = useCallback(async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase.from('admin_settings').select('id, jazzcash_number, jazzcash_name, bank_name, bank_account_title, bank_iban').eq('id', 'global').maybeSingle();
      if (error) {
        console.error('Error fetching admin settings:', error);
      } else if (data) {
        setAdminSettings(data);
      } else {
        console.log('No global admin settings found. Using fallbacks.');
      }
    } catch (err) {
      console.error('Unexpected error fetching admin settings:', err);
    }
  }, [profile]);

  const loadHistory = useCallback(async () => {
    if (!profile) return;
    try {
      const { data } = await supabase.from('credit_requests').select('id, school_id, credits, amount_pkr, payment_method, payment_reference, status, created_at, admin_notes').eq('school_id', profile.id).order('created_at', { ascending: false });
      setHistory(data || []);
    } catch (err: any) {
      console.error('Error loading payment history:', err);
      setMsg({ text: 'Failed to load payment history', type: 'error' });
      setHistory([]);
    }
  }, [profile]);

  useEffect(() => { if (profile) { checkCredits(); loadOverviewStats(); loadAdminSettings(); } }, [profile, checkCredits, loadOverviewStats, loadAdminSettings]);
  useEffect(() => { if (tab === 'history' && profile) loadHistory(); }, [tab, profile, loadHistory]);
  useEffect(() => { if (tab === 'buy') loadAdminSettings(); }, [tab, loadAdminSettings]);
  useEffect(() => {
    const s = location.state as { showBuyCredits?: boolean };
    if (s?.showBuyCredits) { setTab('buy'); navigate('/dashboard', { replace: true, state: {} }); }
  }, [location, navigate]);

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !plan || !reference) return;

    // Validate reference format (max 100 chars, no special injection chars)
    const cleanReference = reference.trim();
    if (cleanReference.length < 5) {
      setMsg({ text: 'Error: Reference number must be at least 5 characters', type: 'error' });
      return;
    }
    if (cleanReference.length > 100) {
      setMsg({ text: 'Error: Reference number is too long (max 100 characters)', type: 'error' });
      return;
    }

    setBuying(true); setMsg({ text: '', type: '' });
    const { error } = await supabase.from('credit_requests').insert({
      school_id: profile.id, credits: plan.credits, amount_pkr: plan.pkr,
      payment_method: payMethod, payment_reference: cleanReference, status: 'pending'
    });
    setBuying(false);
    if (error) setMsg({ text: `Error: ${error.message}`, type: 'error' });
    else {
      setMsg({ text: 'Request submitted! Admin will approve within 24 hours.', type: 'success' });
      setReference(''); setPlan(null); refreshProfile();
    }
  };

  const handleLogout = useCallback(async () => { await signOut(); navigate('/'); }, [signOut, navigate]);

  if (!profile) return (
    <div className="dash-loading">
      <div className="spinner" />
      <span>Loading dashboard…</span>
    </div>
  );

  return (
    <div className="dash-shell">
      {/* ─── Sidebar ─── */}
      <aside className="dash-sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon"><GraduationCap size={20} /></div>
          <span className="sidebar-logo-text">ilm<em>soft</em></span>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item${tab === 'overview' ? ' active' : ''}`}
            onClick={() => changeTab('overview')}
            style={creditExpired ? { opacity: 0.5 } : undefined}
          >
            <LayoutDashboard size={18} /> Overview
          </button>

          <button
            className={`sidebar-nav-item${tab === 'fee-stats' ? ' active' : ''}`}
            onClick={() => changeTab('fee-stats')}
            style={creditExpired ? { opacity: 0.5 } : undefined}
          >
            <BarChart2 size={18} /> Fee Stats
          </button>

          {/* People section */}
          <div className="sidebar-section">
            <div className={`sidebar-section-header${openSections.has('people') ? ' is-open' : ''}`}>
              <button
                className={`sidebar-nav-item has-sub${tab.startsWith('people') ? ' active' : ''}`}
                onClick={() => {
                  const current = openSections.has('people') ? new Set([...openSections].filter(s => s !== 'people')) : new Set([...openSections, 'people']);
                  setOpenSections(current);
                  if (current.has('people')) changeTab('people-parents');
                }}
                style={creditExpired ? { opacity: 0.5 } : undefined}
              >
                <Users2 size={18} /> People <ChevronDown size={14} className="sub-chevron" />
              </button>
              <div className="sidebar-sub-items">
                <button className={`sidebar-sub-item${tab === 'people-parents' ? ' active' : ''}`} onClick={() => changeTab('people-parents')} style={creditExpired ? { opacity: 0.5 } : undefined}>Parents & Guardians</button>
                <button className={`sidebar-sub-item${tab === 'people-students' ? ' active' : ''}`} onClick={() => changeTab('people-students')} style={creditExpired ? { opacity: 0.5 } : undefined}>Students</button>
                <button className={`sidebar-sub-item${tab === 'people-archive' ? ' active' : ''}`} onClick={() => changeTab('people-archive')} style={creditExpired ? { opacity: 0.5 } : undefined}>Deactivated Records</button>
              </div>
            </div>
          </div>

          {/* Finances section */}
          <div className="sidebar-section">
            <div className={`sidebar-section-header${openSections.has('finances') ? ' is-open' : ''}`}>
              <button
                className={`sidebar-nav-item has-sub${tab.startsWith('finances') ? ' active' : ''}`}
                onClick={() => {
                  const current = openSections.has('finances') ? new Set([...openSections].filter(s => s !== 'finances')) : new Set([...openSections, 'finances']);
                  setOpenSections(current);
                  if (current.has('finances')) changeTab('finances-income');
                }}
                style={creditExpired ? { opacity: 0.5 } : undefined}
              >
                <DollarSign size={18} /> Finances <ChevronDown size={14} className="sub-chevron" />
              </button>
              <div className="sidebar-sub-items">
                <button className={`sidebar-sub-item${tab === 'finances-income' ? ' active' : ''}`} onClick={() => changeTab('finances-income')} style={creditExpired ? { opacity: 0.5 } : undefined}>Income</button>
                <button className={`sidebar-sub-item${tab === 'finances-expense' ? ' active' : ''}`} onClick={() => changeTab('finances-expense')} style={creditExpired ? { opacity: 0.5 } : undefined}>Expenses</button>
                <button className={`sidebar-sub-item${tab === 'finances-suppliers' ? ' active' : ''}`} onClick={() => changeTab('finances-suppliers')} style={creditExpired ? { opacity: 0.5 } : undefined}>Suppliers</button>
                <button className={`sidebar-sub-item${tab === 'finances-extra-fees' ? ' active' : ''}`} onClick={() => changeTab('finances-extra-fees')} style={creditExpired ? { opacity: 0.5 } : undefined}>One-Time Collection</button>
                <button className={`sidebar-sub-item${tab === 'finances-custom-receipt' ? ' active' : ''}`} onClick={() => changeTab('finances-custom-receipt')} style={creditExpired ? { opacity: 0.5 } : undefined}>Invoice / Payment</button>
              </div>
            </div>
          </div>

          {/* Fees Section */}
          <div className="sidebar-section">
            <div className={`sidebar-section-header${openSections.has('fees-grp') ? ' is-open' : ''}`}>
              <button 
                className={`sidebar-nav-item has-sub${tab.startsWith('fees-') ? ' active' : ''}`}
                onClick={() => {
                  const current = openSections.has('fees-grp') ? new Set([...openSections].filter(s => s !== 'fees-grp')) : new Set([...openSections, 'fees-grp']);
                  setOpenSections(current);
                  if (current.has('fees-grp')) changeTab('fees-view');
                }}
                style={creditExpired ? { opacity: 0.5 } : undefined}
              >
                <Receipt size={18} /> Fees <ChevronDown size={14} className="sub-chevron" />
              </button>
              <div className="sidebar-sub-items">
                <button className={`sidebar-sub-item${tab === 'fees-view' ? ' active' : ''}`} onClick={() => changeTab('fees-view')} style={creditExpired ? { opacity: 0.5 } : undefined}>Ledger & Statements</button>
                <button className={`sidebar-sub-item${tab === 'fees-payment' ? ' active' : ''}`} onClick={() => changeTab('fees-payment')} style={creditExpired ? { opacity: 0.5 } : undefined}>Receive Payment</button>
                <button className={`sidebar-sub-item${tab === 'fees-generate' ? ' active' : ''}`} onClick={() => changeTab('fees-generate')} style={creditExpired ? { opacity: 0.5 } : undefined}>Generate Fees</button>
                <button className={`sidebar-sub-item${tab === 'fees-missing' ? ' active' : ''}`} onClick={() => changeTab('fees-missing')} style={creditExpired ? { opacity: 0.5 } : undefined}>Missing Fees</button>
              </div>
            </div>
          </div>

          {/* Exams Section */}
          <div className="sidebar-section">
            <div className={`sidebar-section-header${openSections.has('exams-grp') ? ' is-open' : ''}`}>
              <button 
                className={`sidebar-nav-item has-sub${tab.startsWith('exams-') ? ' active' : ''}`}
                onClick={() => {
                  const current = openSections.has('exams-grp') ? new Set([...openSections].filter(s => s !== 'exams-grp')) : new Set([...openSections, 'exams-grp']);
                  setOpenSections(current);
                  if (current.has('exams-grp')) changeTab('exams-terms');
                }}
                style={creditExpired ? { opacity: 0.5 } : undefined}
              >
                <Calendar size={18} /> Exams <ChevronDown size={14} className="sub-chevron" />
              </button>
              <div className="sidebar-sub-items">
                <button className={`sidebar-sub-item${tab === 'exams-terms' ? ' active' : ''}`} onClick={() => changeTab('exams-terms')} style={creditExpired ? { opacity: 0.5 } : undefined}>Examination Terms</button>
                <button className={`sidebar-sub-item${tab === 'exams-promotion' ? ' active' : ''}`} onClick={() => changeTab('exams-promotion')} style={creditExpired ? { opacity: 0.5 } : undefined}>Student Promotion</button>
                <button className={`sidebar-sub-item${tab === 'exams-results' ? ' active' : ''}`} onClick={() => changeTab('exams-results')} style={creditExpired ? { opacity: 0.5 } : undefined}>Exam Results</button>
                <button className={`sidebar-sub-item${tab === 'exams-results-cards' ? ' active' : ''}`} onClick={() => changeTab('exams-results-cards')} style={creditExpired ? { opacity: 0.5 } : undefined}>Result Cards</button>
              </div>
            </div>
          </div>

          {/* School Profile section */}
          <div className="sidebar-section">
            <div className={`sidebar-section-header${openSections.has('profile-grp') ? ' is-open' : ''}`}>
              <button
                className={`sidebar-nav-item has-sub${['profile', 'classes', 'people-teachers', 'team'].includes(tab) ? ' active' : ''}`}
                onClick={() => {
                  const current = openSections.has('profile-grp') ? new Set([...openSections].filter(s => s !== 'profile-grp')) : new Set([...openSections, 'profile-grp']);
                  setOpenSections(current);
                  if (current.has('profile-grp')) changeTab('profile');
                }}
                style={creditExpired ? { opacity: 0.5 } : undefined}
              >
                <Settings size={18} /> School Profile <ChevronDown size={14} className="sub-chevron" />
              </button>
              <div className="sidebar-sub-items">
                <button className={`sidebar-sub-item${tab === 'profile' ? ' active' : ''}`} onClick={() => changeTab('profile')} style={creditExpired ? { opacity: 0.5 } : undefined}>General Profile</button>
                <button className={`sidebar-sub-item${tab === 'classes' ? ' active' : ''}`} onClick={() => changeTab('classes')} style={creditExpired ? { opacity: 0.5 } : undefined}>Classes</button>
                <button className={`sidebar-sub-item${tab === 'people-teachers' ? ' active' : ''}`} onClick={() => changeTab('people-teachers')} style={creditExpired ? { opacity: 0.5 } : undefined}>Teachers</button>
                <button className={`sidebar-sub-item${tab === 'team' ? ' active' : ''}`} onClick={() => changeTab('team')} style={creditExpired ? { opacity: 0.5 } : undefined}>Team Management</button>
                <button className={`sidebar-sub-item${tab === 'extra-fees' ? ' active' : ''}`} onClick={() => changeTab('extra-fees')} style={creditExpired ? { opacity: 0.5 } : undefined}>Extra Fees</button>
              </div>
            </div>
          </div>
        </nav>

        {/* Bottom */}
        <div className="sidebar-bottom">
          <button className="sidebar-nav-item buy-credit-link" onClick={() => changeTab('buy')}>
            <CreditCard size={16} /> Buy Credits
          </button>
          <button className="sidebar-logout" onClick={handleLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <div className="dash-main">
        {/* Top bar */}
        <div className="dash-topbar">
          <span className="dash-topbar-title">{PAGE_TITLES[tab]}</span>
          <div className="dash-topbar-actions">
            {msg.text && (
              <span style={{
                fontSize: 'var(--font-sm)', fontWeight: 600, padding: '4px 12px',
                borderRadius: '99px',
                background: msg.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
                color: msg.type === 'success' ? 'var(--success)' : 'var(--danger)',
              }}>
                {msg.text}
              </span>
            )}
            {tab !== 'buy' && (
              <Button size="sm" variant="outline" onClick={() => changeTab('buy')}>
                <CreditCard size={14} /> {creditExpired ? 'Reactivate' : `${profile.total_credits} credits · ${daysLeft}d left`}
              </Button>
            )}
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="dash-content">

          {/* Overview */}
          {tab === 'overview' && (
            <div className="animate-fade-up">
              <div className="overview-welcome">
                <h2>Welcome, {profile.school_name} 👋</h2>
              </div>

              <div className="overview-stats">
                <div className="ov-stat-card blue">
                  <div className="ov-stat-icon"><Users2 size={20} /></div>
                  <div className="ov-stat-label">Parents</div>
                  <div className="ov-stat-value">{overviewStats.parents}</div>
                  <div className="ov-stat-sub">Registered guardians</div>
                </div>
                <div className="ov-stat-card green">
                  <div className="ov-stat-icon"><GraduationCap size={20} /></div>
                  <div className="ov-stat-label">Students</div>
                  <div className="ov-stat-value">{overviewStats.students}</div>
                  <div className="ov-stat-sub">Enrolled students</div>
                </div>
                <div className="ov-stat-card purple">
                  <div className="ov-stat-icon"><BookOpen size={20} /></div>
                  <div className="ov-stat-label">Classes</div>
                  <div className="ov-stat-value">{overviewStats.classes}</div>
                  <div className="ov-stat-sub">Active classes</div>
                </div>
              </div>

              {/* Quick Actions - Hero Section */}
              <div className="overview-hero-actions">
                <h3 className="overview-hero-title">Quick Actions</h3>
                <div className="hero-actions">
                  <button className="hero-action-btn purple" onClick={() => changeTab('people-parents')}>
                    <div className="hero-action-icon"><Users2 size={28} /></div>
                    <div className="hero-action-content">
                      <span className="hero-action-label">Add Parent</span>
                      <span className="hero-action-sub">Register a guardian</span>
                    </div>
                  </button>
                  <button className="hero-action-btn blue" onClick={() => changeTab('people-students')}>
                    <div className="hero-action-icon"><GraduationCap size={28} /></div>
                    <div className="hero-action-content">
                      <span className="hero-action-label">Add Student</span>
                      <span className="hero-action-sub">Enroll a student</span>
                    </div>
                  </button>
                  <button className="hero-action-btn rose" onClick={() => changeTab('fees-payment')}>
                    <div className="hero-action-icon"><Receipt size={28} /></div>
                    <div className="hero-action-content">
                      <span className="hero-action-label">Collect Fee</span>
                      <span className="hero-action-sub">Record a payment</span>
                    </div>
                  </button>
                  <button className="hero-action-btn cyan" onClick={() => changeTab('finances-income')}>
                    <div className="hero-action-icon"><DollarSign size={28} /></div>
                    <div className="hero-action-content">
                      <span className="hero-action-label">Record Income</span>
                      <span className="hero-action-sub">Log other income</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Feature tabs */}
          {tab === 'fee-stats' && (
            <Suspense fallback={<ManagerFallback />}>
              <FeeStatsManager 
                schoolId={profile.id} 
                onAction={(pid, targetTab) => {
                  setFocusedParentId(pid);
                  if (targetTab === 'print' as any) {
                    setShowPrinterOverlay(true);
                  } else {
                    changeTab(targetTab as any);
                  }
                }}
              />
            </Suspense>
          )}
          {tab === 'classes' && <Suspense fallback={<ManagerFallback />}><ClassesManager schoolId={profile.id} role={role || undefined} /></Suspense>}
          {tab === 'people-parents' && (
            <Suspense fallback={<ManagerFallback />}>
              <ParentsManager 
                schoolId={profile.id} 
                role={role || undefined} 
                initialViewParentId={focusedParentId || undefined}
                onClearInitialParent={() => setFocusedParentId(null)}
              />
            </Suspense>
          )}
          {tab === 'people-students' && <Suspense fallback={<ManagerFallback />}><StudentsManager schoolId={profile.id} role={role || undefined} /></Suspense>}
          {tab === 'people-teachers' && <Suspense fallback={<ManagerFallback />}><TeachersManager schoolId={profile.id} role={role || undefined} /></Suspense>}
          {tab === 'people-archive' && (
            <Suspense fallback={<ManagerFallback />}>
              <ArchiveManager schoolId={profile.id} role={role || undefined} />
            </Suspense>
          )}
          {tab === 'finances-income' && <Suspense fallback={<ManagerFallback />}><IncomeManager schoolId={profile.id} role={role || undefined} /></Suspense>}
          {tab === 'finances-expense' && <Suspense fallback={<ManagerFallback />}><ExpenseManager schoolId={profile.id} role={role || undefined} /></Suspense>}
          {tab === 'finances-suppliers' && <Suspense fallback={<ManagerFallback />}><SuppliersManager schoolId={profile.id} role={role || undefined} /></Suspense>}
          {tab === 'finances-extra-fees' && <Suspense fallback={<ManagerFallback />}><ExtraFeeCollectionManager schoolId={profile.id} /></Suspense>}
          {tab === 'finances-custom-receipt' && <Suspense fallback={<ManagerFallback />}><CustomReceiptManager schoolId={profile.id} /></Suspense>}
          {tab === 'team' && <Suspense fallback={<ManagerFallback />}><TeamManager schoolId={profile.id} /></Suspense>}
          {tab === 'profile' && <Suspense fallback={<ManagerFallback />}><SchoolProfileManager schoolId={profile.id} role={role || undefined} /></Suspense>}
          {tab === 'extra-fees' && <Suspense fallback={<ManagerFallback />}><ExtraFeesManager schoolId={profile.id} role={role || undefined} /></Suspense>}
          {tab === 'fees-view' && (
            <Suspense fallback={<ManagerFallback />}>
              <LedgerManager 
                schoolId={profile.id} 
                initialParentId={focusedParentId || undefined}
                onPrintReceipt={(pid) => {
                  setActivePaymentId(pid);
                  setShowReceiptOverlay(true);
                }}
              />
            </Suspense>
          )}
          {tab === 'fees-payment' && (
            <Suspense fallback={<ManagerFallback />}>
              <PaymentPortalV2 
                schoolId={profile.id} 
                initialParentId={focusedParentId || undefined} 
                onPrintReceipt={(pid) => {
                  setActivePaymentId(pid);
                  setShowReceiptOverlay(true);
                }}
              />
            </Suspense>
          )}
          {tab === 'fees-generate' && <Suspense fallback={<ManagerFallback />}><FeeGenerationManager schoolId={profile.id} /></Suspense>}
          {tab === 'fees-missing' && <Suspense fallback={<ManagerFallback />}><MissingFeeManager schoolId={profile.id} /></Suspense>}
          {tab === 'exams-terms' && <Suspense fallback={<ManagerFallback />}><ExamManager schoolId={profile.id} /></Suspense>}
          {tab === 'exams-promotion' && <Suspense fallback={<ManagerFallback />}><StudentPromotion schoolId={profile.id} /></Suspense>}
          {tab === 'exams-results' && <Suspense fallback={<ManagerFallback />}><ExamResultsManager schoolId={profile.id} /></Suspense>}
          {tab === 'exams-results-cards' && <Suspense fallback={<ManagerFallback />}><ResultCardManager schoolId={profile.id} /></Suspense>}

          {/* Buy Credits */}
          {tab === 'buy' && (
            <div className="buy-section animate-fade-up">
              {creditExpired && (
                <div className="alert-banner">
                  <AlertTriangle size={22} />
                  <div>
                    <strong>Account Suspended</strong>
                    <p>Your credits have expired. Purchase a plan below to reactivate your account.</p>
                  </div>
                </div>
              )}

              <div className="pricing-grid">
                {[
                  { credits: 30, pkr: 2000, name: 'Monthly Plan', popular: false },
                  { credits: 100, pkr: 5000, name: 'Quarterly+ Plan', popular: true },
                ].map(p => (
                  <div
                    key={p.credits}
                    className={`pricing-card${plan?.credits === p.credits ? ' selected' : ''}`}
                    onClick={() => setPlan({ credits: p.credits, pkr: p.pkr })}
                  >
                    {p.popular && <div className="popular-badge">Best Value</div>}
                    <div className="plan-name">{p.name}</div>
                    <div className="plan-price">Rs {p.pkr.toLocaleString()}</div>
                    <div className="plan-credits">{p.credits} Credits</div>
                    <div className="plan-duration">{p.credits} days access</div>
                    <div className="plan-check" />
                  </div>
                ))}
              </div>

              {plan && (
                <div className="checkout-card animate-fade-up">
                  <h3>Complete Your Purchase</h3>
                  <table className="summary-table">
                    <tbody>
                      <tr><td>Plan</td><td>{plan.credits} Credits ({plan.credits} days)</td></tr>
                      <tr><td>Total</td><td>Rs {plan.pkr.toLocaleString()}</td></tr>
                    </tbody>
                  </table>

                  <div className="pay-method-row">
                    <button className={`pay-method-btn${payMethod === 'JazzCash' ? ' active' : ''}`} onClick={() => setPayMethod('JazzCash')}>JazzCash</button>
                    <button className={`pay-method-btn${payMethod === 'Bank' ? ' active' : ''}`} onClick={() => setPayMethod('Bank')}>Bank Transfer</button>
                  </div>

                  <div className="pay-instructions">
                    Send <strong>Rs {plan.pkr.toLocaleString()}</strong> via{' '}
                    {payMethod === 'JazzCash'
                      ? <><strong>JazzCash to {adminSettings?.jazzcash_number || '0300-1234567'}</strong> ({adminSettings?.jazzcash_name || 'ilmsoft'})</>
                      : <><strong>{adminSettings?.bank_name || 'Meezan Bank'} — IBAN: {adminSettings?.bank_iban || 'PK12MEZN000123456789'}</strong> ({adminSettings?.bank_account_title || 'ilmsoft'})</>
                    }
                    <br />After payment, enter your transaction reference number below.
                  </div>

                  <form onSubmit={handleBuy} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <Input
                      label="Transaction Reference Number"
                      placeholder="e.g. TXN-123456 or JazzCash ID"
                      value={reference}
                      onChange={e => setReference(e.target.value)}
                      required
                    />
                    <Button type="submit" size="lg" fullWidth isLoading={buying}>
                      <Banknote size={18} /> Submit Payment Request
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* History */}
          {tab === 'history' && (
            <div className="animate-fade-up">
              {history.length === 0 ? (
                <div className="section-empty">
                  <HistoryIcon size={48} />
                  <p>No payment history yet</p>
                </div>
              ) : (
                <div className="history-card">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th><th>Plan</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(item => (
                          <tr key={item.id}>
                            <td>{new Date(item.created_at).toLocaleDateString('en-PK')}</td>
                            <td>{item.credits} Credits</td>
                            <td style={{ fontWeight: 600 }}>Rs {item.amount_pkr.toLocaleString()}</td>
                            <td>{item.payment_method}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>{item.payment_reference}</td>
                            <td>
                              <div className="status-cell">
                                {item.status === 'approved' ? <CheckCircle size={14} color="var(--success)" /> : item.status === 'rejected' ? <XCircle size={14} color="var(--danger)" /> : <Clock size={14} color="var(--warning)" />}
                                <span className={`status-pill ${item.status}`}>{item.status}</span>
                              </div>
                              {item.status === 'rejected' && item.admin_notes && (
                                <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '4px', fontStyle: 'italic' }}>
                                  Reason: {item.admin_notes}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>


      {/* Overlays */}
      {showPrinterOverlay && profile && (
        <InvoicePrinter 
          schoolId={profile.id}
          month={currentMonthStr()}
          onClose={() => setShowPrinterOverlay(false)}
          parentId={focusedParentId || undefined}
        />
      )}

      {showReceiptOverlay && profile && activePaymentId && (
        <PaymentReceipt 
          schoolId={profile.id}
          paymentId={activePaymentId}
          onClose={() => {
            setShowReceiptOverlay(false);
            setActivePaymentId(null);
          }}
        />
      )}
    </div>
  );
};
