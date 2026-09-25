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
 *
 * E2a (2026-09-25): la propuesta de «Regenerar todo» trae también TAREAS (las que se crean y las
 * pendientes de la IA que se quitan). Van debajo de la lista de fases, agrupadas por fase
 * (`TareasDeLaPropuesta`), y la barra suma una segunda línea con el estado de la corrida que las arma
 * (`LineaDeLasTareas`): «Armando las tareas…», o «Faltan…» / «No se pudieron armar…» con el botón
 * para pedirlas. Si aplicar QUITA tareas, se confirma y el diálogo lo dice.
 *
 * E2c P3 (2026-09-25): si el CSE quita un cambio de fase, las tareas de esa fase se recalculan solas.
 * La barra suma la línea del RECÁLCULO (`recalculo`), debajo de la de las tareas: en qué está, y con
 * permiso «Recalcular las tareas» / «Volver a intentar» (`onRecalcular`) y, si falló, «Aplicar de todos
 * modos» (`onForzar`), que SIEMPRE confirma con el mismo diálogo en otro modo. Aplicar espera mientras
 * haya fases desfasadas sin forzar (el bloqueo lo dice la línea, no dos veces).
 *
 * E3 P3 (2026-09-25): lo que se marca y desmarca se guarda en el servidor y se ve en cualquier
 * computadora (lo hace el hook: la barra solo llama `onMarcar`). Una fase que se quita y se queda con lo
 * que tiene avance lo dice debajo (`it.nota`).
 */
import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import { ACCION_APLICAR_DE_TODOS_MODOS, textoDeAplicarDeTodosModos, type RecalculoEnPantalla } from "@/lib/timeline/recalculo-de-tareas";
import {
  fraseDelCierre,
  hayCambiosDeFasesAplicables,
  LINEA_DEL_CLIENTE,
  pideConfirmacion,
  resumenDeLaConfirmacion,
  TEXTO_VER_ANTES,
  TEXTO_VER_PROPUESTA,
  textoDeAplicar,
  textoDeLaConfirmacion,
  tituloDeLaBarra,
  tituloDeLoQueNoto,
  type ResumenDelBorrador,
  type VistaDelBorrador,
} from "@/lib/timeline/borrador";
import LineaDeLasTareas, { type TareasEnPantalla } from "./LineaDeLasTareas";
import TareasDeLaPropuesta from "./TareasDeLaPropuesta";

export default function RevisionDeLaPropuesta({
  resumen,
  vista,
  onAlternar,
  onMarcar,
  onMarcarVarios,
  onAplicar,
  onDescartar,
  desde,
  onArmarTareas,
  tareas,
  recalculo = null,
  onRecalcular,
  onForzar,
  enCurso,
  cierreFijado,
  barraRef,
}: {
  resumen: ResumenDelBorrador;
  vista: VistaDelBorrador;
  onAlternar: () => void;
  onMarcar: (clave: string, incluir: boolean) => void;
  /** La casilla de un grupo de tareas: todas las de una fase de una vez. */
  onMarcarVarios: (claves: readonly string[], incluir: boolean) => void;
  onAplicar: () => void;
  onDescartar: () => void;
  /** De dónde salió la propuesta, en palabras («desde el handoff», «desde «Regenerar» en «X»»…).
   *  E2b: lo arma quien la usa con `desdeDeLaPropuesta(deDondeViene(…))`; antes la barra solo
   *  distinguía «contexto» de «el último handoff», que ya era falso para una de una fase. */
  desde: string;
  /** «Armar las tareas» / «Volver a intentar»: pide el paso 2 sobre ESTA propuesta. Sin él (quien no
   *  tiene permiso de generar o regenerar el cronograma), la línea informa sin botón. */
  onArmarTareas?: () => void;
  /** El estado de las tareas de la propuesta (lo calcula el servidor), o null si no espera tareas
   *  (el handoff y el formato viejo). */
  tareas: TareasEnPantalla | null;
  /** E2c: el recálculo de las tareas de las fases desfasadas (qué se ve), o null si no hay ninguna. */
  recalculo?: RecalculoEnPantalla | null;
  /** E2c: «Recalcular las tareas» / «Volver a intentar». Sin él (sin permiso), la línea informa y dice
   *  la salida que sí hay: desmarcarlas. */
  onRecalcular?: () => void;
  /** E2c: fuerza esas fases desfasadas («Aplicar de todos modos»); `[]` las suelta. */
  onForzar?: (fases: readonly string[]) => void;
  /** Aplicando o descartando: los dos botones y las casillas se apagan hasta que termine. */
  enCurso: "aplicar" | "descartar" | null;
  /** El cierre fijado a mano (Tanda K), YYYY-MM-DD, o null: aplicar no lo toca. */
  cierreFijado: string | null;
  barraRef: RefObject<HTMLDivElement | null>;
}) {
  /* UN solo diálogo, en dos modos: «aplicar» (lo de siempre) y «forzar» («Aplicar de todos modos», que
     aplica tareas armadas para otra forma de la fase: siempre confirma). */
  const [confirmar, setConfirmar] = useState<null | "aplicar" | "forzar">(null);
  const { items, grupos, marcadas, aplicables, choques, magnitud, bloqueo, observaciones } = resumen;
  /* E2b (2026-09-25): se fue la chapa «Paso 1 de 2 · después, las tareas» (y la prop `encadenado`).
     Era de la cadena vieja de dos pasos, que ya no existe: aplicar o descartar nunca sigue solo con
     las tareas (si no llegaron, la línea suelta las ofrece después). */
  const otroCronograma = magnitud.esCronogramaNuevo;
  const trabajando = enCurso !== null;
  const textoDelBoton = textoDeAplicar(marcadas, aplicables);
  const pedirAplicar = () => (pideConfirmacion(resumen) ? setConfirmar("aplicar") : onAplicar());
  const forzando = confirmar === "forzar";
  const cierre = fraseDelCierre(resumen, cierreFijado);
  const lineaDeTareas = tareas && tareas.estado !== "listas" ? tareas : null;

  return (
    <>
      {/* ── LA BARRA FIJA: qué es, cómo mirarla, qué pasa con el cliente y los botones ──
          `id`: el ancla del botón «Revisar N cambios» del encabezado. */}
      <div
        id="cronograma-propuesta"
        ref={barraRef}
        role="region"
        aria-label="Propuesta de cambios del cronograma"
        className={cn(
          "sticky top-0 z-20 scroll-mt-24 rounded-xl border px-3 py-2 space-y-1 shadow-sm",
          /* Ámbar = «esto merece tu atención», nunca rojo: el modelo es aditivo, no se borra nada. */
          otroCronograma ? "border-warn-line bg-warn-surface" : "border-info-line bg-info-surface",
        )}
      >
        {/* ⭐ MENOS TEXTO (Elías, 2026-09-24: «creo que hay mucho texto»). La barra dice tres cosas:
            qué propone y de dónde salió, cuánto se corre el cierre, y que el cliente no ve nada
            todavía. Lo demás se dice solo cuando hace falta: qué vista es y si se puede editar va en
            el `title` del botón que alterna (el texto del botón ya dice a cuál vas), que las tareas
            no se tocan va en la confirmación. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-xs font-bold uppercase tracking-wider", otroCronograma ? "text-warn-ink" : "text-info-ink")}>
            {tituloDeLaBarra(resumen)}
          </span>
          {/* El origen, sin afirmar de qué: «las reuniones y notas que elegiste» mentía cuando lo único
              que había eran las instrucciones adicionales. */}
          <span className="text-xs text-fg-muted">{desde}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* UN botón, con el texto de lo que vas a ver al apretarlo. Sin `aria-pressed`: con un
                texto que cambia, el lector anunciaría «Ver la propuesta, presionado». */}
            <Button
              size="sm"
              variant="secondary"
              onClick={onAlternar}
              title={
                vista === "propuesta"
                  ? "Estás viendo la propuesta, solo para leer: las filas marcadas son las que cambian."
                  : "Estás viendo el cronograma actual y puedes editarlo. Si cambias algo que la propuesta también cambia, ese cambio queda fuera (⚠)."
              }
            >
              {vista === "propuesta" ? TEXTO_VER_ANTES : TEXTO_VER_PROPUESTA}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={pedirAplicar}
              disabled={trabajando || marcadas === 0 || bloqueo !== null}
              title={bloqueo ?? (marcadas === 0 ? "No hay ningún cambio marcado: si no quieres ninguno, descarta la propuesta" : undefined)}
            >
              {enCurso === "aplicar" ? "Aplicando…" : textoDelBoton}
            </Button>
            <Button size="sm" variant="secondary" onClick={onDescartar} disabled={trabajando}>
              {enCurso === "descartar" ? "Descartando…" : "Descartar"}
            </Button>
          </div>
        </div>
        {/* La segunda línea: en qué están las tareas de esta propuesta (armándose, faltan o fallaron).
            Con las tareas listas, o sin tareas que esperar, no hay línea. */}
        {lineaDeTareas && (
          <LineaDeLasTareas
            estado={lineaDeTareas.estado}
            fase={lineaDeTareas.fase}
            motivo={lineaDeTareas.motivo}
            onAccion={onArmarTareas}
            conCambiosDeFases={hayCambiosDeFasesAplicables(items)}
            trabajando={trabajando}
          />
        )}
        {/* E2c: la línea del recálculo de las fases desfasadas. ⛔ Nunca con `onArmarTareas`: armaría las
            tareas de TODAS las fases. «Aplicar de todos modos» fuerza las que fallaron y confirma. */}
        {recalculo && (
          <LineaDeLasTareas
            estado={null}
            fase={null}
            motivo={null}
            recalculo={recalculo}
            onAccion={onRecalcular}
            onSecundaria={
              onForzar && recalculo.que === "fallo"
                ? () => {
                    onForzar(recalculo.fases.map((f) => f.id));
                    setConfirmar("forzar");
                  }
                : undefined
            }
            trabajando={trabajando}
          />
        )}
        <p className="text-xs text-fg-secondary">
          {cierre} <span className="text-fg-muted">{LINEA_DEL_CLIENTE}</span>
        </p>
      </div>

      {/* ── LA LISTA: numerada, con casillas, lo que la IA notó y el aviso de «otro cronograma».
          No es fija: una lista larga no puede tapar el Gantt. ── */}
      <section aria-label="Cambios propuestos" className="rounded-xl border border-line bg-surface px-3 py-2 space-y-2">
        {/* El de las desfasadas ya lo dice la línea del recálculo: no dos veces. Los demás, sí. */}
        {bloqueo && !(recalculo && resumen.bloqueoPorDesfasadas) && <p className="text-xs font-semibold text-warn-ink">{bloqueo}</p>}

        {/* EL AVISO (Tanda J): una propuesta que rehace el plan no puede llegar disfrazada de N
            cambios sueltos. Corto a propósito: los motivos son la parte que se lee. */}
        {otroCronograma && (
          <div className="space-y-1 rounded-lg border border-warn-line bg-warn-surface px-2.5 py-2">
            <p className="text-xs font-semibold text-fg-secondary">Es prácticamente un cronograma nuevo:</p>
            <ul className="text-xs text-fg-secondary space-y-0.5">
              {magnitud.motivos.map((m) => (
                <li key={m}>· {m}</li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">
              {resumen.borraAlgo
                ? "Aplicar quita solo las tareas que se nombran acá; lo que tiene avance o escribiste a mano no se toca."
                : "Aplicar no borra nada: las fases y las tareas que no se nombran quedan como están."}
            </p>
          </div>
        )}

        {choques > 0 && (
          <p className="text-xs text-warn-ink">
            ⚠ {choques === 1 ? "1 cambio choca" : `${choques} cambios chocan`} con lo que editaste a mano:{" "}
            {choques === 1 ? "queda fuera" : "quedan fuera"}.
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
                  {/* E3: una fase que se quita y se queda con lo que tiene avance o se cargó a mano. */}
                  {it.nota && <p className="text-xs text-fg-muted">{it.nota}</p>}
                  {/* El motivo es interno (cita la reunión o la nota): nunca llega a la fase ni al cliente.
                      Hasta dos líneas, sin rótulo: el texto completo queda en el `title`. */}
                  {it.motivo && (
                    <p className="text-xs text-fg-muted line-clamp-2" title={it.motivo}>
                      {it.motivo}
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

        {/* Las tareas, un renglón por fase (siguen la numeración de arriba), plegadas. */}
        <TareasDeLaPropuesta
          grupos={grupos}
          onMarcar={onMarcar}
          onMarcarVarios={onMarcarVarios}
          trabajando={trabajando}
          recalculo={recalculo}
        />

        {/* Lo que la IA notó y NO puede aplicar sola: se lee y se decide a mano. Interno. Plegado: son
            notas para quien quiera leerlas, no parte de lo que se aplica (y con 5 ocupaban más que la
            propuesta). */}
        {observaciones.length > 0 && (
          <details className="border-t border-line pt-1.5 text-xs">
            <summary className="cursor-pointer font-semibold text-fg-secondary">
              {tituloDeLoQueNoto(observaciones.length)}
            </summary>
            <ul className="mt-1 text-fg-muted space-y-0.5">
              {observaciones.map((o, i) => (
                <li key={i}>· {o}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Cuando lo MARCADO es otro cronograma, cuando QUITA tareas o cuando las tareas no llegaron
          (`pideConfirmacion`), marcado entero o no: para un ajuste chico, confirmar sería la fricción
          que enseña a apretar sin leer.
          ⚠ El rojo («destructive») SOLO si aplicar quita tareas: sin eso prometería un borrado que no
          ocurre.
          E2c: el MISMO diálogo confirma «Aplicar de todos modos» (modo «forzar»): dice qué pasa con las
          tareas de cada fase forzada. Cancelar suelta las fases forzadas. */}
      <ConfirmDialog
        open={confirmar !== null}
        variant={resumen.borraAlgo ? "destructive" : "default"}
        title={forzando ? "¿Aplicar sin recalcular?" : "¿Aplicar el cronograma que propone la IA?"}
        confirmLabel={forzando ? ACCION_APLICAR_DE_TODOS_MODOS : textoDelBoton}
        loading={enCurso === "aplicar"}
        onCancel={() => {
          if (forzando) onForzar?.([]);
          setConfirmar(null);
        }}
        onConfirm={() => {
          setConfirmar(null);
          onAplicar();
        }}
        description={
          <>
            {/* Fases y tareas contadas por separado (revisión de E2a: con solo tareas decía «de una sola
                vez: .», y las que se crean no aparecían en ningún lado). */}
            <span className="block">
              {resumenDeLaConfirmacion(resumen)} {cierre}
            </span>
            {forzando &&
              textoDeAplicarDeTodosModos(resumen.forzadas).map((renglon) => (
                <span key={renglon} className="block mt-2">
                  {renglon}
                </span>
              ))}
            <span className="block mt-2">{textoDeLaConfirmacion(resumen)}</span>
          </>
        }
      />
    </>
  );
}
