import { useId } from "react";
import { motion } from "framer-motion";

export default function RadialMeter({
  value,
  size = 96,
  strokeWidth = 8,
  label,
  hero = false,
  suffix = "",
  ariaLabel,
}) {
  const gradientId = useId();
  const clamped = Math.max(0, Math.min(100, value ?? 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className={`radialMeter ${hero ? "radialMeter--hero" : ""}`}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="radialMeterSvg"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ff37d0" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="radialMeterCenter" aria-hidden={ariaLabel ? "true" : undefined}>
        <span className="radialMeterValue">
          {clamped}
          {suffix}
        </span>
      </div>
      {label && <div className="radialMeterLabel">{label}</div>}
    </div>
  );
}
