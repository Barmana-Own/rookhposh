import { useId } from 'react';

export default function PublicWaves({ brand = false, className = '' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg className={`public-waves ${className}`} viewBox="0 0 1440 360" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id + 'base'} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={brand ? '#dceaff' : '#e9e9ff'} />
          <stop offset=".5" stopColor="#f7fbff" />
          <stop offset="1" stopColor="#b9deff" />
        </linearGradient>
        <linearGradient id={id + 'wave'} x1="0" y1="0" x2="1" y2=".6">
          <stop stopColor={brand ? '#073b86' : '#c5ceff'} />
          <stop offset=".55" stopColor={brand ? '#06cce9' : '#d8f1ff'} />
          <stop offset="1" stopColor="#cceaff" />
        </linearGradient>
      </defs>
      <rect width="1440" height="360" fill={'url(#' + id + 'base)'} opacity={brand ? 1 : 0} />
      <path d="M0 210C270 40 360 85 580 220S970 400 1440 95V360H0Z" fill={'url(#' + id + 'wave)'} opacity={brand ? .85 : .42} />
      <path d="M0 260C270 110 410 170 665 285S1140 325 1440 200V360H0Z" fill="#b8e7ff" opacity=".65" />
      <path d="M0 340C225 195 405 220 635 325S1130 320 1440 255V360H0Z" fill="#eef8ff" opacity=".7" />
      <path d="M0 205C270 35 360 80 580 215S970 395 1440 90M0 340C225 195 405 220 635 325S1130 320 1440 255" stroke="#fff" strokeWidth="1.5" fill="none" opacity=".9" />
      {brand && <path d="M825 0C1050 30 1170 210 1440 78V0Z" fill="#043673" opacity=".9" />}
    </svg>
  );
}
