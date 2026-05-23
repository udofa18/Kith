import React from 'react';

interface KithLogoProps {
  className?: string;
  size?: number;
}

export default function KithLogo({ className = "", size = 32 }: KithLogoProps) {
  return (
    <img 
      src="/logo.jpg" 
      alt="Kith Logo" 
      width={size} 
      height={size} 
      className={`${className} object-contain`}
      referrerPolicy="no-referrer"
    />
  );
}
