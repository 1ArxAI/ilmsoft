import React from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { Student, Class, Parent } from '../../hooks/useStudents';

interface StudentModalProps {
  form: any;
  set: (k: string, v: any) => void;
  editStudent: Student | null;
  classes: Class[];
  parents: Parent[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  getParentName: (id: string) => string;
}

export const StudentModal: React.FC<StudentModalProps> = ({
  form,
  set,
  editStudent,
  classes,
  parents,
  saving,
  onClose,
  onSave,
  getParentName
}) => {
  const getFinalFee = () => {
    if (!form.discount_type || !form.discount_value) return form.monthly_fee || 0;
    if (form.discount_type === 'percentage') {
      return Math.round((form.monthly_fee || 0) * (1 - form.discount_value / 100));
    }
    return Math.max(0, (form.monthly_fee || 0) - form.discount_value);
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-head">
          <h3>{editStudent ? 'Edit Student' : 'Add Student'}</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="form-section-label">Student Information *</div>
          <div className="form-grid">
            <Input label="First Name *" placeholder="Enter first name" value={form.first_name} onChange={e => set('first_name', e.target.value)} required />
            <Input label="Last Name *" placeholder="Enter last name" value={form.last_name} onChange={e => set('last_name', e.target.value)} required />
            
            <div>
              <label className="form-label">Gender</label>
              <select className="form-select" value={form.gender || 'Boy'} onChange={e => set('gender', e.target.value)}>
                <option value="Boy">Boy</option>
                <option value="Girl">Girl</option>
              </select>
            </div>

            <div>
              <label className="form-label">Admission Class</label>
              <select className="form-select" value={form.admission_class_id} onChange={e => set('admission_class_id', e.target.value)}>
                <option value="">Select admission class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Current Class</label>
              <select className="form-select" value={form.current_class_id} onChange={e => set('current_class_id', e.target.value)}>
                <option value="">Select current class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <Input label="Class Fee (from current class)" type="number" value={form.monthly_fee || ''} readOnly />
            <Input label="CNIC" placeholder="XXXXX-XXXXXXX-X" value={form.cnic} onChange={e => set('cnic', e.target.value)} />
            <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
          </div>

          <div className="form-section-label">Enrollment Details *</div>
          <div className="form-grid">
            <div className="span-2">
              <label className="form-label">Parent *</label>
              <select 
                className="form-select" 
                value={form.parent_id} 
                onChange={e => set('parent_id', e.target.value)}
                required
              >
                <option value="">-- Select Parent / Guardian --</option>
                {parents.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
              {form.parent_id && (
                <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-muted)' }}>
                  Selected: {getParentName(form.parent_id)}
                </small>
              )}
            </div>
            <div>
              <label className="form-label">Admission Date</label>
              <input type="date" className="form-input" value={form.date_of_admission} onChange={e => set('date_of_admission', e.target.value)} />
            </div>
            
            <div>
              <label className="form-label">Discount Type</label>
              <select className="form-select" value={form.discount_type || ''} onChange={e => set('discount_type', e.target.value)}>
                <option value="">No Discount</option>
                <option value="percentage">Percentage (%)</option>
                <option value="amount">Fixed Amount (Rs)</option>
              </select>
            </div>
            {form.discount_type && (
              <div>
                <label className="form-label">{form.discount_type === 'percentage' ? 'Discount %' : 'Discount Amount (Rs)'}</label>
                <Input
                  type="number"
                  value={form.discount_value || ''}
                  onChange={e => set('discount_value', parseFloat(e.target.value) || 0)}
                  placeholder={form.discount_type === 'percentage' ? 'e.g. 10' : 'e.g. 500'}
                />
              </div>
            )}
            <div className="span-2">
              <label className="form-label">Final Monthly Fee (Rs)</label>
              <div className={`fee-display ${form.discount_value ? 'discounted' : ''}`}>
                Rs {getFinalFee().toLocaleString()}
                {form.discount_value > 0 && <span className="fee-original">(was Rs {(form.monthly_fee || 0).toLocaleString()})</span>}
              </div>
            </div>
            
            <div className="span-2" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', padding: '10px', background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <input 
                type="checkbox" 
                id="student-active"
                checked={form.active} 
                onChange={e => set('active', e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="student-active" style={{ fontSize: 'var(--font-sm)', fontWeight: 600, cursor: 'pointer', color: 'var(--text)' }}>
                Active Enrollment (Uncheck to deactivate student)
              </label>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} isLoading={saving} disabled={!form.parent_id || !form.first_name.trim() || !form.last_name.trim()}>
            <Plus size={18} /> {editStudent ? 'Save Changes' : 'Add Student'}
          </Button>
        </div>
      </div>
    </div>
  );
};
