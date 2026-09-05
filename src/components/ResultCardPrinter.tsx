import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Printer, X, Loader2 } from 'lucide-react';

interface ResultCardPrinterProps {
  schoolId: string;
  termId: string;
  classId: string;
  studentIds: string[];
  onClose: () => void;
}

export const ResultCardPrinter: React.FC<ResultCardPrinterProps> = ({
  termId, classId, studentIds, onClose
}) => {
  // School name, logo and brand colours are already in the signed-in profile; no extra query.
  const { profile } = useAuth();
  const school = {
    name: profile?.school_name || '',
    logo: profile?.logo_url || '',
    primary: profile?.primary_color || '#1a237e',
    secondary: profile?.secondary_color || '#947029',
    tertiary: profile?.tertiary_color || '#f1f5f9',
  };
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [term, setTerm] = useState<any>(null);
  const [className, setClassName] = useState('');

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [termRes, classRes, configRes, studentsRes, resultsRes] = await Promise.all([
        supabase.from('exam_terms').select('id, name, academic_year').eq('id', termId).single(),
        supabase.from('classes').select('name, subjects').eq('id', classId).single(),
        supabase.from('exam_term_configs').select('subject_totals').eq('exam_term_id', termId).eq('class_id', classId).maybeSingle(),
        supabase.from('students').select('id, first_name, last_name, registration_number, gender').in('id', studentIds),
        supabase.from('exam_results').select('student_id, subject_marks').eq('exam_term_id', termId).in('student_id', studentIds),
      ]);

      if (termRes.data) setTerm(termRes.data);
      if (classRes.data) setClassName(classRes.data.name);

      const subjects = classRes.data?.subjects || [];

      const totalMarksConfig = configRes.data?.subject_totals || {};

      const students = studentsRes.data || [];
      const results = resultsRes.data || [];

      const reports = students.map(student => {
        const studentResult = results.find(r => r.student_id === student.id);
        const marks = studentResult?.subject_marks || {};
        
        let totalObtained = 0;
        let totalMax = 0;

        const subjectRows = subjects.map((sub: string) => {
          const obtained = marks[sub] !== undefined ? marks[sub] : '-';
          const max = totalMarksConfig[sub] || 100;
          
          if (typeof obtained === 'number') {
            totalObtained += obtained;
            totalMax += max;
          }

          return {
            name: sub,
            obtained,
            max,
            percentage: typeof obtained === 'number' ? ((obtained / max) * 100).toFixed(1) : '-'
          };
        });

        return {
          student,
          subjects: subjectRows,
          totalObtained,
          totalMax,
          percentage: totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : '0'
        };
      });

      setReportData(reports);

    } catch (err) {
      console.error('Error loading result card data:', err);
    } finally {
      setLoading(false);
    }
  }, [termId, classId, studentIds]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  if (loading) return createPortal(
    <div className="receipt-print-overlay printer-preview-theme" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, zIndex: 99999 }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <Loader2 className="spin" size={48} style={{ marginBottom: '1rem', margin: '0 auto' }} />
        <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>Applying Custom Branding...</div>
      </div>
    </div>,
    document.body
  );

  return createPortal(
    <div className="receipt-print-overlay printer-preview-theme" style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#1e293b', overflowY: 'auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Inter:wght@300;400;600;800&family=Marcellus&display=swap');

        .printer-preview-theme {
          background: #1e293b !important;
          --school-primary: ${school.primary};
          --school-secondary: ${school.secondary};
          --school-tertiary: ${school.tertiary};
        }

        .result-card-page {
          width: 210mm;
          height: 297mm;
          margin: 20px auto;
          background: white !important;
          color: #0f172a !important;
          padding: 12mm 15mm;
          box-shadow: 0 0 50px rgba(0,0,0,0.4);
          position: relative;
          box-sizing: border-box;
          page-break-after: always;
          font-family: 'Inter', sans-serif;
          overflow: hidden;
        }

        .result-card-page-border {
          position: absolute;
          top: 8mm;
          left: 8mm;
          right: 8mm;
          bottom: 8mm;
          border: 2px solid var(--school-primary);
          pointer-events: none;
          z-index: 10;
        }

        .result-card-page-border::after {
          content: '';
          position: absolute;
          top: 1mm;
          left: 1mm;
          right: 1mm;
          bottom: 1mm;
          border: 0.5px solid var(--school-secondary);
        }

        .watermark-overlay {
          position: absolute;
          inset: 0;
          opacity: 0.06;
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0 L60 30 L30 60 L0 30 Z' fill='none' stroke='%23${school.primary.replace('#', '')}' stroke-width='0.5'/%3E%3C/svg%3E");
          background-size: 60px 60px;
          pointer-events: none;
          z-index: 1;
        }

        .report-header {
          text-align: center;
          position: relative;
          z-index: 20;
          margin-bottom: 20px;
        }

        .school-name {
          font-family: 'Cinzel', serif;
          font-weight: 900;
          font-size: 2.2rem;
          color: var(--school-primary) !important;
          margin: 0;
          text-transform: uppercase;
        }

        .term-subtitle {
          font-family: 'Marcellus', serif;
          font-size: 1.1rem;
          color: var(--school-secondary) !important;
          margin: 5px 0;
          text-transform: uppercase;
        }

        .report-type-badge {
          display: inline-block;
          border-top: 1px solid var(--school-primary);
          border-bottom: 1px solid var(--school-primary);
          color: var(--school-primary) !important;
          padding: 4px 20px;
          font-size: 0.8rem;
          font-weight: 800;
          margin-top: 10px;
        }

        .student-profile {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-bottom: 25px;
          position: relative;
          z-index: 20;
          padding: 15px;
          background: rgba(248, 250, 252, 0.6);
          border: 1px solid #e2e8f0;
          border-left: 5px solid var(--school-primary);
        }

        .profile-item {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          border-bottom: 1px dotted #cbd5e1;
        }

        .profile-label {
          font-size: 0.7rem;
          font-weight: 800;
          color: #64748b !important;
        }

        .profile-value {
          font-size: 0.9rem;
          font-weight: 700;
          color: #0f172a !important;
        }

        .academic-table {
          width: 100%;
          border-collapse: collapse;
          position: relative;
          z-index: 20;
          margin-bottom: 30px;
        }

        .academic-table th {
          background: var(--school-secondary);
          color: white !important;
          padding: 10px;
          text-align: left;
          font-family: 'Cinzel', serif;
          font-size: 0.75rem;
        }

        .academic-table td {
          padding: 8px 10px;
          border: 1px solid #cbd5e1;
        }

        .total-row {
          background: var(--school-tertiary) !important;
        }

        .total-row td {
          font-weight: 800;
          color: var(--school-primary) !important;
          border-top: 2px solid var(--school-primary);
        }

        .footer-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          margin-top: 40px;
          position: relative;
          z-index: 20;
        }

        .sig-box { text-align: center; }
        .sig-line {
          border-top: 1px solid var(--school-secondary);
          margin-top: 35px;
          padding-top: 5px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
        }

        @media print {
          body > *:not(.receipt-print-overlay) { display: none !important; }
          body { background: white !important; }
          .receipt-print-overlay { position: static !important; padding: 0 !important; background: white !important; }
          .result-card-page { margin: 0 !important; box-shadow: none !important; width: 210mm !important; height: 297mm !important; }
          .print-controls { display: none !important; }
          .result-card-page:last-child { page-break-after: avoid !important; }
        }
      `}</style>
      
      <div className="print-controls no-print" style={{ 
          position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)', 
          padding: '1rem', display: 'flex', justifyContent: 'center', gap: '1rem', zIndex: 100 
      }}>
        <Button 
          variant="primary" 
          size="lg" 
          onClick={() => window.print()} 
          style={{ background: school.primary }}
          disabled={!!school.logo && !logoLoaded}
          title={!!school.logo && !logoLoaded ? "Waiting for logo to load..." : ""}
        >
          <Printer size={20} /> Generate Print Layout
        </Button>
        <Button variant="secondary" onClick={onClose}>
          <X size={20} /> Close Preview
        </Button>
      </div>

      <div className="print-content">
        {reportData.map((report, idx) => (
          <div key={idx} className="result-card-page">
            <div className="result-card-page-border" />
            <div className="watermark-overlay" />
            
            <div className="report-header">
               {school.logo && (
                 <img 
                   src={school.logo} 
                   alt="Logo" 
                   style={{ maxHeight: '60px', marginBottom: '10px' }} 
                   crossOrigin="anonymous"
                   onLoad={() => setLogoLoaded(true)}
                   onError={() => setLogoLoaded(true)}
                 />
               )}
               <h1 className="school-name">{school.name}</h1>
               <div className="term-subtitle">{term?.name} ({term?.academic_year})</div>
               <div className="report-type-badge">Official Academic Report</div>
            </div>

            <div className="student-profile">
              <div className="profile-item">
                <span className="profile-label">Student Name:</span>
                <span className="profile-value">{report.student.first_name} {report.student.last_name}</span>
              </div>
              <div className="profile-item">
                <span className="profile-label">Reg. Number:</span>
                <span className="profile-value">{report.student.registration_number}</span>
              </div>
              <div className="profile-item">
                <span className="profile-label">Class / Grade:</span>
                <span className="profile-value">{className}</span>
              </div>
              <div className="profile-item">
                <span className="profile-label">Gender:</span>
                <span className="profile-value">{report.student.gender}</span>
              </div>
            </div>

            <table className="academic-table">
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Subject</th>
                  <th style={{ textAlign: 'center' }}>Max Marks</th>
                  <th style={{ textAlign: 'center' }}>Obtained</th>
                  <th style={{ textAlign: 'center' }}>%age</th>
                </tr>
              </thead>
              <tbody>
                {report.subjects.map((sub: any, sIdx: number) => (
                  <tr key={sIdx}>
                    <td style={{ fontWeight: 600 }}>{sub.name}</td>
                    <td style={{ textAlign: 'center' }}>{sub.max}</td>
                    <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--school-primary)' }}>{sub.obtained}</td>
                    <td style={{ textAlign: 'center' }}>{sub.percentage}%</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td style={{ textTransform: 'uppercase' }}>Consolidated Marks</td>
                  <td style={{ textAlign: 'center' }}>{report.totalMax}</td>
                  <td style={{ textAlign: 'center', fontSize: '1.1rem' }}>{report.totalObtained}</td>
                  <td style={{ textAlign: 'center', fontSize: '1.1rem' }}>{report.percentage}%</td>
                </tr>
              </tbody>
            </table>

            <div style={{ position: 'relative', zIndex: 20 }}>
              <div style={{ fontWeight: 800, fontSize: '0.7rem', color: '#64748b', marginBottom: '5px' }}>TEACHER'S REMARKS</div>
              <div style={{ border: '1px solid #cbd5e1', height: '60px', padding: '10px' }}></div>
            </div>

            <div className="footer-signatures">
              <div className="sig-box">
                <div className="sig-line">Class Teacher</div>
              </div>
              <div className="sig-box">
                <div className="sig-line">School Principal</div>
              </div>
            </div>

            <div style={{ position: 'absolute', bottom: '12mm', left: '15mm', fontSize: '0.6rem', color: '#94a3b8', zIndex: 20 }}>
              Document generated on {new Date().toLocaleDateString()}.
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
};

export default ResultCardPrinter;
