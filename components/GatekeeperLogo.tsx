import React from 'react';

export const GatekeeperLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg 
      viewBox="0 0 100 120" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
      aria-label="Gatekeeper Logo"
    >
      {/* 1. LOCK SHACKLE (Top) */}
      <path d="M30 35 V 25 A 20 20 0 0 1 70 25 V 35" />

      {/* 2. SHIELD BODY (Main Outline) */}
      {/* Shield shape with rounded top corners and pointed bottom */}
      <path d="M20 35 H 80 A 4 4 0 0 1 84 39 V 55 C 84 85 50 105 50 105 C 50 105 16 85 16 55 V 39 A 4 4 0 0 1 20 35 Z" />

      {/* 3. CIRCUIT LINES (Tech/Connection feel) */}
      {/* Left trace */}
      <path d="M28 55 L 36 55 L 40 62" strokeWidth="2" />
      <circle cx="28" cy="55" r="2.5" fill="currentColor" stroke="none" />
      
      {/* Right trace */}
      <path d="M72 55 L 64 55 L 60 62" strokeWidth="2" />
      <circle cx="72" cy="55" r="2.5" fill="currentColor" stroke="none" />

      {/* Bottom traces */}
      <path d="M32 85 L 40 75" strokeWidth="2" />
      <circle cx="32" cy="85" r="2.5" fill="currentColor" stroke="none" />
      
      <path d="M68 85 L 60 75" strokeWidth="2" />
      <circle cx="68" cy="85" r="2.5" fill="currentColor" stroke="none" />

      {/* 4. KEYHOLE (Center) */}
      <path d="M50 56 A 6 6 0 1 1 50 68 A 6 6 0 0 1 50 56 Z" /> 
      <path d="M50 68 V 76" /> 

      {/* 5. UMBRELLA (Small protection symbol at bottom) */}
      <g transform="translate(50, 92)">
         {/* Canopy */}
         <path d="M-6 -2 Q 0 -6 6 -2" />
         {/* Shaft */}
         <path d="M0 -2 V 4" />
         {/* Handle Hook */}
         <path d="M0 4 Q 2 6 3 4" strokeWidth="2" />
      </g>
    </svg>
  );
};
