import React, { useState } from 'react';

interface StatusBadgeProps {
  status: 'ACCEPTED' | 'DENIED' | 'PENDING' | 'CONFIRMED' | 'VERIFYING';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const styles = {
    ACCEPTED: 'bg-green-100 text-green-700 border-green-200',
    CONFIRMED: 'bg-green-100 text-green-700 border-green-200', // Same as ACCEPTED
    DENIED: 'bg-red-100 text-red-700 border-red-200',
    PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    VERIFYING: 'bg-orange-100 text-orange-700 border-orange-200',
  };

  // Fallback for unknown statuses
  const activeStyle = (styles as any)[status] || styles.PENDING;

  return (
    <div className={`px-6 py-3 rounded-full border-2 font-bold text-lg tracking-widest uppercase ${activeStyle}`}>
      {status}
    </div>
  );
};