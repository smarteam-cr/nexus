"use client";

/**
 * components/canvas/RevisionDeLaPropuesta.tsx — LA BARRA DE REVISIÓN de la propuesta de fases.
 *
 * E1 del plan «una sola propuesta del cronograma» (2026-09-24). Reemplaza a la franja
 * `ProposalGlobalStrip` y a los recuadros «Sugerencia» / filas fantasma que vivían DENTRO del Gantt:
 * la propuesta se revisa en UN solo modo, con UN botón que alterna «Ver como estaba antes» ↔
 * «Ver la propuesta» (el mismo Gantt, en el mismo lugar), una lista numerada con casillas y el
 * cierre antes → después. Nada se aplica solo: «Aplicar todo» / «Aplicar N de M» o «Descartar».
 *
 * ⛔ DEVUELVE HERMANOS, NO UN CONTENEDOR: la barra fija, la lista y el diálogo. Quien la usa los pone
 * en el MISMO bloque que el Gantt (CronogramaCanvas, `revision.contenedorRef`). Un elemento `sticky`
 * no sale de su bloque padre: envuelta en su propia <section>, la barra se iba con la sección apenas
 * se bajaba al Gantt, y el botón que alterna y «Aplicar» dejaban de estar a mano justo mientras se
 * miraban las filas de abajo (revisión de E1, 2026-09-24).
 *
 * Solo pinta: la lista, los estados, el cierre y la magnitud salen de `resumir`
 * (lib/timeline/borrador.ts) y el estado de la pantalla, de `useBorradorDelCronograma`.
 * Tokens semánticos SIEMPRE (info = lo que cambia, success = lo nuevo, warn = lo que choca).
 */
import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/timeline/weeks";
import { redactarResumenDeCambios } from "@/lib/timeline/magnitud-propuesta";
import {
  fraseDelCierre,
  LINEA_DEL_CLIENTE,
  pideConfirmacion,
  TEXTO_VER_ANTES,
  TEXTO_VER_PROPUESTA,
  textoDeAplicar,
  type ResumenDelBorrador,
  type VistaDelBorrador,
} from "@/lib/timeline/borrador";

export default function RevisionDeLaPropuesta({
  resumen,
  vista,
  onAlternar,
  onMarcar,
  onAplicar,
  onDescartar,
  enCurso,
  encadenado,
  cierreFijado,
  barraRef,
}: {
  resumen: ResumenDelBorrador;
  vista: VistaDelBorrador;
  onAlternar: () => void;
  onMarcar: (clave: string, incluir: boolean) => void;
  onAplicar: () => void;
  onDescartar: () => void;
  /** Aplicando o descartando: los dos botones y las casillas se apagan hasta que termine. */
  enCurso: "aplicar" | "descartar" | null;
  /** Esta pantalla sigue sola con las tareas al resolverla (paso 1 de 2 de «Regenerar todo»). */
  encadenado: boolean;
  /** El cierre fijado a mano (Tanda K), YYYY-MM-DD, o null: aplicar no lo toca. */
  cierreFijado: string | null;
  barraRef: RefObject<HTMLDivElement | null>;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const { items, marcadas, aplicables, total, choques, magnitud, bloqueo, origen, observaciones } = resumen;
  const delContexto = origen === "contexto";
  const otroCronograma = magnitud.esCronogramaNuevo;
  const trabajando = enCurso !== null;
  const textoDelBoton = textoDeAplicar(marcadas, aplicables);
  const pedirAplicar = () => (pideConfirmacion(resumen) ? setConfirmar(true) : onAplicar());
  const cierre = fraseDelCierre(resumen, cierreFijado);

  return (
    <>
      {/* ── LA BARRA FIJA: qué es, cómo mirarla, qué pasa con el cliente y los botones ──
          `id`: el ancla del botón «Revisar N cambios» del encabezado. */}
      <div
        id="cronograma-propuesta"
        ref={barraRef}
        role="region"
        aria-label="Propuesta de cambios de fases"
        className={cn(
          "sticky top-0 z-20 scroll-mt-24 rounded-xl border px-3 py-2 space-y-1.5 shadow-sm",
          /* Ámbar = «esto merece tu atención», nunca rojo: el modelo es aditivo, no se borra nada. */
          otroCronograma ? "border-warn-line bg-warn-surface" : "border-info-line bg-info-surface",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-xs font-bold uppercase tracking-wider", otroCronograma ? "text-warn-ink" : "text-info-ink")}>
            {otroCronograma
              ? `La IA propone otro cronograma — ${plural(total, "cambio", "cambios")}`
              : `La IA propone ${plural(total, "cambio de fases", "cambios de fases")}`}
          </span>
          <span className="text-xs text-fg-muted">
            {delContexto ? "de las reuniones y notas que elegiste" : "del último handoff"} · las tareas y sus estados no se tocan
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* UN botón, con el texto de lo que vas a ver al apretarlo. Sin `aria-pressed`: con un
                texto que cambia, el lector anunciaría «Ver la propuesta, presionado». */}
            <Button size="sm" variant="secondary" onClick={onAlternar}>
              {vista === "propuesta" ? TEXTO_VER_ANTES : TEXTO_VER_PROPUESTA}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={pedirAplicar}
              disabled={trabajando || marcadas === 0 || bloqueo !== null}
              title={marcadas === 0 ? "No hay ningún cambio marcado: si no quieres ninguno, descarta la propuesta" : undefined}
            >
              {enCurso === "aplicar" ? "Aplicando…" : textoDelBoton}
            </Button>
            <Button size="sm" variant="secondary" onClick={onDescartar} disabled={trabajando}>
              {enCurso === "descartar" ? "Descartando…" : "Descartar"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-fg-secondary">{cierre}</p>
        <p className="text-xs font-semibold text-fg">{LINEA_DEL_CLIENTE}</p>
        {vista === "antes" ? (
          <p className="text-xs text-fg-muted">
            Estás viendo el cronograma actual y puedes seguir editándolo. Si cambias algo que la propuesta también
            cambia, ese cambio queda fuera (⚠).
          </p>
        ) : (
          <p className="text-xs text-fg-muted">
            Estás viendo la propuesta, solo para leer: las filas marcadas son las que cambian.
          </p>
        )}
      </div>

      {/* ── LA LISTA: numerada, con casillas, lo que la IA notó y el aviso de «otro cronograma».
          No es fija: una lista larga no puede tapar el Gantt. ── */}
      <section aria-label="Cambios propuestos" className="rounded-xl border border-line bg-surface px-3 py-2 space-y-2">
        {encadenado && delContexto && (
          <p className="text-xs font-semibold text-info-ink">
            Paso 1 de 2 · Aplica o descarta la propuesta y después armo las tareas.
          </p>
        )}
        {bloqueo && <p className="text-xs font-semibold text-warn-ink">{bloqueo}</p>}

        {/* EL AVISO (Tanda J): una propuesta que rehace el plan no puede llegar disfrazada de N
            cambios sueltos. */}
        {otroCronograma && (
          <div className="space-y-1 rounded-lg border border-warn-line bg-warn-surface px-2.5 py-2">
            <p className="text-xs text-fg-secondary leading-relaxed">
              La diferencia es tanta que esto es prácticamente un cronograma nuevo:{" "}
              {delContexto
                ? "salió de las reuniones y notas que elegiste."
                : "salió de un handoff con más contexto que el que armó el cronograma actual."}
            </p>
            <ul className="text-xs text-fg-secondary space-y-0.5">
              {magnitud.motivos.map((m) => (
                <li key={m}>· {m}</li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted leading-relaxed">
              Aplicar no borra nada: las fases que la IA no volvió a nombrar quedan como están, y las tareas y sus
              estados no se tocan.
            </p>
          </div>
        )}

        {choques > 0 && (
          <p className="text-xs text-warn-ink">
            ⚠ {choques === 1 ? "1 cambio choca" : `${choques} cambios chocan`} con lo que editaste a mano después de la
            propuesta: {choques === 1 ? "queda fuera" : "quedan fuera"} y lo tuyo no se toca.
          </p>
        )}

        <ol className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
          {items.map((it) => {
            const seAplica = it.estado === "aplica";
            const sePuedeMarcar = it.estado === "aplica" || it.estado === "excluido";
            return (
              <li key={it.clave} className="flex items-start gap-2">
                <span className="w-6 flex-shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-fg-muted">
                  {it.numero}.
                </span>
                <input
                  type="checkbox"
                  className="mt-0.5 flex-shrink-0 accent-brand"
                  checked={seAplica}
                  disabled={trabajando || !sePuedeMarcar}
                  onChange={(e) => onMarcar(it.clave, e.target.checked)}
                  aria-label={`Incluir el cambio ${it.numero}`}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p
                    className={cn(
                      "text-xs break-words",
                      seAplica ? "text-fg" : "text-fg-muted",
                      it.estado === "ya-esta" && "line-through",
                    )}
                  >
                    {it.titulo}
                  </p>
                  {it.aviso && (
                    <p className={cn("text-xs", it.estado === "choque" ? "text-warn-ink" : "text-success-ink")}>{it.aviso}</p>
                  )}
                  {/* El motivo es interno (cita la reunión o la nota): nunca llega a la fase ni al cliente. */}
                  {it.motivo && (
                    <p className="text-xs text-fg-muted leading-relaxed">
                      <span className="font-semibold text-fg-secondary">Por qué (solo lo ves tú):</span> {it.motivo}
                    </p>
                  )}
                  {it.detalle.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-semibold text-info-ink">Ver el antes y el después</summary>
                      <dl className="mt-1 space-y-1 rounded border border-line bg-surface px-2 py-1.5">
                        {it.detalle.map((f) => (
                          <div key={f.etiqueta} className="grid grid-cols-[5rem_1fr] gap-x-2">
                            <dt className="font-semibold text-fg-muted">{f.etiqueta}</dt>
                            <dd className="min-w-0 break-words text-fg-secondary">
                              <span className="text-fg-muted line-through">{f.antes}</span>
                              <span className="mx-1 text-fg-muted">→</span>
                              <span className="text-fg">{f.despues}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Lo que la IA notó y NO puede aplicar sola: se lee y se decide a mano. Interno. */}
        {observaciones.length > 0 && (
          <div className="space-y-0.5 border-t border-line pt-1.5">
            <p className="text-xs font-semibold text-fg-secondary">La IA también notó (no se aplica sola):</p>
            <ul className="text-xs text-fg-muted space-y-0.5">
              {observaciones.map((o, i) => (
                <li key={i}>· {o}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Cuando lo MARCADO es otro cronograma (`pideConfirmacion`), marcado entero o no: para un ajuste
          chico, confirmar sería la fricción que enseña a apretar sin leer.
          ⚠ variant="default": el rojo prometería un borrado que no ocurre. */}
      <ConfirmDialog
        open={confirmar}
        variant="default"
        title="¿Aplicar el cronograma que propone la IA?"
        confirmLabel={textoDelBoton}
        loading={enCurso === "aplicar"}
        onCancel={() => setConfirmar(false)}
        onConfirm={() => {
          setConfirmar(false);
          onAplicar();
        }}
        description={
          <>
            <span className="block">
              Se {marcadas === 1 ? "aplica el cambio marcado" : `aplican los ${marcadas} cambios marcados`} de una sola
              vez: {redactarResumenDeCambios(resumen.magnitudDeLoMarcado)}. {cierre}
            </span>
            <span className="block mt-2">
              No se borra ninguna fase ni ninguna tarea: las tareas y sus estados quedan como están, y las fases nuevas
              nacen vacías. Después puedes seguir editando el cronograma a mano.
            </span>
          </>
        }
      />
    </>
  );
}
