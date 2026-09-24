const SIZE_MAP = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 88,
  hero: 120,
};

function BrickAlphaIcon({ size }) {
  const radius = Math.max(4, Math.round(size * 0.16));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="48" height="48" rx={radius} fill="#15171C" />
      <path
        d="M10 18.5C10 16.57 11.57 15 13.5 15H34.5C36.43 15 38 16.57 38 18.5V34.5C38 36.43 36.43 38 34.5 38H13.5C11.57 38 10 36.43 10 34.5V18.5Z"
        fill="#F2C230"
      />
      <rect x="14" y="10" width="8" height="7" rx="2.25" fill="#F2C230" />
      <rect x="26" y="10" width="8" height="7" rx="2.25" fill="#F2C230" />
      <path
        d="M15 31.5L20.5 26L24.3 29.8L32.75 21.35"
        stroke="#15171C"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M28.6 21.25H32.85V25.5"
        stroke="#15171C"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLogo({
  variant = "icon",
  size = "md",
  className = "",
  showWordmark = false,
  showTagline = false,
}) {
  const dimension = SIZE_MAP[size] || SIZE_MAP.md;

  if (variant === "full" || showWordmark) {
    const height = dimension;

    return (
      <div className={`brandLogoLockup ${className}`.trim()} aria-label="Brick Alpha">
        <BrickAlphaIcon size={height} />
        <div className="brandLogoTextStack">
          <div className="brandLogoWordmark" style={{ fontSize: Math.max(15, height * 0.3) }}>
            <span className="brandLogoName">Brick</span>
            <span className="brandLogoName brandLogoNameAccent">Alpha</span>
          </div>
          {showTagline ? <small className="brandLogoTagline">Investment intelligence for LEGO® collectors</small> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`brandLogoIcon ${className}`.trim()}
      style={{ width: dimension, height: dimension }}
      aria-label="Brick Alpha"
      role="img"
    >
      <BrickAlphaIcon size={dimension} />
    </div>
  );
}

export function AuthDashboardPreview() {
  return (
    <div className="authDashboardPreview" aria-hidden="true">
      <div className="authDashboardPreviewChrome">
        <span />
        <span />
        <span />
      </div>
      <div className="authDashboardPreviewBody">
        <div className="authDashboardPreviewHeader">
          <div className="authDashboardPreviewEyebrow" />
          <div className="authDashboardPreviewTitle" />
        </div>
        <div className="authDashboardPreviewKpis">
          <div className="authDashboardPreviewKpi"><span /><strong /></div>
          <div className="authDashboardPreviewKpi"><span /><strong /></div>
          <div className="authDashboardPreviewKpi"><span /><strong /></div>
          <div className="authDashboardPreviewKpi"><span /><strong /></div>
        </div>
        <div className="authDashboardPreviewChart">
          <div className="authDashboardPreviewChartLine" />
        </div>
        <div className="authDashboardPreviewRows">
          <div className="authDashboardPreviewRow" />
          <div className="authDashboardPreviewRow" />
          <div className="authDashboardPreviewRow short" />
        </div>
      </div>
      <div className="authDashboardPreviewGlow" />
    </div>
  );
}

export const AUTH_FEATURE_CARDS = [
  { id: "portfolio", label: "Collection Intelligence" },
  { id: "scores", label: "Set Analysis" },
  { id: "retirement", label: "Retirement Signals" },
  { id: "market", label: "Market Intelligence" },
];
