import React from 'react';

interface StatusBadgeProps {
  status: 'ACCEPTED' | 'DENIED' | 'PENDING';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const styles = {
    ACCEPTED: 'bg-green-100 text-green-700 border-green-200',
    DENIED: 'bg-red-100 text-red-700 border-red-200',
    PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  };

  return (
    <div className={`px-6 py-3 rounded-full border-2 font-bold text-lg tracking-widest uppercase ${styles[status]}`}>
      {status}
    </div>
  );
};