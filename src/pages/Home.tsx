import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import {
  LayoutGrid, GraduationCap, TrendingUp, Receipt, Store,
  UsersRound, CheckCircle, ArrowRight, Sparkles
} from 'lucide-react';
import './Home.css';

const features = [
  { icon: UsersRound,    color: 'rose',   title: 'Who owes, in red',          desc: 'Families with dues show in red with the amount, on every list. No register to search, no receipt book to check.' },
  { icon: LayoutGrid,    color: 'blue',   title: 'One fee rule',              desc: 'Class fee minus the child\'s discount. Raise a class fee and every child in it is billed the new amount next month.' },
  { icon: Receipt,       color: 'green',  title: 'Receipts and statements',   desc: 'Print the receipt at the desk. Reprint any receipt or family statement any time; nothing is ever lost.' },
  { icon: TrendingUp,    color: 'cyan',   title: 'The month at a glance',     desc: 'Billed this month, received, collected today, total receivables. One screen, every morning.' },
  { icon: Store,         color: 'amber',  title: 'Income, expenses, suppliers', desc: 'Book sales, canteen, bills and vendor accounts in the same place as fees, so the month\'s picture is complete.' },
  { icon: GraduationCap, color: 'purple', title: 'Exams and result cards',    desc: 'Terms, marks entry and printable result cards in your school\'s colours.' },
];

export const Home = () => {
  return (
    <div className="home-page">
      {/* Hero */}
      <section className="hero-section" aria-labelledby="hero-heading">
        <div className="hero-left animate-fade-up">
          <div className="hero-eyebrow">
            <Sparkles size={14} fill="currentColor" /> For schools of 50 to 500 students
          </div>
          <h1 id="hero-heading" className="hero-title">
            Fee collection for<br /><span>small schools.</span>
          </h1>
          <p className="hero-subtitle">
            Know who has paid, who owes, and how the month is going.
            From your phone. No spreadsheet, no accountant.
          </p>
          <div className="hero-cta">
            <Link to="/signup">
              <Button size="lg">
                Start your school <ArrowRight size={18} />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="secondary">Sign in</Button>
            </Link>
          </div>
          <div className="hero-stats">
            <div className="hero-stat"><strong>Rs 2,000</strong><span>a month, any size</span></div>
            <div className="hero-stat"><strong>One ledger</strong><span>every rupee once</span></div>
            <div className="hero-stat"><strong>Free</strong><span>to self-host, MIT</span></div>
          </div>
        </div>

        {/* Dashboard preview: abstract UI mockup, no data */}
        <div className="hero-visual animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="preview-browser-bar">
            <div className="preview-dots">
              <span /><span /><span />
            </div>
            <div className="preview-url">ilmsoft.netlify.app/dashboard</div>
          </div>

          <div className="preview-body">
            <div className="preview-sidebar">
              <div className="preview-sidebar-logo">
                <GraduationCap size={12} />
                <span>ilm<em>soft</em></span>
              </div>
              {['Fee Stats', 'Parents', 'Students', 'Receive Payment', 'Ledger', 'Income', 'Expenses'].map((label, i) => (
                <div key={label} className={`preview-sidebar-item${i === 0 ? ' active' : ''}`}>
                  {label}
                </div>
              ))}
            </div>

            <div className="preview-content">
              <div className="preview-content-bar">
                <div className="preview-skeleton-text title" />
                <div className="preview-skeleton-text subtitle" />
              </div>

              <div className="preview-stat-row">
                {[
                  { label: 'Billed', color: 'blue' },
                  { label: 'Received', color: 'green' },
                  { label: 'Receivables', color: 'purple' },
                ].map(s => (
                  <div key={s.label} className={`preview-stat-block ${s.color}`}>
                    <div className="preview-stat-block-label">{s.label}</div>
                    <div className="preview-stat-block-bar" />
                  </div>
                ))}
              </div>

              <div className="preview-table-area">
                <div className="preview-table-label">Who still owes</div>
                <div className="preview-table-rows">
                  {['Collect fee', 'Print receipt', 'View statement'].map(row => (
                    <div key={row} className="preview-table-row">
                      <div className="preview-skeleton-dot" />
                      <div className="preview-skeleton-text short" />
                      <div className="preview-skeleton-text shorter" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features-section" aria-label="What you get">
        <div className="features-inner">
          <h2 className="features-title">Everything a small school needs. Nothing it doesn't.</h2>
          <p className="features-sub">Built with a principal, used every school day.</p>
          <div className="features-grid">
            {features.map(f => (
              <article key={f.title} className="feature-card">
                <div className={`feature-icon ${f.color}`}><f.icon size={24} /></div>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <h2>Try it with your own school this month.</h2>
        <p>Rs 2,000 for 30 days, the same price for 50 students or 500. Pay by JazzCash or bank transfer. If you stop, nothing is deleted.</p>
        <div className="cta-btns">
          <Link to="/signup">
            <Button size="lg">
              <CheckCircle size={20} /> Start your school
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="secondary">Sign in</Button>
          </Link>
        </div>
      </section>
    </div>
  );
};
