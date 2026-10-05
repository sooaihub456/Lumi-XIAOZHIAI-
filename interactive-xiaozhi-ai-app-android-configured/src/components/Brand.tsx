export function MoriMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <ellipse key={angle} cx="20" cy="10.5" rx="5.7" ry="9.5" fill="currentColor" transform={`rotate(${angle} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="4.2" fill="var(--mark-center, #fafbf8)" />
    </svg>
  );
}

export function LumiIcon({ size = 32, color = '#aabfa1' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="14" fill="#edf1e8" />
      <path d="M20 10V6" stroke="#718b69" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="23" cy="6" rx="4" ry="2" transform="rotate(-25 23 6)" fill={color} />
      <rect x="5" y="15" width="5" height="11" rx="2.5" fill={color} />
      <rect x="30" y="15" width="5" height="11" rx="2.5" fill={color} />
      <rect x="9" y="10" width="22" height="22" rx="8" fill="#fdfdf7" />
      <rect x="11.5" y="14" width="17" height="13" rx="5" fill="#354a3e" />
      <path d="M16 19v2M24 19v2" stroke="#e2f2ca" strokeWidth="2" strokeLinecap="round" />
      <path d="M18.3 23q1.7 1.5 3.4 0" stroke="#e2f2ca" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}