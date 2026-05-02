import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, Calendar, Clock, Search, Users, AlertCircle, X,
} from 'lucide-react';
import './FeeStatsManager.css';

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

type ClassBreakdownItem = {
  classId: string;
  className: string;
  expected: number;
  collected: number;
};

type ParentDuesRow = {
  id: string;
  name: string;
  contact: string;
  childrenCount: number;
  balance: number;
};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS (mirrors FeeManager logic)
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   HELPERS (Ledger System Logic)
   ═══════════════════════════════════════════════════════════════════ */

function N(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function formatPKR(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `Rs ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `Rs ${(n / 1_000).toFixed(1)}K`;
  return `Rs ${Math.round(n).toLocaleString()}`;
}

/* ═══════════════════════════════════════════════════════════════════
   SVG BAR CHART
   ═══════════════════════════════════════════════════════════════════ */

const BAR_CHART_H = 180;
const BAR_GAP = 12;
const GROUP_GAP = 28;
const BAR_W = 28;

const ClassBarChart = ({ data }: { data: ClassBreakdownItem[] }) => {
  if (!data.length) return (
    <div className="fss-chart-empty">
      <AlertCircle size={32} />
      <p>No class data available for this month</p>
    </div>
  );

  const maxVal = Math.max(...data.map(d => Math.max(d.expected, d.collected)), 1);
  const groupW = BAR_W * 2 + BAR_GAP + GROUP_GAP;
  const svgW = Math.max(800, data.length * groupW + GROUP_GAP);

  const yLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="fss-chart-scroll">
      <svg
        width={svgW}
        height={BAR_CHART_H + 60}
        className="fss-chart-svg"
        aria-label="Class-wise fee collection chart"
      >
        {/* Y-axis guide lines */}
        {yLines.map(frac => {
          const y = 8 + (1 - frac) * BAR_CHART_H;
          return (
            <g key={frac}>
              <line x1={0} y1={y} x2={svgW} y2={y} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 3" />
              <text x={2} y={y - 3} fontSize={9} fill="var(--text-muted)">
                {frac === 0 ? '' : formatPKR(maxVal * frac)}
              </text>
            </g>
          );
        })}

        {data.map((item, i) => {
          const x = GROUP_GAP / 2 + i * groupW;
          const expH = Math.max(2, (item.expected / maxVal) * BAR_CHART_H);
          const colH = Math.max(2, (item.collected / maxVal) * BAR_CHART_H);
          const expY = 8 + BAR_CHART_H - expH;
          const colY = 8 + BAR_CHART_H - colH;
          const labelX = x + BAR_W + BAR_GAP / 2;

          return (
            <g key={item.classId}>
              {/* Expected bar */}
              <rect
                x={x}
                y={expY}
                width={BAR_W}
                height={expH}
                rx={5}
                className="fss-bar-expected"
              />
              {/* Collected bar */}
              <rect
                x={x + BAR_W + BAR_GAP}
                y={colY}
                width={BAR_W}
                height={colH}
                rx={5}
                className="fss-bar-collected"
              />
              {/* Class label */}
              <text
                x={labelX}
                y={8 + BAR_CHART_H + 16}
                fontSize={10}
                textAnchor="middle"
                fill="var(--text-muted)"
                className="fss-bar-label"
              >
                {item.className.length > 10 ? item.className.slice(0, 9) + '…' : item.className}
              </text>
              {/* Value labels */}
              {item.expected > 0 && (
                <text x={x + BAR_W / 2} y={expY - 4} fontSize={9} textAnchor="middle" fill="var(--text-muted)">
                  {formatPKR(item.expected)}
                </text>
              )}
              {item.collected > 0 && (
                <text x={x + BAR_W + BAR_GAP + BAR_W / 2} y={colY - 4} fontSize={9} textAnchor="middle" fill="var(--text-muted)">
                  {formatPKR(item.collected)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="fss-chart-legend">
        <span className="fss-legend-item expected"><span className="fss-legend-dot expected" />Expected (Billed)</span>
        <span className="fss-legend-item collected"><span className="fss-legend-dot collected" />Collected</span>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export const FeeStatsManager = ({ 
  schoolId, 
  onAction 
}: { 
  schoolId: string; 
  onAction: (parentId: string, tab: 'fees-payment' | 'fees-view' | 'print') => void 
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // KPI state
  const [expectedMonthly, setExpectedMonthly] = useState(0);
  const [receivedThisMonth, setReceivedThisMonth] = useState(0);
  const [collectedToday, setCollectedToday] = useState(0);

  // Chart
  const [classBreakdown, setClassBreakdown] = useState<ClassBreakdownItem[]>([]);

  // Dues search
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const cm = useMemo(() => currentMonthStr(), []);
  const today = useMemo(() => todayStr(), []);

  /* ── fetch all data using New System tables ──────────────────────── */
  const loadStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [feesRes, ledgerRes, classesRes, balancesRes] = await Promise.all([
        // 1. Current Month Generated Fees
        supabase
          .from('student_monthly_fees')
          .select('net_amount, class_id, parent_id')
          .eq('school_id', schoolId)
          .eq('month', cm),
        
        // 2. All Ledger Payments (this month and today)
        supabase
          .from('ledger')
          .select('parent_id, amount, reference_type, created_at, month')
          .eq('school_id', schoolId)
          .eq('reference_type', 'payment'),

        // 3. Classes info for labeling
        supabase
          .from('classes')
          .select('id, name')
          .eq('school_id', schoolId),
        
        // 4. Current Parent Balances (Dues)
        supabase
          .from('parent_balances')
          .select(`
            parent_id,
            balance,
            parents:parent_id(first_name, last_name, contact)
          `)
          .eq('school_id', schoolId)
      ]);

      const monthlyFees = feesRes.data || [];
      const ledgerPayments = ledgerRes.data || [];
      const classes = classesRes.data || [];
      const parentBalances = balancesRes.data || [];

      /* ── Class Map ── */
      const classMap = new Map<string, string>();
      classes.forEach((c: any) => classMap.set(c.id, c.name));

      /* ── KPI: Expected Monthly (Sum of net_amount generated for this month) ── */
      const expTotal = monthlyFees.reduce((sum, f) => sum + N(f.net_amount), 0);
      setExpectedMonthly(expTotal);

      /* ── KPI: Received This Month ── */
      // Ledger payments recorded in this calendar month OR tagged with this month
      const [currYear, currMonth] = cm.split('-');
      const thisMonthLedger = ledgerPayments.filter(l => {
        if (l.month === cm) return true;
        const created = new Date(l.created_at);
        return created.getFullYear() === Number(currYear) && (created.getMonth() + 1) === Number(currMonth);
      });
      const receivedTotal = thisMonthLedger.reduce((sum, l) => sum + N(l.amount), 0);
      setReceivedThisMonth(receivedTotal);

      /* ── KPI: Collected Today ── */
      const todayLedger = ledgerPayments.filter(l => l.created_at.startsWith(today));
      setCollectedToday(todayLedger.reduce((sum, l) => sum + N(l.amount), 0));

      /* ── Class-wise Breakdown ── */
      const classStats = new Map<string, { expected: number; collected: number }>();
      
      // Expected per class
      monthlyFees.forEach(f => {
        if (!classStats.has(f.class_id)) classStats.set(f.class_id, { expected: 0, collected: 0 });
        classStats.get(f.class_id)!.expected += N(f.net_amount);
      });

      // Distribution of payments across classes
      // We'll distribute payments proportional to the fees generated this month for each parent's students
      // (This is a simplified approach useful for high-level stats)
      const parentClassDistribution = new Map<string, Map<string, number>>();
      monthlyFees.forEach(f => {
        if (!parentClassDistribution.has(f.parent_id)) parentClassDistribution.set(f.parent_id, new Map());
        const pMap = parentClassDistribution.get(f.parent_id)!;
        pMap.set(f.class_id, (pMap.get(f.class_id) || 0) + N(f.net_amount));
      });

      thisMonthLedger.forEach(p => {
        const pDistribution = parentClassDistribution.get(p.parent_id);
        if (!pDistribution) return;

        const pTotalExpected = Array.from(pDistribution.values()).reduce((s, v) => s + v, 0);
        if (pTotalExpected === 0) return;

        pDistribution.forEach((amount, cid) => {
          if (!classStats.has(cid)) classStats.set(cid, { expected: 0, collected: 0 });
          const share = (amount / pTotalExpected) * N(p.amount);
          classStats.get(cid)!.collected += share;
        });
      });

      const breakdown: ClassBreakdownItem[] = Array.from(classStats.entries()).map(([cid, stats]) => ({
        classId: cid,
        className: classMap.get(cid) || 'Unknown',
        expected: Math.round(stats.expected),
        collected: Math.round(stats.collected)
      })).sort((a, b) => b.expected - a.expected);

      setClassBreakdown(breakdown);

      /* ── Outstanding Dues ── */
      const duesRows: ParentDuesRow[] = parentBalances
        .map((b: any) => {
          const p = b.parents;
          // In our ledger, balance < 0 means dues. We convert to positive for display.
          const outstanding = -N(b.balance); 
          return {
            id: b.parent_id,
            name: `${p.first_name} ${p.last_name}`,
            contact: p.contact || '—',
            childrenCount: 0, // Not easily available in one join, keep 0 or extend query
            balance: Math.round(outstanding)
          };
        })
        .filter(r => r.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      setAllParentDues(duesRows);

    } catch (err: any) {
      setError('Failed to load fee statistics: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolId, cm, today]);

  useEffect(() => { loadStats(); }, [loadStats]);

  /* ── filtered dues ── */
  const filteredDues = useMemo(() => {
    if (!searchTerm.trim()) return allParentDues;

    const lowerSearch = searchTerm.toLowerCase();
    const threshold = parseFloat(searchTerm);
    const isNumeric = !isNaN(threshold) && /^\d+$/.test(searchTerm.trim());

    return allParentDues.filter(r => {
      // 1. Check name match
      const nameMatch = r.name.toLowerCase().includes(lowerSearch);
      // 2. Check contact match
      const contactMatch = r.contact.toLowerCase().includes(lowerSearch);
      // 3. If numeric, check if balance >= threshold
      const balanceMatch = isNumeric && r.balance >= threshold;

      return nameMatch || contactMatch || balanceMatch;
    });
  }, [allParentDues, searchTerm]);

  /* ── collection rate ── */
  const collectionRate = expectedMonthly > 0
    ? Math.min(100, Math.round((receivedThisMonth / expectedMonthly) * 100))
    : 0;

  if (loading) return (
    <div className="fss-loading">
      <div className="spinner" />
      <span>Calculating statistics from ledger…</span>
    </div>
  );

  if (error) return (
    <div className="fss-error">
      <AlertCircle size={32} />
      <p>{error}</p>
      <button className="fss-retry-btn" onClick={loadStats}>Retry</button>
    </div>
  );

  return (
    <div className="fss-shell animate-fade-up">
      <div className="fss-section-header">
        <div>
          <h2 className="fss-section-title">Financial Insights</h2>
          <p className="fss-section-sub">
            {new Date().toLocaleString('en-PK', { month: 'long', year: 'numeric' })} — Source: Ledger v2
          </p>
        </div>
        <button className="fss-refresh-btn" onClick={loadStats}>
          <TrendingUp size={16} /> Refresh
        </button>
      </div>

      <div className="fss-kpi-grid">
        <div className="fss-kpi-card amber">
          <div className="fss-kpi-icon"><TrendingUp size={20} /></div>
          <div className="fss-kpi-body">
            <div className="fss-kpi-label">Billed This Month</div>
            <div className="fss-kpi-value">{formatPKR(expectedMonthly)}</div>
            <div className="fss-kpi-sub">Sum of all generated student fees</div>
          </div>
        </div>

        <div className="fss-kpi-card green">
          <div className="fss-kpi-icon"><Calendar size={20} /></div>
          <div className="fss-kpi-body">
            <div className="fss-kpi-label">Payments Received</div>
            <div className="fss-kpi-value">{formatPKR(receivedThisMonth)}</div>
            <div className="fss-kpi-sub">
              <span className={`fss-rate-badge ${collectionRate >= 75 ? 'good' : collectionRate >= 40 ? 'warn' : 'bad'}`}>
                {collectionRate}% of monthly bill collected
              </span>
            </div>
          </div>
        </div>

        <div className="fss-kpi-card blue">
          <div className="fss-kpi-icon"><Clock size={20} /></div>
          <div className="fss-kpi-body">
            <div className="fss-kpi-label">Collected Today</div>
            <div className="fss-kpi-value">{formatPKR(collectedToday)}</div>
            <div className="fss-kpi-sub">New payments recorded today</div>
          </div>
        </div>
      </div>

      <div className="fss-card">
        <div className="fss-card-header">
          <h3 className="fss-card-title">Class-wise Performance</h3>
          <span className="fss-card-sub">Billed vs Collected (Proportional Distribution)</span>
        </div>
        <ClassBarChart data={classBreakdown} />
      </div>

      <div className="fss-card">
        <div className="fss-card-header">
          <h3 className="fss-card-title">Outstanding Arrears</h3>
          <span className="fss-card-sub">Filter parents by their total standing dues</span>
        </div>

        <div className="fss-dues-search-row">
          <div className="fss-dues-search-box" onClick={() => searchInputRef.current?.focus()}>
            <Search size={16} />
            <input
              ref={searchInputRef}
              type="text"
              inputMode="text"
              placeholder="Search by name or min. dues (e.g. 5000)"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                className="fss-dues-clear" 
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm('');
                  searchInputRef.current?.focus();
                }}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="fss-dues-count">
            <Users size={14} /> {filteredDues.length} Parents Found
          </div>
        </div>

        {filteredDues.length === 0 ? (
          <div className="fss-dues-empty">
            <p>No parents found matching "{searchTerm}"</p>
          </div>
        ) : (
          <div className="fss-dues-table-wrap">
            <table className="fss-dues-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Parent</th>
                  <th>Contact</th>
                  <th>Standing Dues</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDues.map((row: any, idx: number) => (
                  <tr key={row.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <div className="fss-parent-cell">
                        <div className="fss-parent-avatar">{row.name.charAt(0)}</div>
                        <span>{row.name}</span>
                      </div>
                    </td>
                    <td>{row.contact}</td>
                    <td>
                      <span className={`fss-dues-amount ${row.balance >= 10000 ? 'high' : 'low'}`}>
                        {formatPKR(row.balance)}
                      </span>
                    </td>
                    <td>
                      <div className="fss-actions">
                        <button 
                          className="fss-action-btn collect"
                          onClick={() => onAction(row.id, 'fees-payment')}
                          title="Collect Payment"
                        >
                          Collect
                        </button>
                        <button 
                          className="fss-action-btn view"
                          onClick={() => onAction(row.id, 'fees-view')}
                          title="View Statement"
                        >
                          View Invoice
                        </button>
                        <button 
                          className="fss-action-btn print"
                          onClick={() => onAction(row.id, 'print')}
                          title="Print Invoice"
                        >
                          Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
