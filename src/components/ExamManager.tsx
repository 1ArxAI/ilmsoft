import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { ExamTerm, Class, Role } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { 
  Plus, Calendar, Trash2, Edit2, 
  BookOpen, Users, X, Check,
  Loader2
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import './ExamManager.css';

interface ExamManagerProps {
  schoolId: string;
  role?: Role;
}

const ExamManager = ({ schoolId, role }: ExamManagerProps) => {
  const [terms, setTerms] = useState<ExamTerm[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const { flash, showFlash } = useFlashMessage(5000);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    academic_year: new Date().getFullYear().toString(),
    start_date: '',
    end_date: '',
    class_ids: [] as string[]
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [termsRes, classesRes] = await Promise.all([
        supabase
          .from('exam_terms')
          .select('id, school_id, name, academic_year, start_date, end_date, class_ids, created_at')
          .eq('school_id', schoolId)
          .order('start_date', { ascending: false }),
        supabase
          .from('classes')
          .select('id, school_id, name, display_order, monthly_fee, admission_fee, active, subjects, created_at, updated_at')
          .eq('school_id', schoolId)
          .eq('active', true)
          .order('name')
      ]);

      if (termsRes.error) throw termsRes.error;
      if (classesRes.error) throw classesRes.error;

      setTerms(termsRes.data || []);
      setClasses(classesRes.data || []);
    } catch (err: any) {
      showFlash('Error loading exams: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolId, showFlash]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleClass = (classId: string) => {
    setFormData(prev => ({
      ...prev,
      class_ids: prev.class_ids.includes(classId)
        ? prev.class_ids.filter(id => id !== classId)
        : [...prev.class_ids, classId]
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return showFlash('Enter a term name');
    if (!formData.start_date || !formData.end_date) return showFlash('Select start and end dates');
    if (formData.class_ids.length === 0) return showFlash('Select at least one class');

    setSaving(true);
    try {
      const payload = {
        school_id: schoolId,
        name: formData.name.trim(),
        academic_year: formData.academic_year,
        start_date: formData.start_date,
        end_date: formData.end_date,
        class_ids: formData.class_ids
      };

      if (editingId) {
        const { error } = await supabase
          .from('exam_terms')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        showFlash('Exam term updated');
      } else {
        const { error } = await supabase
          .from('exam_terms')
          .insert(payload);
        if (error) throw error;
        showFlash('Exam term created');
      }

      setShowModal(false);
      resetForm();
      loadData();
    } catch (err: any) {
      showFlash('Error saving: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this exam term?')) return;
    try {
      const { error } = await supabase
        .from('exam_terms')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showFlash('Exam term deleted');
      loadData();
    } catch (err: any) {
      showFlash('Error deleting: ' + err.message);
    }
  };

  const openEdit = (term: ExamTerm) => {
    setEditingId(term.id);
    setFormData({
      name: term.name,
      academic_year: term.academic_year,
      start_date: term.start_date,
      end_date: term.end_date,
      class_ids: term.class_ids || []
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      name: '',
      academic_year: new Date().getFullYear().toString(),
      start_date: '',
      end_date: '',
      class_ids: []
    });
  };

  if (loading && terms.length === 0) {
    return <div className="exam-loading"><Loader2 className="spin" /> Loading Exams...</div>;
  }

  return (
    <div className="exam-manager">
      <div className="exam-header">
        <div className="exam-title-area">
          <h3>Examination Terms</h3>
          <p>Schedule exam periods and assign classes</p>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus size={18} /> Create New Term
        </Button>
      </div>

      {flash && <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>{flash}</div>}

      {terms.length === 0 ? (
        <div className="exam-empty">
          <Calendar size={48} />
          <p>No examination terms found.</p>
          <Button variant="outline" onClick={() => setShowModal(true)}>Add Your First Term</Button>
        </div>
      ) : (
        <div className="exam-grid">
          {terms.map(term => (
            <div key={term.id} className="exam-card">
              <div className="exam-card-year">{term.academic_year}</div>
              <div className="exam-card-content">
                <h4>{term.name}</h4>
                <div className="exam-card-dates">
                  <Calendar size={14} />
                  <span>{new Date(term.start_date).toLocaleDateString()} - {new Date(term.end_date).toLocaleDateString()}</span>
                </div>
                <div className="exam-card-classes">
                  <Users size={14} />
                  <span>{term.class_ids.length} Classes Assigned</span>
                </div>
              </div>
              <div className="exam-card-footer">
                <button onClick={() => openEdit(term)} title="Edit Term"><Edit2 size={16} /></button>
                {role === 'owner' && <button onClick={() => handleDelete(term.id)} className="delete" title="Delete Term"><Trash2 size={16} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-box exam-modal">
            <div className="modal-head">
              <h3>{editingId ? 'Edit Exam Term' : 'Create New Term'}</h3>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body exam-form-container">
              <div className="form-grid">
                <div className="span-2">
                  <Input 
                    label="Term Name" 
                    placeholder="e.g. Mid-Term 2024" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                  />
                </div>
                <div>
                  <Input 
                    label="Academic Year" 
                    placeholder="e.g. 2024-25" 
                    value={formData.academic_year} 
                    onChange={e => setFormData({...formData, academic_year: e.target.value})} 
                  />
                </div>
                <div className="form-date-group">
                  <Input 
                    label="Starts On" 
                    type="date" 
                    value={formData.start_date} 
                    onChange={e => setFormData({...formData, start_date: e.target.value})} 
                  />
                  <Input 
                    label="Ends On" 
                    type="date" 
                    value={formData.end_date} 
                    onChange={e => setFormData({...formData, end_date: e.target.value})} 
                  />
                </div>
              </div>

              <div className="class-selection-area">
                <label className="form-label">Select Participating Classes ({formData.class_ids.length})</label>
                <div className="class-selection-grid">
                  {classes.map(cls => (
                    <div 
                      key={cls.id} 
                      className={`class-select-card ${formData.class_ids.includes(cls.id) ? 'selected' : ''}`}
                      onClick={() => handleToggleClass(cls.id)}
                    >
                      <div className="class-card-check">
                        <Check size={12} />
                      </div>
                      <BookOpen size={20} className="class-card-icon" />
                      <span className="class-card-name">{cls.name}</span>
                    </div>
                  ))}
                </div>
                {classes.length === 0 && <p className="no-classes-hint">No active classes found.</p>}
              </div>
            </div>
            <div className="modal-foot">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSave} isLoading={saving}>
                {editingId ? 'Save Changes' : 'Create Term'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamManager;
