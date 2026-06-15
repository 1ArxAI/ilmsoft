import React from 'react';
import { GraduationCap, UserPlus, Edit2, Eye } from 'lucide-react';
import type { Parent } from '../../hooks/useParents';

interface ParentTableProps {
  records: Parent[];
  studentCounts: Record<string, number>;
  monthlyTotals: Record<string, number>;
  discountTotals: Record<string, number>;
  isOwner: boolean;
  onAddChild: (p: Parent) => void;
  onEdit: (p: Parent) => void;
  onView: (p: Parent) => void;
}

export const ParentTable = React.memo<ParentTableProps>(({
  records,
  studentCounts,
  monthlyTotals,
  discountTotals,
  isOwner,
  onAddChild,
  onEdit,
  onView
}) => {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Parent Name</th>
            <th>CNIC</th>
            <th>Contact</th>
            <th>Children</th>
            <th>Monthly Payment</th>
            <th>Discount</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r: Parent) => (
            <tr key={r.id}>
              <td>
                <div className="student-cell">
                  <span style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</span>
                </div>
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.cnic}</td>
              <td>{r.contact}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  background: (studentCounts[r.id] || 0) > 0 ? 'var(--primary-light)' : 'var(--bg-alt)',
                  color: (studentCounts[r.id] || 0) > 0 ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}>
                  <GraduationCap size={14} />
                  {studentCounts[r.id] || 0}
                </span>
              </td>
              <td style={{ fontWeight: 600 }}>
                Rs {(monthlyTotals[r.id] || 0).toLocaleString()}
              </td>
              <td style={{ color: (discountTotals[r.id] || 0) > 0 ? 'var(--success)' : 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>
                {(discountTotals[r.id] || 0) > 0 ? `-Rs ${Math.round(discountTotals[r.id] || 0).toLocaleString()}` : '-'}
              </td>
              <td>
                <div className="row-actions">
                  <button className="action-btn add-child" title="Add Child" onClick={() => onAddChild(r)}>
                    <UserPlus size={14} />
                  </button>
                  {isOwner && (
                    <button className="action-btn edit" title="Edit" onClick={() => onEdit(r)}>
                      <Edit2 size={14} />
                    </button>
                  )}
                  <button className="action-btn view" title="View Report" onClick={() => onView(r)}>
                    <Eye size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
