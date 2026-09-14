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
 *  4. **La lista fina NUNCA se trunca.** Antes cortaba en seis y decía "y 12 más", que
 *     convierte una lista de trabajo en un titular: no se puede ir cerrando de a una lo
 *     que no se ve. Cada línea trae además su monto y el enlace para comprobarla en su
 *     fuente —el trato en HubSpot, el cliente en Nexus—, porque una lista que obliga a
 *     buscar cada cosa a mano se deja de revisar a la tercera vez.
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
  type ItemInconsistencia,
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

/**
 * El detalle fino de un punto: TODAS sus líneas, con su monto y sus enlaces.
 *
 * ⚠ NO se trunca. La versión anterior cortaba en seis y ponía "y 12 más", y con eso la
 * sección dejaba de servir para lo único que existe: sentarse a cerrar los vacíos de a
 * uno. Lo que sí se hace es acotar el ALTO —a partir de ocho líneas la lista scrollea
 * dentro de su caja— para que un punto con cuarenta ventas no empuje los demás fuera de
 * la pantalla. El dato está siempre; lo que se administra es el espacio.
 */
function ListaDeItems({ items, moneda }: { items: ItemInconsistencia[]; moneda: string }) {
  const largo = items.length > 8;
  return (
    <div className="mt-2 rounded-lg border border-line bg-surface-muted/60">
      <ul
        className={`divide-y divide-line/60 ${largo ? "max-h-72 overflow-y-auto" : ""}`}
        aria-label={`Detalle: ${items.length} ${items.length === 1 ? "caso" : "casos"}`}
      >
        {items.map((it, k) => (
          <li key={k} className="px-2.5 py-1.5 flex items-start gap-2">
            <span className="text-[10px] text-fg-muted tabular-nums pt-0.5 w-6 flex-shrink-0 text-right">
              {k + 1}.
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] text-fg-secondary break-words min-w-0">{it.texto}</span>
                {it.monto !== undefined && (
                  <span className="text-[11px] tabular-nums text-fg ml-auto whitespace-nowrap">
                    {fmtMonto(it.monto, moneda)}
                  </span>
                )}
              </div>
              {it.nota && <p className="text-[10px] text-fg-muted mt-0.5 break-words">{it.nota}</p>}
              {it.enlaces && it.enlaces.length > 0 && (
                <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-0.5">
                  {it.enlaces.map((e) => (
                    <a
                      key={e.url}
                      href={e.url}
                      // Los enlaces a HubSpot salen de la app; los de Nexus también abren
                      // aparte, para no perder la lista a medio revisar.
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-brand hover:underline"
                    >
                      {e.etiqueta} ↗
                    </a>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {largo && (
        <p className="px-2.5 py-1 text-[10px] text-fg-muted border-t border-line">
          {items.length} casos — la lista scrollea, no se corta.
        </p>
      )}
    </div>
  );
}

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
              <span className="text-fg-secondary">{fmtMonto(resumen.montoTotal, moneda)} en juego</span>. El total
              cuenta cada peso una sola vez: las líneas marcadas «ya contado arriba» miran la misma plata desde otro
              ángulo. Ordenados por lo que mueven; cada uno desaparece de acá cuando el dato se corrige.
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
                      {/* Sin esta marca, sumar la columna a mano da un número mayor que el
                          titular y parece que el titular está mal. Es al revés. */}
                      {x.yaContadoEn && (
                        <span className="ml-1.5 text-[10px] text-fg-muted font-normal">ya contado arriba</span>
                      )}
                    </span>
                  )}
                </div>

                <p className="text-xs text-fg-secondary leading-relaxed mt-1.5">{x.detalle}</p>

                {x.items.length > 0 && <ListaDeItems items={x.items} moneda={moneda} />}

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
