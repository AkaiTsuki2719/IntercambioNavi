export const FIGURAS = [
  "cipres", "farol", "campana", "estrella", "pascua", "vela", "regalo",
] as const;

export type Figura = (typeof FIGURAS)[number];

/** Los siete dorsos. Trazo dorado de línea, sin muñecos de nieve. */
export function Figura({ nombre, className }: { nombre: Figura; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      {trazos[nombre]}
    </svg>
  );
}

const trazos: Record<Figura, React.ReactNode> = {
  cipres: (
    <>
      <path d="M50 13 L34 41 H66 Z" />
      <path d="M50 33 L28 62 H72 Z" />
      <path d="M50 52 L22 82 H78 Z" />
      <path d="M50 82 V91" />
      <path d="M40 91 H60" />
    </>
  ),
  estrella: (
    <path d="M50 14 L58.8 37.9 L84.2 38.9 L64.3 54.6 L71.2 79.1 L50 65 L28.8 79.1 L35.7 54.6 L15.8 38.9 L41.2 37.9 Z" />
  ),
  farol: (
    <>
      <path d="M41 18 A9 9 0 0 1 59 18" />
      <path d="M31 25 H69" />
      <rect x="37" y="25" width="26" height="48" rx="4" />
      <path d="M40 73 V80" />
      <path d="M60 73 V80" />
      <path d="M30 80 H70" />
      <path d="M50 40 C44 48 44 58 50 62 C56 58 56 48 50 40 Z" />
    </>
  ),
  campana: (
    <>
      <path d="M50 15 V22" />
      <path d="M33 68 C33 44 41 41 41 31 A9 9 0 0 1 59 31 C59 41 67 44 67 68" />
      <path d="M29 68 H71" />
      <circle cx="50" cy="77" r="5" />
    </>
  ),
  pascua: (
    <>
      {[0, 60, 120, 180, 240, 300].map((g) => (
        <ellipse key={g} cx="50" cy="27" rx="8.5" ry="18"
          transform={g ? `rotate(${g} 50 50)` : undefined} />
      ))}
      <circle cx="50" cy="50" r="4.5" />
    </>
  ),
  regalo: (
    <>
      <rect x="26" y="46" width="48" height="34" rx="3" />
      <rect x="21" y="35" width="58" height="12" rx="3" />
      <path d="M50 35 V80" />
      <path d="M50 35 C41 26 32 26 32 32 C32 37 42 36 50 35 Z" />
      <path d="M50 35 C59 26 68 26 68 32 C68 37 58 36 50 35 Z" />
    </>
  ),
  vela: (
    <>
      <path d="M50 21 C43 30 43 39 50 44 C57 39 57 30 50 21 Z" />
      <path d="M50 44 V49" />
      <rect x="39" y="49" width="22" height="33" rx="3" />
      <path d="M32 82 H68" />
    </>
  ),
};