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
      
      {/* Student Avatar */}
      <g transform="translate(-10, 10)">
        {/* Head */}
        <circle cx="100" cy="75" r="35" className="fill-purple-200" />
        
        {/* Body/Shoulders */}
        <path d="M100 115C70 115 45 135 40 165H160C155 135 130 115 100 115Z" className="fill-purple-300" />
      </g>

      {/* NFC Waves - indicating scan action */}
      <path d="M150 70C160 80 165 95 165 110C165 125 160 140 150 150" className="stroke-purple-400" strokeWidth="4" strokeLinecap="round" />
      <path d="M165 60C180 75 185 92 185 110C185 128 180 145 165 160" className="stroke-purple-300" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
};
