import React from 'react';
import { BookOpen, Edit2, Eye } from 'lucide-react';
import type { Student } from '../../hooks/useStudents';

interface StudentTableProps {
  students: Student[];
  visibleColumns: Record<string, boolean>;
  isOwner: boolean;
  getClassName: (id: string | null) => string;
  getParentName: (id: string) => string;
  onEdit: (s: Student) => void;
  onViewParent: (parentId: string) => void;
}

export const StudentTable = React.memo<StudentTableProps>(({
  students,
  visibleColumns,
  isOwner,
  getClassName,
  getParentName,
  onEdit,
  onViewParent
}) => {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Student Name</th>
            <th>Parent</th>
            {visibleColumns.admissionClass && <th>Admission Class</th>}
            {visibleColumns.currentClass && <th>Current Class</th>}
            {visibleColumns.fee && <th>Class Fee</th>}
            {visibleColumns.discount && <th>Discount</th>}
            {visibleColumns.monthlyFee && <th>Monthly Fee</th>}
            {visibleColumns.gender && <th>Gender</th>}
            {visibleColumns.cnic && <th>CNIC</th>}
            {visibleColumns.dob && <th>Date of Birth</th>}
            {visibleColumns.actions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {students.map(s => (
            <tr key={s.id} className={!s.active ? 'inactive' : ''}>
              <td>
                <div className="student-cell">
                  <span>{s.first_name} {s.last_name}</span>
                </div>
              </td>
              <td>{getParentName(s.parent_id)}</td>
              {visibleColumns.admissionClass && (
                <td>
                  <span className="class-cell">
                    <BookOpen size={12} />
                    {getClassName(s.admission_class_id)}
                  </span>
                </td>
              )}
              {visibleColumns.currentClass && (
                <td>
                  <span className="class-cell">
                    <BookOpen size={12} />
                    {getClassName(s.current_class_id || s.admission_class_id)}
                  </span>
                </td>
              )}
              {visibleColumns.fee && (
                <td>
                  <span>Rs {s.monthly_fee.toLocaleString()}</span>
                </td>
              )}
              {visibleColumns.discount && (
                <td>
                  {s.discount_type === 'percentage' && s.discount_value !== null && <span className="text-success font-bold">{s.discount_value}%</span>}
                  {s.discount_type === 'amount' && s.discount_value !== null && <span className="text-success font-bold">Rs {(s.discount_value ?? 0).toLocaleString()}</span>}
                  {!s.discount_type && <span className="text-muted">—</span>}
                </td>
              )}
              {visibleColumns.monthlyFee && (
                <td>
                  <span className="font-bold">Rs {(Number(s.current_monthly_fee) || 0).toLocaleString()}</span>
                </td>
              )}
              {visibleColumns.gender && (
                <td>
                  <span className={`rec-badge ${s.gender === 'Boy' ? 'father' : 'mother'}`}>
                    {s.gender || '—'}
                  </span>
                </td>
              )}
              {visibleColumns.cnic && <td className="font-mono text-xs">{s.cnic || '—'}</td>}
              {visibleColumns.dob && <td>{s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString() : '—'}</td>}
              {visibleColumns.actions && (
                <td>
                  <div className="row-actions">

                    {isOwner && (
                      <button className="action-btn edit" title="Edit" onClick={() => onEdit(s)}>
                        <Edit2 size={14} />
                      </button>
                    )}
                    <button className="action-btn view" title="View Parent Profile" onClick={() => onViewParent(s.parent_id)}>
                      <Eye size={14} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
