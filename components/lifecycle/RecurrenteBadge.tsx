/**
 * components/lifecycle/RecurrenteBadge.tsx
 *
 * Chip "Servicio recurrente" — el tag `recurrente` que infiere el handoff, legible
 * en todas las superficies donde se referencia el proyecto (portal CS, cronograma,
 * Cobranza, kickoff). Se alimenta del booleano `recurrent` del ciclo de vida, no del
 * array crudo de tags. Server-safe (sin estado): render puro.
 */
export default function RecurrenteBadge({
  recurrent,
  size = "sm",
}: {
  recurrent: boolean;
  size?: "sm" | "xs";
}) {
  if (!recurrent) return null;
  const cls = size === "xs" ? "text-[9px] px-1.5 py-0" : "text-[10px] px-1.5 py-0.5";
  return (
    <span
      className={`inline-flex items-center rounded border font-medium text-teal-700 bg-teal-500/10 border-teal-500/25 ${cls}`}
      title="Servicio de continuidad (recurrente) — inferido del handoff. Ciclo de vida corto."
    >
      Recurrente
    </span>
  );
}
