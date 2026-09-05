import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Role } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Button } from './ui/Button';
import { Plus, Trash2, Edit2, Save, X, DollarSign, FileText, CreditCard, Search, User, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import './ExpenseManager.css';
import './managers.css';

export type ExpenseCategory = {
  id: string;
  school_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
};

export type Expense = {
  id: string;
  school_id: string;
  category_id: string;
  category_name?: string;
  amount: number;
  expense_date: string;
  payment_method: string;
  description: string;
  paid_by: string;
  additional_notes: string;
  created_at: string;
};

type ExpenseManagerProps = {
  schoolId: string;
  role?: Role;
};

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'Easy Paisa', 'Jazz Cash'];
const PAGE_SIZE = 25;

export const ExpenseManager = ({ schoolId, role }: ExpenseManagerProps) => {
  const isOwner = role === 'owner';
  const { flash, showFlash } = useFlashMessage(4000);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  
  const [page, setPage] = useState(1);

  const [formData, setFormData] = useState({
    category_id: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'Cash',
    description: '',
    paid_by: '',
    additional_notes: ''
  });

  const [newCategory, setNewCategory] = useState('');
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  // Performance optimization: wrap load functions in useCallback
  const loadCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('id, school_id, name, is_default, created_at')
        .eq('school_id', schoolId)
        .order('name');
      
      if (error) {
        showFlash('Error loading categories: ' + error.message);
        return;
      }
      
      if (data) setCategories(data);
    } catch (err: any) {
      showFlash('Error loading categories: ' + err.message);
    }
  }, [schoolId]);

  const loadExpenses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select(`id, school_id, category_id, amount, expense_date, payment_method, description, paid_by, additional_notes, created_at, categories:category_id (name)`)
        .eq('school_id', schoolId)
        .order('expense_date', { ascending: false });
      
      if (error) {
        showFlash('Error loading expenses: ' + error.message);
        return;
      }
      
      if (data) {
        const formatted = data.map((e: any) => ({
          ...e,
          category_name: e.categories?.name || 'Unknown'
        }));
        setExpenses(formatted as Expense[]);
      }
    } catch (err: any) {
      showFlash('Error loading expenses: ' + err.message);
    }
  }, [schoolId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadCategories(), loadExpenses()]);
    } catch (err: any) {
      showFlash('Error loading data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [loadCategories, loadExpenses]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category_id || !formData.amount || !formData.description || !formData.paid_by) return;

    const amountValue = parseInt(formData.amount, 10);
    if (isNaN(amountValue) || amountValue <= 0) {
      showFlash('Amount must be a positive number');
      return;
    }

    const expenseData = {
      school_id: schoolId,
      category_id: formData.category_id,
      amount: amountValue,
      expense_date: formData.expense_date,
      payment_method: formData.payment_method,
      description: formData.description,
      paid_by: formData.paid_by,
      additional_notes: formData.additional_notes
    };

    try {
      if (editingId) {
        setProcessingId(editingId);
        const { error: updateError } = await supabase.from('expenses').update(expenseData).eq('id', editingId);
        setProcessingId(null);
        if (updateError) {
          showFlash('Error updating expense: ' + updateError.message);
          return;
        }
        showFlash('Expense updated successfully');
      } else {
        const { error: insertError } = await supabase.from('expenses').insert(expenseData);
        if (insertError) {
          showFlash('Error creating expense: ' + insertError.message);
          return;
        }
        showFlash('Expense recorded successfully');
      }

      resetForm();
      loadExpenses();
    } catch (err: any) {
      showFlash('Error saving expense: ' + err.message);
      setProcessingId(null);
    }
  }, [schoolId, formData, editingId, showFlash, loadExpenses]);

  const resetForm = () => {
    setFormData({
      category_id: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      payment_method: 'Cash',
      description: '',
      paid_by: '',
      additional_notes: ''
    });
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (expense: Expense) => {
    setFormData({
      category_id: expense.category_id,
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      payment_method: expense.payment_method,
      description: expense.description,
      paid_by: expense.paid_by,
      additional_notes: expense.additional_notes || ''
    });
    setEditingId(expense.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setConfirmAction({
      message: 'Delete this expense record?',
      onConfirm: async () => {
        setProcessingId(id);
        const { error } = await supabase.from('expenses').delete().eq('id', id);
        if (error) {
          showFlash('Error deleting expense: ' + error.message);
        } else {
          loadExpenses();
        }
        setProcessingId(null);
        setConfirmAction(null);
      }
    });
  };

  const addCategory = useCallback(async () => {
    if (!newCategory.trim()) return;
    try {
      const { error } = await supabase.from('expense_categories').insert({
        school_id: schoolId,
        name: newCategory.trim()
      });
      if (error) {
        showFlash('Error adding category: ' + error.message);
        return;
      }
      showFlash('Category added successfully');
      setNewCategory('');
      setShowCategoryForm(false);
      loadCategories();
    } catch (err: any) {
      showFlash('Error adding category: ' + err.message);
    }
  }, [newCategory, schoolId, showFlash, loadCategories]);

  const deleteCategory = (id: string, isDefault: boolean) => {
    if (isDefault) {
      showFlash('Cannot delete default categories');
      return;
    }
    setConfirmAction({
      message: 'Delete this category?',
      onConfirm: async () => {
        await supabase.from('expense_categories').delete().eq('id', id);
        loadCategories();
        setConfirmAction(null);
      }
    });
  };

  const filteredExpenses = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return expenses.filter(e => {
      const matchesSearch = e.description.toLowerCase().includes(q) ||
                           e.paid_by.toLowerCase().includes(q) ||
                           e.category_name?.toLowerCase().includes(q);
      const matchesCategory = !filterCategory || e.category_id === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, searchTerm, filterCategory]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  const totalPages = Math.ceil(filteredExpenses.length / PAGE_SIZE);
  
  // Reset to valid page if filters changed and current page is out of bounds
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredExpenses.slice(start, start + PAGE_SIZE);
  }, [filteredExpenses, page]);

  useEffect(() => { setPage(1); }, [searchTerm, filterCategory]);

  if (loading) return <div className="loading-spinner"><div className="loading-spinner-icon" /> Loading expenses…</div>;

  return (
    <div className="expense-manager">
      {/* Summary Cards */}
      <div className="expense-summary">
        <div className="summary-card">
          <DollarSign className="summary-icon" />
          <div className="summary-info">
            <span className="summary-value">Rs {totalExpenses.toLocaleString()}</span>
            <span className="summary-label">Total Expenses</span>
          </div>
        </div>
        <div className="summary-card">
          <FileText className="summary-icon" />
          <div className="summary-info">
            <span className="summary-value">{expenses.length}</span>
            <span className="summary-label">Records</span>
          </div>
        </div>
        <div className="summary-card">
          <CreditCard className="summary-icon" />
          <div className="summary-info">
            <span className="summary-value">{categories.length}</span>
            <span className="summary-label">Categories</span>
          </div>
        </div>
      </div>

      {/* Add Expense Form */}
      <div className="expense-form-section">
        {showForm && (
          <form onSubmit={handleSubmit} className="expense-form glass">
            <div className="form-row">
              <div className="form-group">
                <label>Expense Category *</label>
                <select 
                  value={formData.category_id} 
                  onChange={(e) => setFormData({...formData, category_id: e.target.value})}
                  required
                >
                  <option value="">Select category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Amount (PKR) *</label>
                <input 
                  type="number" 
                  min="1"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  placeholder="Enter amount"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input 
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({...formData, expense_date: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Payment Method *</label>
                <select 
                  value={formData.payment_method}
                  onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                  required
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Description *</label>
              <input 
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Enter description"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Paid By *</label>
                <input 
                  type="text"
                  value={formData.paid_by}
                  onChange={(e) => setFormData({...formData, paid_by: e.target.value})}
                  placeholder="Name of person who paid"
                  required
                />
              </div>
              <div className="form-group">
                <label>Additional Notes</label>
                <input 
                  type="text"
                  value={formData.additional_notes}
                  onChange={(e) => setFormData({...formData, additional_notes: e.target.value})}
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-submit">
                <Save size={18} /> {editingId ? 'Update' : 'Save'} Expense
              </button>
              <button type="button" className="btn-cancel" onClick={resetForm}>
                <X size={18} /> Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Categories Management */}
      <div className="categories-section">
        <div className="categories-header">
          <h4>Expense Categories</h4>
          <button className="btn-add-category" onClick={() => setShowCategoryForm(!showCategoryForm)}>
            <Plus size={16} /> Add Category
          </button>
        </div>
        
        {showCategoryForm && (
          <div className="add-category-form">
            <input 
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category name"
            />
            <button onClick={addCategory}><Save size={16} /></button>
            <button onClick={() => setShowCategoryForm(false)}><X size={16} /></button>
          </div>
        )}

        <div className="categories-list">
          {categories.map(cat => (
            <div key={cat.id} className={`category-tag ${cat.is_default ? 'default' : 'custom'}`}>
              {cat.name}
              {isOwner && !cat.is_default && (
                <button onClick={() => deleteCategory(cat.id, cat.is_default)}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filters-left">
          <div className="search-box">
            <Search size={18} />
            <input 
              type="text"
              placeholder="Search expenses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <button className="btn-toggle-form compact" onClick={() => { if(showForm) setShowForm(false); else { resetForm(); setShowForm(true); } }}>
          {showForm ? <X size={18} /> : <Plus size={18} />}
          {showForm ? 'Cancel' : 'Record Expense'}
        </button>
      </div>

      {/* Expenses Table */}
      <div className="expenses-table-wrap">
        <table className="expenses-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Paid By</th>
              <th>Payment</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-cell">No expenses found</td>
              </tr>
            ) : (
              paginated.map(expense => (
                <tr key={expense.id}>
                  <td>{new Date(expense.expense_date).toLocaleDateString()}</td>
                  <td>
                    <span className="category-badge">{expense.category_name}</span>
                  </td>
                  <td>{expense.description}</td>
                  <td className="amount-cell">Rs {expense.amount.toLocaleString()}</td>
                  <td>
                    <div className="paid-by">
                      <User size={14} />
                      {expense.paid_by}
                    </div>
                  </td>
                  <td>{expense.payment_method}</td>
                  <td className="notes-cell">{expense.additional_notes || '-'}</td>
                  <td className="actions-cell">
                    {isOwner && (
                      <button onClick={() => handleEdit(expense)} disabled={processingId === expense.id}><Edit2 size={16} /></button>
                    )}
                    {isOwner && (
                      <button onClick={() => handleDelete(expense.id)} disabled={processingId === expense.id}>
                        {processingId === expense.id ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <span className="pagination-info">
            Showing {(page-1)*PAGE_SIZE + 1}–{Math.min(page*PAGE_SIZE, filteredExpenses.length)} of {filteredExpenses.length}
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

      {flash && <div className={`flash ${flash.startsWith('Error') || flash.startsWith('Cannot') ? 'error' : 'success'}`}>{flash}</div>}

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
