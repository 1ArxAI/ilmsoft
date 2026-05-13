import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import {
  FileText, Save, Loader2, AlertCircle,
  ChevronRight, Database, ArrowLeft
} from 'lucide-react';
import { Button } from './ui/Button';
import './managers.css';
import './ExamResultsSpreadsheet.css';

/* ═══════════════════════════════════════════════════════════════════
   Exam Results Manager Component
   ═══════════════════════════════════════════════════════════════════ */

export default function ExamResultsManager({ schoolId }: { schoolId: string }) {
  const { flash, showFlash } = useFlashMessage(5000);

  // Selection State
  const [terms, setTerms] = useState<any[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>('');
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Data State
  const [subjects, setSubjects] = useState<string[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [totalMarks, setTotalMarks] = useState<Record<string, number>>({});
  const [studentMarks, setStudentMarks] = useState<Record<string, Record<string, number>>>({}); // studentId -> subject -> marks
  const [submissionStats, setSubmissionStats] = useState<any[]>([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1. Initial Load: Fetch all exam terms
  useEffect(() => {
    const fetchTerms = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('exam_terms')
          .select('id, name, academic_year, school_id, class_ids, created_at')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTerms(data || []);
      } catch (err: any) {
        showFlash('Error loading terms: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTerms();
  }, [schoolId]);

  // 2. When Term changes, fetch classes for that term
  useEffect(() => {
    const fetchClasses = async () => {
      if (!selectedTermId) {
        setClasses([]);
        return;
      }

      const term = terms.find(t => t.id === selectedTermId);
      if (!term || !term.class_ids || term.class_ids.length === 0) {
        setClasses([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('classes')
          .select('id, name, school_id, subjects, monthly_fee, active')
          .in('id', term.class_ids)
          .order('name');

        if (error) throw error;
        setClasses(data || []);
      } catch (err: any) {
        showFlash('Error loading classes: ' + err.message);
      }
    };
    fetchClasses();
  }, [selectedTermId, terms]);

  // 2.5 Fetch Submission Statistics for the entire term
  const loadSubmissionStats = useCallback(async () => {
    if (!selectedTermId || selectedClassId) return;

    setStatsLoading(true);
    try {
      const term = terms.find(t => t.id === selectedTermId);
      if (!term || !term.class_ids || term.class_ids.length === 0) {
        setSubmissionStats([]);
        return;
      }

      // Fetch all required data in parallel
      const [studentsRes, resultsRes, classesRes, configsRes] = await Promise.all([
        supabase.from('students').select('id, current_class_id').eq('school_id', schoolId).eq('active', true).in('current_class_id', term.class_ids),
        supabase.from('exam_results').select('id, class_id, student_id, subject_marks').eq('exam_term_id', selectedTermId),
        supabase.from('classes').select('id, name, subjects').in('id', term.class_ids),
        supabase.from('exam_term_configs').select('class_id, subject_totals').eq('exam_term_id', selectedTermId)
      ]);

      if (studentsRes.error) throw studentsRes.error;

      // Group data by class
      const stats = (classesRes.data || []).map(cls => {
        const classStudents = (studentsRes.data || []).filter(s => s.current_class_id === cls.id);
        const classResults = (resultsRes.data || []).filter(r => r.class_id === cls.id);
        const hasConfig = (configsRes.data || []).some(c => c.class_id === cls.id);

        // Count unique students who have at least ONE non-empty mark entered
        const uniqueGradedIds = new Set(
          classResults
            .filter(r => r.subject_marks && Object.values(r.subject_marks).some(m => m !== undefined && m !== null))
            .map(r => r.student_id)
        );
        const gradedCount = uniqueGradedIds.size;

        // Calculate per-subject stats
        const subList = cls.subjects || [];
        const subjectStats = subList.map((sub: string) => {
          const count = classResults.filter((r: any) =>
            r.subject_marks &&
            r.subject_marks[sub] !== undefined &&
            r.subject_marks[sub] !== null
          ).length;
          return {
            name: sub,
            percent: classStudents.length > 0 ? Math.round((count / classStudents.length) * 100) : 0
          };
        });

        return {
          id: cls.id,
          name: cls.name,
          totalStudents: classStudents.length,
          gradedStudents: gradedCount,
          subjectsCount: subList.length,
          subjectStats,
          hasConfig,
          progress: classStudents.length > 0 ? (gradedCount / classStudents.length) * 100 : 0
        };
      });

      setSubmissionStats(stats);
    } catch (err: any) {
      showFlash('Error loading overview: ' + err.message);
    } finally {
      setStatsLoading(false);
    }
  }, [selectedTermId, selectedClassId, schoolId, terms]);

  useEffect(() => {
    loadSubmissionStats();
  }, [loadSubmissionStats]);

  // 3. When Class changes, fetch students, subjects, and existing results
  const loadClassData = useCallback(async () => {
    if (!selectedTermId || !selectedClassId) return;

    setFetchingData(true);
    try {
      // a. Fetch subjects for the class
      const { data: classData, error: classErr } = await supabase
        .from('classes')
        .select('subjects')
        .eq('id', selectedClassId)
        .single();

      if (classErr) throw classErr;
      const classSubjects = classData?.subjects || [];
      setSubjects(classSubjects);

      // b. Fetch active students in the class
      const { data: studentData, error: studErr } = await supabase
        .from('students')
        .select('id, first_name, last_name, registration_number, parent_id')
        .eq('school_id', schoolId)
        .eq('current_class_id', selectedClassId)
        .eq('active', true)
        .order('first_name');

      if (studErr) throw studErr;

      // Fetch parents for these students
      const parentIds = Array.from(new Set((studentData || []).map(s => s.parent_id).filter(Boolean)));
      const parentsMap = new Map();
      if (parentIds.length > 0) {
        const { data: parentData } = await supabase
          .from('parents')
          .select('id, first_name, last_name')
          .in('id', parentIds);
        if (parentData) {
          parentData.forEach(p => {
            parentsMap.set(p.id, `${p.first_name} ${p.last_name}`.trim());
          });
        }
      }

      const studentsWithParents = (studentData || []).map(s => ({
        ...s,
        father_name: s.parent_id ? parentsMap.get(s.parent_id) : ''
      }));

      setStudents(studentsWithParents);

      // c. Fetch existing total marks configuration
      const { data: configData } = await supabase
        .from('exam_term_configs')
        .select('subject_totals')
        .eq('exam_term_id', selectedTermId)
        .eq('class_id', selectedClassId)
        .single();

      if (configData) {
        setTotalMarks(configData.subject_totals || {});
      } else {
        setTotalMarks({});
      }

      // d. Fetch existing results for all students in this class/term
      const { data: resultsData } = await supabase
        .from('exam_results')
        .select('student_id, subject_marks')
        .eq('exam_term_id', selectedTermId)
        .eq('class_id', selectedClassId);

      const resultsMap: Record<string, Record<string, number>> = {};
      (resultsData || []).forEach(r => {
        resultsMap[r.student_id] = r.subject_marks || {};
      });
      setStudentMarks(resultsMap);

    } catch (err: any) {
      showFlash('Error loading data: ' + err.message);
    } finally {
      setFetchingData(false);
    }
  }, [selectedTermId, selectedClassId, schoolId]);

  useEffect(() => {
    loadClassData();
  }, [loadClassData]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleTotalMarkChange = (subject: string, value: string) => {
    const numValue = parseInt(value, 10) || 0;
    setTotalMarks(prev => ({ ...prev, [subject]: numValue }));
  };

  const handleStudentMarkChange = (studentId: string, subject: string, value: string) => {
    const numValue = parseFloat(value) || 0;

    // Optional: clamp to max? Or just let user enter what they want and alert later.
    setStudentMarks(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [subject]: numValue
      }
    }));
  };

  const calculateResult = (studentId: string) => {
    const marks = studentMarks[studentId] || {};
    let obtainedTotal = 0;
    let possibleTotal = 0;

    subjects.forEach(sub => {
      obtainedTotal += marks[sub] || 0;
      possibleTotal += totalMarks[sub] || 0;
    });

    const percentage = possibleTotal > 0 ? (obtainedTotal / possibleTotal) * 100 : 0;
    return { obtainedTotal, possibleTotal, percentage };
  };

  const handleSave = async () => {
    if (!selectedTermId || !selectedClassId) return;

    setSaving(true);
    try {
      // 1. Save Term Configuration (Total Marks)
      const { error: configError } = await supabase
        .from('exam_term_configs')
        .upsert({
          school_id: schoolId,
          exam_term_id: selectedTermId,
          class_id: selectedClassId,
          subject_totals: totalMarks,
          updated_at: new Date().toISOString()
        }, { onConflict: 'exam_term_id,class_id' });

      if (configError) throw configError;

      // 2. Prepare Results ONLY for students who have marks entered
      const resultsToSave = students
        .filter(student => {
          const marks = studentMarks[student.id] || {};
          return Object.values(marks).some(m => m !== undefined && m !== null);
        })
        .map(student => {
          const { obtainedTotal, percentage } = calculateResult(student.id);
          return {
            school_id: schoolId,
            exam_term_id: selectedTermId,
            class_id: selectedClassId,
            student_id: student.id,
            subject_marks: studentMarks[student.id] || {},
            total_obtained: obtainedTotal,
            total_percentage: parseFloat(percentage.toFixed(2)),
            updated_at: new Date().toISOString()
          };
        });

      if (resultsToSave.length > 0) {
        const { error: resultsError } = await supabase
          .from('exam_results')
          .upsert(resultsToSave, { onConflict: 'exam_term_id,student_id' });

        if (resultsError) throw resultsError;
      }

      showFlash('Results saved successfully!');
    } catch (err: any) {
      showFlash('Error saving results: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="manager-loading"><div className="spinner" /><span>Loading Exams…</span></div>;

  return (
    <div className="manager exam-results-container">
      {/* Header */}
      <div className="manager-toolbar">
        <div className="manager-title">
          <FileText size={24} />
          <div>
            <h3>Exam Results Entry</h3>
            <p>Enter and manage scores for all subjects and students</p>
          </div>
        </div>
        <div className="manager-actions">
          {selectedTermId && selectedClassId && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button variant="outline" onClick={() => setSelectedClassId('')}>
                <ArrowLeft size={18} /> Back to Overview
              </Button>
              <Button onClick={handleSave} isLoading={saving} className="save-btn">
                <Save size={18} /> Save All Results
              </Button>
            </div>
          )}
        </div>
      </div>

      {flash && <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>{flash}</div>}

      {/* Selectors */}
      <div className="results-selectors">
        <div className="selector-field">
          <label>Select Exam Term</label>
          <select
            className="form-select"
            value={selectedTermId}
            onChange={e => {
              setSelectedTermId(e.target.value);
              setSelectedClassId('');
              setSubjects([]);
              setStudents([]);
            }}
          >
            <option value="">-- Choose Term --</option>
            {terms.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.academic_year})</option>
            ))}
          </select>
        </div>

        {selectedTermId && (
          <div className="selector-field animate-fade-in">
            <label>Select Class</label>
            <select
              className="form-select"
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
            >
              <option value="">-- Choose Class --</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!selectedTermId && (
        <div className="empty-state results-empty">
          <Database size={48} opacity={0.3} />
          <p>Select an exam term to begin entering results</p>
        </div>
      )}

      {selectedTermId && !selectedClassId && (
        <div className="term-overview animate-fade-in">
          {statsLoading ? (
            <div className="results-fetching">
              <Loader2 className="spin" size={32} />
              <p>Analyzing submission progress...</p>
            </div>
          ) : submissionStats.length === 0 ? (
            <div className="empty-state results-empty">
              <AlertCircle size={48} opacity={0.3} />
              <p>No classes are assigned to this term</p>
            </div>
          ) : (
            <div className="stats-grid">
              {submissionStats.map(stat => (
                <div
                  key={stat.id}
                  className={`stat-card ${stat.progress === 100 ? 'is-complete' : stat.progress > 0 ? 'is-progress' : 'is-pending'}`}
                  onClick={() => setSelectedClassId(stat.id)}
                >
                  <div className="stat-card-header">
                    <h4>{stat.name}</h4>
                    <span className="stat-badge">
                      {stat.progress === 100 ? 'Completed' : stat.progress > 0 ? 'In Progress' : 'Not Started'}
                    </span>
                  </div>

                  <div className="stat-body">
                    <div className="stat-row">
                      <span>Students Graded</span>
                      <strong>{stat.gradedStudents} / {stat.totalStudents}</strong>
                    </div>
                    <div className="progress-bar-wrap">
                      <div className="progress-bar-fill" style={{ width: `${stat.progress}%` }} />
                    </div>
                    <div className="stat-footer-info">
                      {stat.subjectStats.map((sub: any) => (
                        <div key={sub.name} className={`info-chip ${sub.percent === 100 ? 'success' : sub.percent > 0 ? 'progress' : ''}`}>
                          {sub.name}: {sub.percent}%
                        </div>
                      ))}
                      {!stat.hasConfig && (
                        <div className="info-chip warning">
                          <AlertCircle size={12} /> No Max Marks
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="stat-card-action">
                    Open Spreadsheet <ChevronRight size={16} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedTermId && selectedClassId && (
        <div className="results-editor animate-fade-up">
          {fetchingData ? (
            <div className="results-fetching">
              <Loader2 className="spin" size={32} />
              <p>Loading result sheet...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="empty-state results-empty">
              <AlertCircle size={48} color="var(--warning)" />
              <p>No active students found in this class</p>
            </div>
          ) : subjects.length === 0 ? (
            <div className="empty-state results-empty">
              <AlertCircle size={48} color="var(--warning)" />
              <p>No subjects defined for this class. Add subjects in Class Management.</p>
            </div>
          ) : (
            <div className="results-table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th className="sticky-col">Student Name</th>
                    {subjects.map(sub => (
                      <th key={sub} className="subject-col">{sub}</th>
                    ))}
                    <th className="total-col">Total</th>
                    <th className="percent-col">%</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Total Marks Row */}
                  <tr className="total-marks-row">
                    <td className="sticky-col">
                      <div className="total-marks-label">
                        <strong>Maximum Marks</strong>
                        <span>Set once per term</span>
                      </div>
                    </td>
                    {subjects.map(sub => (
                      <td key={sub} className="subject-col">
                        <input
                          type="number"
                          className="mark-input total-input"
                          placeholder="Possible"
                          value={totalMarks[sub] || ''}
                          onChange={e => handleTotalMarkChange(sub, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="total-col">
                      <div className="sum-display">
                        {subjects.reduce((sum, sub) => sum + (totalMarks[sub] || 0), 0)}
                      </div>
                    </td>
                    <td className="percent-col">100%</td>
                  </tr>

                  {/* Student Rows */}
                  {students.map(student => {
                    const { obtainedTotal, percentage } = calculateResult(student.id);
                    return (
                      <tr key={student.id}>
                        <td className="sticky-col">
                          <div className="student-name-box">
                            <strong>{student.first_name} {student.last_name}</strong>
                            <span style={{ fontSize: '11px', opacity: 0.8, color: 'var(--text-muted)' }}>Father: {student.father_name || 'N/A'}</span>
                            <span>{student.registration_number}</span>
                          </div>
                        </td>
                        {subjects.map(sub => (
                          <td key={sub} className="subject-col">
                            <input
                              type="number"
                              className="mark-input score-input"
                              placeholder="Obtained"
                              value={studentMarks[student.id]?.[sub] || ''}
                              onChange={e => handleStudentMarkChange(student.id, sub, e.target.value)}
                            />
                          </td>
                        ))}
                        <td className="total-col">
                          <div className={`obtained-sum ${obtainedTotal > 0 ? 'has-val' : ''}`}>
                            {obtainedTotal}
                          </div>
                        </td>
                        <td className="percent-col">
                          <div className={`percentage-badge ${percentage >= 40 ? 'pass' : percentage > 0 ? 'fail' : ''}`}>
                            {percentage > 0 ? percentage.toFixed(1) + '%' : '—'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
