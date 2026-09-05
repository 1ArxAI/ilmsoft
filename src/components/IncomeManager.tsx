import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchAll } from '../lib/supabase';
import type { Role } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Button } from './ui/Button';
import { Plus, Trash2, Edit2, Save, X, DollarSign, Calendar, FileText, CreditCard, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import './IncomeManager.css';
import './managers.css';

export type IncomeCategory = {
  id: string;
  school_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
};

export type IncomeRecord = {
  id: string;
  school_id: string;
  category_id: string;
  category_name?: string;
  amount: number;
  date: string;
  payment_method: string;
  description: string;
  additional_notes: string;
  created_at: string;
};

type IncomeManagerProps = {
  schoolId: string;
  role?: Role;
};

const DEFAULT_CATEGORIES = ['Book Sales', 'Notebook Sales', 'Canteen', 'Other Income'];
const PAGE_SIZE = 25;
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'EasyPaisa', 'JazzCash'];

export const IncomeManager = ({ schoolId, role }: IncomeManagerProps) => {
  const isOwner = role === 'owner';
  const { flash, showFlash } = useFlashMessage(4000);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState({
    category_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    payment_method: 'Cash',
    description: '',
    additional_notes: ''
  });

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('income_categories')
      .select('id, school_id, name, is_default, created_at')
      .eq('school_id', schoolId)
      .order('name', { ascending: true });

    if (error) {
      showFlash('Error loading categories: ' + error.message);
      return;
    }

    if (data && data.length === 0) {
      const defaultCats = DEFAULT_CATEGORIES.map(name => ({
        school_id: schoolId,
        name,
        is_default: true
      }));
      await supabase.from('income_categories').insert(defaultCats);
      const { data: newData } = await supabase
        .from('income_categories')
        .select('id, school_id, name, is_default, created_at')
        .eq('school_id', schoolId)
        .order('name', { ascending: true });
      setCategories(newData || []);
    } else {
      setCategories(data || []);
    }
  }, [schoolId, showFlash]);

  const loadRecords = useCallback(async () => {
    const { data, error } = await fetchAll((from, to) => supabase
      .from('income_records')
      .select(`id, school_id, category_id, amount, date, payment_method, description, additional_notes, created_at, category:category_id(name)`)
      .eq('school_id', schoolId)
      .order('date', { ascending: false }).order('id')
      .range(from, to));

    if (error) {
      showFlash('Error loading records: ' + error.message);
      return;
    }

    const formatted = (data || []).map((r: any) => ({
      ...r,
      category_name: r.category?.name || 'Unknown'
    }));
    setRecords(formatted as IncomeRecord[]);
  }, [schoolId, showFlash]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCategories(), loadRecords()]);
    setLoading(false);
  }, [loadCategories, loadRecords]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = useCallback(() => {
    setFormData({
      category_id: categories[0]?.id || '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      payment_method: 'Cash',
      description: '',
      additional_notes: ''
    });
    setEditingId(null);
  }, [categories]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category_id || !formData.amount) {
      showFlash('Please fill all required fields');
      return;
    }

    const amountValue = parseInt(formData.amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      showFlash('Amount must be a positive number');
      return;
    }

    const payload = {
      school_id: schoolId,
      category_id: formData.category_id,
      amount: amountValue,
      date: formData.date,
      payment_method: formData.payment_method,
      description: formData.description,
      additional_notes: formData.additional_notes
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from('income_records')
          .update(payload)
          .eq('id', editingId);
        if (error) showFlash('Error updating: ' + error.message);
        else showFlash('Income record updated successfully');
      } else {
        const { error } = await supabase.from('income_records').insert(payload);
        if (error) showFlash('Error creating: ' + error.message);
        else showFlash('Income record created successfully');
      }

      resetForm();
      setShowForm(false);
      loadRecords();
    } catch (err: any) {
      showFlash('Error saving income: ' + err.message);
    }
  }, [schoolId, formData, editingId, showFlash, loadRecords, resetForm]);

  const startEdit = (record: IncomeRecord) => {
    setEditingId(record.id);
    setFormData({
      category_id: record.category_id,
      amount: record.amount.toString(),
      date: record.date,
      payment_method: record.payment_method,
      description: record.description,
      additional_notes: record.additional_notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setConfirmAction({
      message: 'Delete this income record?',
      onConfirm: async () => {
        const { error } = await supabase.from('income_records').delete().eq('id', id);
        if (error) showFlash('Error deleting: ' + error.message);
        else loadRecords();
        setConfirmAction(null);
      }
    });
  };

  const addCategory = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    
    try {
      const { error } = await supabase.from('income_categories').insert({
        school_id: schoolId,
        name: newCategoryName.trim(),
        is_default: false
      });
      
      if (error) showFlash('Error adding category: ' + error.message);
      else {
        setNewCategoryName('');
        setShowCategoryForm(false);
        loadCategories();
      }
    } catch (err: any) {
      showFlash('Error adding category: ' + err.message);
    }
  }, [newCategoryName, schoolId, showFlash, loadCategories]);

  const deleteCategory = (id: string) => {
    setConfirmAction({
      message: 'Delete this category? Existing records will keep it.',
      onConfirm: async () => {
        const { error } = await supabase.from('income_categories').delete().eq('id', id);
        if (error) showFlash('Error: ' + error.message);
        else loadCategories();
        setConfirmAction(null);
      }
    });
  };

  const filteredRecords = useMemo(() => records.filter(r => {
    const matchesSearch = r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         r.category_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || r.category_id === filterCategory;
    return matchesSearch && matchesCategory;
  }), [records, searchQuery, filterCategory]);

  const totalIncome = filteredRecords.reduce((sum, r) => sum + r.amount, 0);

  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE);
  
  // Reset to valid page if filters changed and current page is out of bounds
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, page]);

  useEffect(() => { setPage(1); }, [searchQuery, filterCategory]);

  if (loading) return <div className="loading-spinner"><div className="loading-spinner-icon" /> Loading income data…</div>;

  return (
    <div className="income-manager">
      {/* Summary Cards */}
      <div className="income-summary">
        <div className="summary-card glass">
          <DollarSign size={24} />
          <div>
            <span className="summary-value">Rs {totalIncome.toLocaleString()}</span>
            <span className="summary-label">Total Income</span>
          </div>
        </div>
        <div className="summary-card glass">
          <FileText size={24} />
          <div>
            <span className="summary-value">{records.length}</span>
            <span className="summary-label">Records</span>
          </div>
        </div>
        <div className="summary-card glass">
          <CreditCard size={24} />
          <div>
            <span className="summary-value">{categories.length}</span>
            <span className="summary-label">Categories</span>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="categories-bar">
        <span className="categories-label">Categories:</span>
        <div className="categories-list">
          {categories.map(cat => (
            <span key={cat.id} className={`category-tag ${cat.is_default ? 'default' : 'custom'}`}>
              {cat.name}
              {isOwner && !cat.is_default && (
                <button onClick={() => deleteCategory(cat.id)} title="Delete"><X size={10} /></button>
              )}
            </span>
          ))}
        </div>
        <button className="btn-add-category" onClick={() => setShowCategoryForm(!showCategoryForm)}>
          <Plus size={14} />
        </button>
        {showCategoryForm && (
          <form className="category-form-inline" onSubmit={addCategory}>
            <input
              type="text"
              placeholder="New category"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-confirm"><Save size={14} /></button>
            <button type="button" className="btn-cancel" onClick={() => {setShowCategoryForm(false); setNewCategoryName('');}}><X size={14} /></button>
          </form>
        )}
      </div>

      {/* Record Form */}
      <div className="form-section">
        {showForm && (
          <form className="income-form glass" onSubmit={handleSubmit}>
            <div className="form-header">
              <h4>{editingId ? 'Edit Income' : 'Record Income'}</h4>
              <button type="button" className="btn-close" onClick={() => { setShowForm(false); setEditingId(null); }}>
                <X size={18} />
              </button>
            </div>

            <div className="form-grid">
              <div className="form-group required">
                <label>Income Category</label>
                <select 
                  value={formData.category_id} 
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group required">
                <label>Amount (PKR)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Enter amount"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>

              <div className="form-group required">
                <label>Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group required">
                <label>Payment Method</label>
                <select 
                  value={formData.payment_method} 
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="form-group required full-width">
                <label>Description</label>
                <input
                  type="text"
                  placeholder="Brief description of income"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>

              <div className="form-group full-width">
                <label>Additional Notes</label>
                <textarea
                  rows={2}
                  placeholder="Any additional notes..."
                  value={formData.additional_notes}
                  onChange={(e) => setFormData({ ...formData, additional_notes: e.target.value })}
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">
                <Save size={16} /> {editingId ? 'Update' : 'Save'} Record
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Records Header (Filters & Stats) */}
      <div className="records-header-section glass">
        <div className="records-header">
          <div className="search-filter">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          
          <div className="records-actions-top">
            <span className="records-count">{filteredRecords.length} records</span>
            <button className="btn-add-income compact" onClick={() => { if(showForm) setShowForm(false); else { resetForm(); setShowForm(true); } }}>
              {showForm ? <X size={16} /> : <Plus size={16} />}
              {showForm ? 'Cancel' : 'Record Income'}
            </button>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="records-table-section glass">
        <div className="records-table-container">
          {filteredRecords.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <p>No income records found</p>
            </div>
          ) : (
            <table className="records-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Method</th>
                  <th className="amount-col">Amount</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(record => (
                  <tr key={record.id}>
                    <td className="date-cell">
                      <div className="date-wrapper">
                        <Calendar size={14} />
                        {new Date(record.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td>
                      <span className="table-category-tag">{record.category_name}</span>
                    </td>
                    <td>
                      <div className="desc-wrapper">
                        <span className="record-desc-text">{record.description}</span>
                        {record.additional_notes && (
                          <span className="record-notes-hint" title={record.additional_notes}>
                            <FileText size={12} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="method-wrapper">
                        <CreditCard size={14} />
                        {record.payment_method}
                      </div>
                    </td>
                    <td className="amount-col amount-cell">
                      Rs {record.amount.toLocaleString()}
                    </td>
                    <td className="actions-col">
                      <div className="table-actions">
                        {isOwner && (
                          <button className="btn-table-icon" onClick={() => startEdit(record)} title="Edit">
                            <Edit2 size={14} />
                          </button>
                        )}
                        {isOwner && (
                          <button className="btn-table-icon danger" onClick={() => handleDelete(record.id)} title="Delete">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <span className="pagination-info">
              Showing {(page-1)*PAGE_SIZE + 1}–{Math.min(page*PAGE_SIZE, filteredRecords.length)} of {filteredRecords.length}
            </span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p-1)}><ChevronLeft size={16} /></button>
              {Array.from({ length: totalPages }, (_, i) => i+1).map(p => (
                <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p+1)}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {flash && <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>{flash}</div>}

      {confirmAction && (
        <div className="modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <Trash2 size={40} color="var(--danger)" />
            <h3>{confirmAction.message}</h3>
            <div className="confirm-box-btns">
              <Button variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmAction.onConfirm}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
