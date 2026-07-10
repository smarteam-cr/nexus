/**
 * components/cs/SourceChip.tsx
 *
 * Chip de PROCEDENCIA — la regla del módulo Customer Success: todo dato derivado
 * dice de dónde salió y de cuándo es ("HubSpot · hoy", "Minuta kickoff · 2 jul",
 * "Cronograma · baseline 15 jun", "sin permiso de partner"). Mismo formato que
 * CanvasSuggestion.sourceLabel ("label · fecha").
 *
 * Server-safe (sin hooks) — se usa en server components y client components.
 */
import { isStale } from "@/lib/cs/partner-state";

export type SourceTone = "ok" | "stale" | "missing";

/** "hoy" / "ayer" / "N días" / fecha corta — para el sufijo del chip. */
export function fmtChipDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "short" });
}

const TONE_CLASS: Record<SourceTone, string> = {
  ok: "text-fg-muted bg-surface-muted border-line",
  stale: "text-amber-600 bg-amber-500/10 border-amber-500/30",
  missing: "text-fg-muted bg-surface-muted border-line border-dashed",
};

export default function SourceChip({
  label,
  date,
  tone = "ok",
  staleAfterDays,
  title,
}: {
  /** Fuente ("HubSpot", "HubSpot Partner", "Cronograma", "Minuta kickoff"…). */
  label: string;
  /** ISO de cuándo es el dato — se muestra relativo ("hoy", "2 jul"). */
  date?: string | null;
  tone?: SourceTone;
  /** Si el dato es más viejo que esto (días), el chip ALARMA en ámbar (tone stale).
   *  Solo pisa el tono "ok": un "missing" explícito es un estado más fuerte.
   *  Umbrales sugeridos en STALE_AFTER_DAYS (lib/cs/partner-state). */
  staleAfterDays?: number;
  /** Tooltip opcional (ej. la fecha exacta). */
  title?: string;
}) {
  const dateStr = fmtChipDate(date);
  const effectiveTone: SourceTone =
    tone === "ok" && staleAfterDays !== undefined && isStale(date ?? null, staleAfterDays, new Date())
      ? "stale"
      : tone;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${TONE_CLASS[effectiveTone]}`}
      // hour12: false a propósito — sin esto, Node (servidor) y el navegador (cliente)
      // pueden usar espacios Unicode DISTINTOS alrededor de "a. m./p. m." (narrow
      // no-break space vs espacio normal, según la versión de ICU), lo que rompe la
      // hidratación aunque el texto se VEA idéntico. El formato 24h no tiene ese marcador.
      title={title ?? (date ? new Date(date).toLocaleString("es-CR", { hour12: false }) : undefined)}
    >
      {label}
      {dateStr && <span className="opacity-75">· {dateStr}</span>}
    </span>
  );
}
