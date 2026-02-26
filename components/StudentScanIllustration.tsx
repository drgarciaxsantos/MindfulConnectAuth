import React from 'react';

export const StudentScanIllustration: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg 
      className={className} 
      viewBox="0 0 200 200" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background Circle */}
      <circle cx="100" cy="100" r="90" className="fill-purple-50" />
      
      {/* ID Card Shape */}
      <rect x="50" y="40" width="100" height="140" rx="8" className="fill-white stroke-purple-200" strokeWidth="2" />
      
      {/* Card Header */}
      <path d="M51 48C51 43.5817 54.5817 40 59 40H141C145.418 40 149 43.5817 149 48V70H51V48Z" className="fill-purple-500" />
      
      {/* Photo Placeholder */}
      <circle cx="100" cy="100" r="25" className="fill-purple-100" />
      <path d="M100 85C95.5817 85 92 88.5817 92 93C92 97.4183 95.5817 101 100 101C104.418 101 108 97.4183 108 93C108 88.5817 104.418 85 100 85Z" className="fill-purple-300" />
      <path d="M118 118C118 108.059 109.941 100 100 100C90.0589 100 82 108.059 82 118H118Z" className="fill-purple-300" />
      
      {/* Text Lines */}
      <rect x="70" y="135" width="60" height="6" rx="3" className="fill-purple-200" />
      <rect x="80" y="148" width="40" height="6" rx="3" className="fill-purple-100" />
      
      {/* NFC Waves */}
      <path d="M130 160C135.523 160 140 155.523 140 150" className="stroke-purple-400" strokeWidth="3" strokeLinecap="round" />
      <path d="M130 168C140.493 168 149 159.493 149 149" className="stroke-purple-400" strokeWidth="3" strokeLinecap="round" />
      <path d="M130 176C145.464 176 158 163.464 158 148" className="stroke-purple-400" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
};
