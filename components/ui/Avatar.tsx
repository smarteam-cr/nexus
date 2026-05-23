import { cn } from "@/lib/cn";

// ── Tamaños ────────────────────────────────────────────────────────────────────

const SIZE = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-11 h-11 text-base",
} as const;

// ── Colores por hash ───────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500/20 text-blue-300",
  "bg-purple-500/20 text-purple-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-brand/20 text-brand-light",
  "bg-rose-500/20 text-rose-300",
  "bg-cyan-500/20 text-cyan-300",
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function colorFor(seed: string) {
  const code = seed.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface AvatarProps {
  name: string;
  src?: string;
  size?: keyof typeof SIZE;
  /** Semilla para el color; por defecto se deriva del nombre. */
  colorSeed?: string;
  className?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

/**
 * Avatar — imagen o iniciales con color derivado por hash. Generaliza la lógica
 * de avatar que estaba duplicada inline en varias vistas.
 */
export function Avatar({ name, src, size = "md", colorSeed, className }: AvatarProps) {
  const base = cn(
    "rounded-full flex items-center justify-center font-semibold flex-shrink-0",
    SIZE[size],
    className
  );

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn(base, "object-cover")} />;
  }

  return (
    <div className={cn(base, colorFor(colorSeed ?? name))} aria-label={name}>
      {initials(name)}
    </div>
  );
}
