const NAVY = "#0B2158";
const NAVY_SOFT = "#1E4A96";
const BUTTON = "#1E3A8C";
const RED = "#E10600";
const PAGE = "#F4F6FA";

export { NAVY, NAVY_SOFT, BUTTON, RED, PAGE };

export function StoltMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="6" fill={RED} />
      <text
        x="16"
        y="23"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="22"
        fontWeight="700"
      >
        S
      </text>
    </svg>
  );
}

export function StoltWordmark() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        background: "#fff",
        borderRadius: 22,
        padding: "6px 12px 6px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", letterSpacing: 0.1 }}>Stock Flow</span>
      <StoltMark size={22} />
    </div>
  );
}
