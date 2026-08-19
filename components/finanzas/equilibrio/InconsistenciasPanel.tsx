"use client";

/**
 * components/finanzas/equilibrio/InconsistenciasPanel.tsx
 *
 * La sección de cierre del reporte: todo lo que no cuadra, en una sola lista, para poder
 * sentarse con el CFO y resolverlo sin ir a buscar cada cosa a su rincón.
 *
 * Tres decisiones de diseño, las tres por el mismo motivo — que la lista se USE:
 *
 *  1. **Ordenada por la plata que mueve**, no por tipo ni alfabéticamente. Lo primero de
 *     la lista es siempre lo que más cuesta ignorar.
 *  2. **Cada línea dice quién la resuelve.** Sin esa columna, una reunión de revisión
 *     termina con doce puntos y ningún dueño.
 *  3. **Se puede filtrar por dueño.** El CFO abre "lo que decide dirección" y ve sus
 *     siete, no las trece.
 *
 * Lo que NO hace: guardar estado. Un punto se cierra arreglando el dato, y entonces
 * desaparece solo de la lista en la próxima carga. Un check manual acá sería una segunda
 * verdad que envejece — y la lista dejaría de ser confiable el día que alguien marque
 * algo como hecho sin haberlo hecho.
 */
import { useMemo, useState } from "react";
import { Tabs } from "@/components/ui";
import { fmtMonto } from "@/components/cobranza/format";
import {
  resumirInconsistencias,
  type Inconsistencia,
  type QuienResuelve,
} from "@/lib/finanzas/inconsistencias";

const SEVERIDAD_CLS: Record<Inconsistencia["severidad"], string> = {
  ALTA: "text-red-600 bg-red-500/10 border-red-500/30",
  MEDIA: "text-warn-ink bg-warn-surface border-warn-line",
  BAJA: "text-fg-muted bg-surface-muted border-line",
};
const SEVERIDAD_LABEL: Record<Inconsistencia["severidad"], string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Nota",
};
const RESUELVE_LABEL: Record<QuienResuelve, string> = {
  DIRECCION: "Lo decide dirección",
  COBRANZA: "Lo carga cobranza",
  SISTEMA: "Lo arregla el sistema",
};

type Filtro = "todas" | QuienResuelve;

export default function InconsistenciasPanel({
  inconsistencias,
  moneda,
}: {
  inconsistencias: Inconsistencia[];
  moneda: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const resumen = useMemo(() => resumirInconsistencias(inconsistencias), [inconsistencias]);
  const visibles = useMemo(
    () => (filtro === "todas" ? inconsistencias : inconsistencias.filter((x) => x.resuelve === filtro)),
    [inconsistencias, filtro],
  );

  if (inconsistencias.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="px-4 py-2.5 bg-surface-muted border-b border-line">
          <h3 className="text-sm font-medium text-fg">Qué falta para cerrar el año</h3>
        </div>
        <p className="px-4 py-6 text-xs text-fg-muted">
          No hay inconsistencias abiertas: las ventas cuadran con la cobranza, los meses están completos y no
          quedan decisiones pendientes.
        </p>
      </div>
    );
  }

  const cuenta = (q: QuienResuelve) => inconsistencias.filter((x) => x.resuelve === q).length;

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="px-4 py-3 bg-surface-muted border-b border-line">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-fg">Qué falta para cerrar el año</h3>
            <p className="text-[11px] text-fg-muted mt-0.5">
              {resumen.cuantas} puntos abiertos · {resumen.porSeveridad.ALTA} de prioridad alta ·{" "}
              <span className="text-fg-secondary">{fmtMonto(resumen.montoTotal, moneda)} en juego</span>. Ordenados
              por la plata que mueve. Cada uno desaparece de acá cuando el dato se corrige.
            </p>
          </div>
          <Tabs
            className="ml-auto"
            aria-label="Filtrar por quién resuelve"
            variant="pill"
            size="sm"
            value={filtro}
            onChange={(v) => setFiltro(v as Filtro)}
            items={[
              { key: "todas", label: "Todas", count: inconsistencias.length },
              { key: "DIRECCION", label: "Decide dirección", count: cuenta("DIRECCION") },
              { key: "COBRANZA", label: "Carga cobranza", count: cuenta("COBRANZA") },
            ]}
          />
        </div>
      </div>

      <ol className="divide-y divide-line">
        {visibles.map((x, i) => (
          <li key={x.codigo} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="text-[11px] text-fg-muted tabular-nums pt-0.5 w-5 flex-shrink-0">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${SEVERIDAD_CLS[x.severidad]}`}
                  >
                    {SEVERIDAD_LABEL[x.severidad]}
                  </span>
                  <span className="text-sm text-fg font-medium">{x.titulo}</span>
                  {x.montoEnJuego !== null && (
                    <span className="text-sm tabular-nums text-fg-secondary ml-auto whitespace-nowrap">
                      {fmtMonto(x.montoEnJuego, moneda)}
                    </span>
                  )}
                </div>

                <p className="text-xs text-fg-secondary leading-relaxed mt-1.5">{x.detalle}</p>

                {x.items.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {x.items.slice(0, 6).map((it, k) => (
                      <li key={k} className="text-[11px] text-fg-muted">
                        · {it}
                      </li>
                    ))}
                    {x.items.length > 6 && (
                      <li className="text-[11px] text-fg-muted">y {x.items.length - 6} más</li>
                    )}
                  </ul>
                )}

                <div className="flex flex-wrap items-baseline gap-2 mt-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
                      x.resuelve === "DIRECCION"
                        ? "border-brand/30 bg-brand/10 text-brand"
                        : "border-line text-fg-muted"
                    }`}
                  >
                    {RESUELVE_LABEL[x.resuelve]}
                  </span>
                  <span className="text-[11px] text-fg-secondary">{x.queHacer}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {visibles.length === 0 && (
        <p className="px-4 py-6 text-xs text-fg-muted">Nada pendiente en esta categoría.</p>
      )}
    </div>
  );
}
