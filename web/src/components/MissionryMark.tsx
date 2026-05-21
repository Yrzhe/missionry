// Missionry brand mark: a mission hub (ring + center node) coordinating three agents.
// Renders in currentColor so it adapts to its container (paper on the dark logo box).
export function MissionryMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" aria-hidden="true" focusable="false">
      <circle cx="128" cy="128" r="74" fill="none" stroke="currentColor" strokeWidth="12" />
      <circle cx="128" cy="128" r="13" fill="currentColor" />
      <circle cx="128" cy="84" r="16" fill="currentColor" />
      <circle cx="96" cy="170" r="16" fill="currentColor" />
      <circle cx="160" cy="170" r="16" fill="currentColor" />
    </svg>
  );
}
