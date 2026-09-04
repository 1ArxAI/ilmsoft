import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  FileText, Search, Printer, 
  CheckSquare, Loader2
} from 'lucide-react';
import { Button } from './ui/Button';
import ResultCardPrinter from './ResultCardPrinter';
import './managers.css';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  registration_number: string;
  parent_id?: string;
  father_name?: string;
}

export const ResultCardManager: React.FC<{ schoolId: string }> = ({ schoolId }) => {
  const [loading, setLoading]       = useState(true);
  const [terms, setTerms]           = useState<any[]>([]);
  const [classes, setClasses]       = useState<any[]>([]);
  const [students, setStudents]     = useState<Student[]>([]);
  
  // Selection State
  const [selectedTermId, setSelectedTermId]   = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm]           = useState('');
  
  // Print State
  const [showPrinter, setShowPrinter] = useState(false);

  // 1. Initial Load: Fetch terms (Aligned with ExamManager order)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: termData } = await supabase
        .from('exam_terms')
        .select('id, name, academic_year, class_ids, school_id')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: false });
      setTerms(termData || []);
    } catch (err) {
      console.error('Error fetching terms:', err);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 2. Term Selection -> Fetch Classes for that term (Fresh from DB)
  useEffect(() => {
    const fetchClasses = async () => {
      if (!selectedTermId) {
        setClasses([]);
        return;
      }

      setClasses([]); // Reset while loading
      try {
        // 2a. Fetch the latest term object to get current class_ids
        const { data: term, error: termErr } = await supabase
          .from('exam_terms')
          .select('class_ids')
          .eq('id', selectedTermId)
          .single();

        if (termErr || !term?.class_ids?.length) {
          console.warn('No class IDs found for this term');
          return;
        }

        // 2b. Fetch class details for these IDs
        const { data: classData, error: classErr } = await supabase
          .from('classes')
          .select('id, name')
          .in('id', term.class_ids)
          .order('name');

        if (classErr) throw classErr;
        setClasses(classData || []);
      } catch (err) {
        console.error('Error details for classes:', err);
      }
    };
    fetchClasses();
  }, [selectedTermId]);

  // 3. Class Selection -> Fetch Students & Result Status
  useEffect(() => {
    const fetchStudentsAndStatus = async () => {
      if (!selectedClassId || !selectedTermId) {
        setStudents([]);
        return;
      }
      
      try {
        const [{ data: studentRaw, error: studErr }, { data: resultData, error: resErr }] = await Promise.all([
          supabase
            .from('students')
            .select('id, first_name, last_name, registration_number, parent_id, parents:parent_id(first_name, last_name)')
            .eq('current_class_id', selectedClassId)
            .eq('school_id', schoolId)
            .eq('active', true)
            .order('first_name'),
          supabase
            .from('exam_results')
            .select('student_id')
            .eq('exam_term_id', selectedTermId)
            .eq('class_id', selectedClassId),
        ]);
        if (studErr) throw studErr;
        if (resErr) throw resErr;
        const studentData = (studentRaw || []).map((s: any) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name, registration_number: s.registration_number, parent_id: s.parent_id, parents: s.parents }));
        const parentsMap = new Map<string, string>();
        studentData.forEach((s: any) => { if (s.parents) parentsMap.set(s.parent_id, `${s.parents.first_name} ${s.parents.last_name}`.trim()); });

        const hasResult = new Set(resultData?.map(r => r.student_id) || []);
        
        const studentsWithStatus = (studentData || []).map(s => ({
          ...s,
          father_name: s.parent_id ? parentsMap.get(s.parent_id) : '',
          has_result: hasResult.has(s.id)
        }));

        setStudents(studentsWithStatus as any);
        setSelectedStudentIds(new Set()); // Reset selection
      } catch (err) {
        console.error('Error fetching students/status:', err);
      }
    };
    fetchStudentsAndStatus();
  }, [selectedClassId, selectedTermId, schoolId]);

  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students as any[];
    const q = searchTerm.toLowerCase();
    return (students as any[]).filter(s => 
      s.first_name.toLowerCase().includes(q) || 
      s.last_name.toLowerCase().includes(q) || 
      (s.father_name && s.father_name.toLowerCase().includes(q)) ||
      (s.registration_number && s.registration_number.toLowerCase().includes(q))
    );
  }, [students, searchTerm]);

  const toggleStudent = (id: string) => {
    const next = new Set(selectedStudentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudentIds(next);
  };

  const toggleAll = () => {
    if (selectedStudentIds.size === filteredStudents.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map(s => s.id)));
    }
  };

  if (loading) return <div className="manager-loading"><Loader2 className="spin" /> Loading Exam Settings...</div>;

  return (
    <div className="manager-shell animate-fade-up">
      <div className="manager-toolbar">
        <div className="manager-title">
          <FileText size={24} />
          <div>
            <h3>Academic Result Cards</h3>
            <p>Generate and print student performance reports</p>
          </div>
        </div>
        {selectedStudentIds.size > 0 && (
          <Button onClick={() => setShowPrinter(true)}>
            <Printer size={18} /> Print {selectedStudentIds.size} Result Card{selectedStudentIds.size > 1 ? 's' : ''}
          </Button>
        )}
      </div>

      <div className="manager-card card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <label className="form-label">Step 1: Select Exam Term</label>
            <select 
              className="form-select" 
              value={selectedTermId} 
              onChange={e => setSelectedTermId(e.target.value)}
            >
              <option value="">Select Term...</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name} ({t.academic_year})</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Step 2: Select Class</label>
            <select 
              className="form-select" 
              value={selectedClassId} 
              onChange={e => setSelectedClassId(e.target.value)}
              disabled={!selectedTermId}
            >
              <option value="">Select Class...</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selectedClassId && (
        <div className="animate-fade-up">
          <div className="manager-toolbar" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="manager-search-bar" style={{ maxWidth: '300px' }}>
                <Search size={16} />
                <input 
                  placeholder="Search students..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                <CheckSquare size={16} style={{ marginRight: '6px' }} />
                {selectedStudentIds.size === filteredStudents.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <p className="text-muted" style={{ fontSize: '13px' }}>
              {selectedStudentIds.size} of {filteredStudents.length} selected
            </p>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Admission No</th>
                  <th>Student Name</th>
                  <th>Father Name</th>
                  <th style={{ textAlign: 'center' }}>Result Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No students found in this class.</td></tr>
                ) : filteredStudents.map((s: any) => (
                  <tr 
                    key={s.id} 
                    onClick={() => toggleStudent(s.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedStudentIds.has(s.id)} 
                        onChange={() => {}} // Controlled by row click
                      />
                    </td>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{s.registration_number || 'N/A'}</td>
                    <td style={{ fontWeight: 500 }}>{s.first_name} {s.last_name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.father_name || 'N/A'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {s.has_result ? (
                        <span className="status-badge active" style={{ fontSize: '11px', padding: '2px 8px' }}>
                          ✅ Ready
                        </span>
                      ) : (
                        <span className="status-badge inactive" style={{ fontSize: '11px', padding: '2px 8px', opacity: 0.7 }}>
                          ⚠️ Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPrinter && (
        <ResultCardPrinter 
          schoolId={schoolId}
          termId={selectedTermId}
          classId={selectedClassId}
          studentIds={Array.from(selectedStudentIds)}
          onClose={() => setShowPrinter(false)}
        />
      )}
    </div>
  );
};

export default ResultCardManager;
