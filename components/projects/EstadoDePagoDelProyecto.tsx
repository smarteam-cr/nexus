"use client";

/**
 * components/projects/EstadoDePagoDelProyecto.tsx — cómo va el pago del proyecto, en la ficha (2026-11-13).
 *
 * Para Customer Success: al día, con cuotas vencidas, o —la regla de los 15 días— la primera cuota sin pagar, con lo que
 * hay que hacer (hablar con el líder para pausar las sesiones o la implementación). Sin montos: el CSE no ve la plata.
 * Un proyecto sin nada en Cobranza no muestra nada. Regla: lib/cobranza/estado-de-pago.ts.
 *
 * Dos formas, como los otros avisos del proyecto: `panel` (la columna derecha) y `compacto` (una línea arriba del
 * contenido, con el panel cerrado).
 */
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/fetch-json";
import { textoDelEstado, type EstadoDePago } from "@/lib/cobranza/estado-de-pago";

const TONO = {
  ok: { caja: "border-line bg-surface", titulo: "text-fg-secondary", detalle: "text-fg-muted", linea: "border-line bg-surface-muted text-fg-secondary" },
  warn: { caja: "border-warn-line bg-warn-surface", titulo: "text-warn-ink", detalle: "text-warn-ink/80", linea: "border-warn-line bg-warn-surface text-warn-ink" },
  danger: { caja: "border-danger-line bg-danger-surface", titulo: "text-danger-ink", detalle: "text-danger-ink/80", linea: "border-danger-line bg-danger-surface text-danger-ink" },
} as const;

export default function EstadoDePagoDelProyecto({ projectId, variante }: { projectId: string; variante: "panel" | "compacto" }) {
  // Guardado con su proyecto: al cambiar de proyecto, el estado del anterior no se pinta mientras llega el nuevo.
  const [leido, setLeido] = useState<{ projectId: string; estado: EstadoDePago } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchJson<{ estado: EstadoDePago }>(`/api/projects/${encodeURIComponent(projectId)}/estado-de-pago`)
      .then((r) => {
        if (vivo) setLeido({ projectId, estado: r.estado });
      })
      // Es un dato de costado: si falla, la ficha sigue igual.
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId]);

  const t = leido && leido.projectId === projectId ? textoDelEstado(leido.estado) : null;
  if (!t) return null;
  const tono = TONO[t.tono];

  if (variante === "compacto") {
    // Al día no ocupa una línea arriba del documento: solo lo que pide algo.
    if (t.tono === "ok") return null;
    return (
      <div role="note" className={`border-b px-6 py-2 text-[13px] ${tono.linea}`}>
        <span className="font-semibold">Pagos: {t.titulo}.</span>
        {t.detalle ? ` ${t.detalle}` : ""}
      </div>
    );
  }
  return (
    <div role="note" className={`rounded-xl border px-4 py-3 ${tono.caja}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Estado de pago</p>
      <p className={`mt-1 text-sm font-semibold ${tono.titulo}`}>{t.titulo}</p>
      {t.detalle && <p className={`mt-1 text-xs leading-relaxed ${tono.detalle}`}>{t.detalle}</p>}
    </div>
  );
}
