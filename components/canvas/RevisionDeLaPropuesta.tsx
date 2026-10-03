"use client";

/**
 * components/canvas/RevisionDeLaPropuesta.tsx — LA BARRA DE REVISIÓN de la propuesta del cronograma.
 *
 * E1 del plan «una sola propuesta del cronograma» (2026-09-24). Reemplaza a la franja
 * `ProposalGlobalStrip` y a los recuadros «Sugerencia» / filas fantasma que vivían DENTRO del Gantt:
 * la propuesta se revisa en UN solo modo, con UN botón que alterna «Ver como estaba antes» ↔
 * «Ver la propuesta» (el mismo Gantt, en el mismo lugar), y el cierre antes → después. Nada se aplica
 * solo: «Aplicar todo» / «Aplicar N de M» o «Descartar».
 *
 * ⛔ DEVUELVE HERMANOS, NO UN CONTENEDOR: la barra fija, el bloque de abajo y los diálogos. Quien la usa los
 * pone en el MISMO bloque que el Gantt (CronogramaCanvas, `revision.contenedorRef`). Un elemento `sticky`
 * no sale de su bloque padre: envuelta en su propia <section>, la barra se iba con la sección apenas
 * se bajaba al Gantt, y el botón que alterna y «Aplicar» dejaban de estar a mano justo mientras se
 * miraban las filas de abajo (revisión de E1, 2026-09-24).
 *
 * ⭐ L3 P3d (2026-09-26) · LA PROPUESTA SE DECIDE EN EL GANTT. Se fueron la lista numerada con casillas y los
 * grupos de tareas (`TareasDeLaPropuesta`, borrado): cada cambio tiene su casilla en su fila del Gantt. La barra
 * queda en dos partes:
 *   · LO FIJO, una línea: el título, «Siguiente número» (recorre los números del Gantt; atajos n y p), «Ver como
 *     estaba antes», «Descartar» y «Aplicar». Debajo de 640 px, el título, «Descartar» y «Aplicar»;
 *   · LO DE ABAJO, que no se fija: de dónde viene, las líneas de las tareas y del recálculo, el bloqueo, el cierre
 *     con lo que ve el cliente, los totales («Aplicas N de M cambios», en `aria-live`), el aviso de «otro
 *     cronograma» (hasta L4), los choques (solo si hay), el avance sin revisar y lo que notó la IA. Debajo de
 *     640 px, plegado tras «Detalles».
 *
 * M1 (2026-09-27) · «DESCARTAR» AL LADO DE «APLICAR». Pedido de Elías: abajo, después del mensaje y de «Más», no se
 * encontraba. Sube a lo fijo, pegado a «Aplicar» y visible en todos los anchos, y SIEMPRE pregunta con su propio
 * diálogo: a un clic del botón principal, y descartar borra la propuesta sin copia (DELETE /timeline/proposal). Hay UN
 * solo lugar para esa decisión: abajo quedan los totales, solos.
 *
 * ⭐ L4 (2026-09-26) · EL MENSAJE DE ARRIBA. El título y el tono salen del NIVEL de la propuesta entera («Rehace casi
 * todas las pendientes», ámbar solo en «casi todo»), no de la magnitud; lo de abajo suma el mensaje: hasta 5 líneas
 * (el cierre y su causa, contra lo prometido y el handoff, las tareas, el material, las atrasadas) y «Más» (dónde se
 * concentran, la fase terminada que recibe, los atrasos cargados aparte, de dónde salen los cambios de fases). El
 * cierre ya no va en su línea (lo dice el mensaje): lo que ve el cliente queda solo, debajo. El aviso «Es prácticamente
 * un cronograma nuevo» se fue: lo dicen el título («Cronograma casi nuevo») y «Más» (por qué).
 *
 * M4 P4e (2026-09-27) · LA SEMANA QUE CAMBIÓ. Si lo atrasado se reprogramó desde una semana que ya pasó, abajo, antes de
 * los choques, el aviso para volver a generarla (`mensaje.avisoDeLaSemana`, en ámbar).
 *
 * L6 (2026-09-26) · EL PORQUÉ CON FUENTES NUEVAS. Debajo de las líneas del mensaje, la frase general de la explicación
 * con sus chips (si la hay; «(de cuando se generó)» si el chat editó la propuesta después); en «Más», UNA vez, cuántas
 * fases cambian sin una reunión, nota o instrucción nueva que las nombre (lib/timeline/explicacion-de-la-propuesta.ts).
 *
 * Solo pinta: los estados y el cierre salen de `resumir` (lib/timeline/borrador.ts); el mensaje, de
 * lib/timeline/mensaje-de-la-propuesta.ts; los textos nuevos, de lib/timeline/vista-de-la-propuesta.ts; el estado de
 * la pantalla, de `useBorradorDelCronograma`. Tokens semánticos SIEMPRE (info = lo que cambia, success = lo nuevo,
 * warn = lo que choca).
 *
 * E2a (2026-09-25): la barra suma la línea del estado de la corrida que arma las tareas (`LineaDeLasTareas`):
 * «Faltan…» / «No se pudieron armar…» con el botón para pedirlas. Si aplicar QUITA tareas, se confirma y el
 * diálogo lo dice. L2 (2026-09-26): mientras se arman las tareas la barra no se monta (`modoDeLaPropuesta`).
 *
 * E2c P3 (2026-09-25): si el CSE quita un cambio de fase, las tareas de esa fase se recalculan solas.
 * La barra suma la línea del RECÁLCULO (`recalculo`): en qué está, y con permiso «Recalcular las tareas» /
 * «Volver a intentar» (`onRecalcular`) y, si falló, «Aplicar de todos modos» (`onForzar`), que SIEMPRE
 * confirma con el mismo diálogo en otro modo. Aplicar espera mientras haya fases desfasadas sin forzar (el
 * bloqueo lo dice la línea, no dos veces) y, mientras tanto, dice solo «Aplicar».
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
  textoDelBotonDeAplicar,
  textoDeLaConfirmacion,
  tituloDeLoQueNoto,
  type ResumenDelBorrador,
  type VistaDelBorrador,
} from "@/lib/timeline/borrador";
import { fraseGeneral, lineaSinMaterial, type ExplicacionEnPantalla } from "@/lib/timeline/explicacion-de-la-propuesta";
import { TEXTO_DE_LAS_FUENTES, type MensajeDeLaPropuesta } from "@/lib/timeline/mensaje-de-la-propuesta";
import {
  ACCION_REVISAR_AVANCE,
  observacionesParaMostrar,
  textoDelAvance,
  TEXTO_DEL_DESCARTE,
  TEXTO_DESCARTAR,
  textoDeLosChoques,
  textoDeLosTotales,
  textoDelSiguiente,
  TITULO_DEL_DESCARTE,
  TITULO_DEL_SIGUIENTE,
  type PosicionDelSiguiente,
} from "@/lib/timeline/vista-de-la-propuesta";
import LineaDeLasTareas, { type TareasEnPantalla } from "./LineaDeLasTareas";

export default function RevisionDeLaPropuesta({
  resumen,
  mensaje,
  explicacion = null,
  vista,
  onAlternar,
  onSiguiente,
  posicion,
  onAplicar,
  onDescartar,
  desde,
  onArmarTareas,
  tareas,
  recalculo = null,
  onRecalcular,
  onForzar,
  avance = null,
  onRevisarAvance,
  enCurso,
  cierreFijado,
  barraRef,
}: {
  resumen: ResumenDelBorrador;
  /** L4: el mensaje de arriba (`mensajeDeLaPropuesta`): el título y el tono por el nivel, sus líneas y «Más». */
  mensaje: MensajeDeLaPropuesta;
  /** L6: el porqué con fuentes nuevas guardado en la propuesta (`explicacionEnPantalla`), o null. */
  explicacion?: ExplicacionEnPantalla | null;
  vista: VistaDelBorrador;
  onAlternar: () => void;
  /** L3 P3d: «Siguiente número»: despliega la fase del próximo número del Gantt y enfoca su casilla (en la vista
   *  «antes», primero pasa a la propuesta). */
  onSiguiente: () => void;
  /** L3 P3d: dónde está «Siguiente número» (el texto del botón). */
  posicion: PosicionDelSiguiente;
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
  /** L3 P3d: hay un avance detectado sin revisar (y si toca tareas que la propuesta quita o cambia), o null. */
  avance?: { hay: boolean; seCruza: boolean } | null;
  /** L3 P3d: abre el cajón «Lo que detectó el agente». */
  onRevisarAvance?: () => void;
  /** Aplicando o descartando: los botones se apagan hasta que termine (las casillas del Gantt también). */
  enCurso: "aplicar" | "descartar" | null;
  /** El cierre fijado a mano (Tanda K), YYYY-MM-DD, o null: aplicar no lo toca. */
  cierreFijado: string | null;
  barraRef: RefObject<HTMLDivElement | null>;
}) {
  /* El diálogo de aplicar, UNO en dos modos: «aplicar» (lo de siempre) y «forzar» («Aplicar de todos modos», que
     aplica tareas armadas para otra forma de la fase: siempre confirma). */
  const [confirmar, setConfirmar] = useState<null | "aplicar" | "forzar">(null);
  /* M1: «Descartar» tiene SU diálogo, que se abre siempre (está a un clic de «Aplicar» y no deja copia). */
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  /* Debajo de 640 px, lo de abajo va plegado tras «Detalles» (en pantallas anchas se ve siempre). */
  const [detalles, setDetalles] = useState(false);
  const { items, marcadas, choques, bloqueo } = resumen;
  /* L4: ámbar = «esto merece tu atención» (el nivel «casi todo» de la propuesta ENTERA), nunca rojo. Lo decide el
     mensaje, no la magnitud: una propuesta que quita casi todas las pendientes también lo merece. */
  const atencion = mensaje.tono === "warn";
  const trabajando = enCurso !== null;
  // Revisión de E2c: con tareas que esperan su recálculo, sin «N de M» (todavía no cuentan).
  const textoDelBoton = textoDelBotonDeAplicar(resumen);
  const pedirAplicar = () => (pideConfirmacion(resumen) ? setConfirmar("aplicar") : onAplicar());
  const forzando = confirmar === "forzar";
  const cierre = fraseDelCierre(resumen, cierreFijado);
  const lineaDeTareas = tareas && tareas.estado !== "listas" ? tareas : null;
  /* Lo que notó la IA, como se lee (sin la jerga del paso 1): el título cuenta lo que se muestra. */
  const observaciones = observacionesParaMostrar(resumen.observaciones);
  const textoDelSiguienteBoton = textoDelSiguiente(posicion);
  /* L6: la frase general (con sus chips) y, en «Más», la línea de las fases sin material nuevo, una vez. */
  const general = fraseGeneral(explicacion);
  const sinMaterial = explicacion ? lineaSinMaterial(explicacion.explicacion) : null;

  /* Los dos botones que en pantallas chicas pasan a «Detalles»: UNO de cada, pintado donde se ve. */
  const botonSiguiente = () =>
    textoDelSiguienteBoton && (
      <Button size="sm" variant="secondary" onClick={onSiguiente} title={TITULO_DEL_SIGUIENTE}>
        {textoDelSiguienteBoton}
      </Button>
    );
  /* UN botón, con el texto de lo que vas a ver al apretarlo. Sin `aria-pressed`: con un texto que cambia, el lector
     anunciaría «Ver la propuesta, presionado». */
  const botonAlternar = () => (
    <Button
      size="sm"
      variant="secondary"
      onClick={onAlternar}
      title={
        vista === "propuesta"
          ? "Estás viendo la propuesta: cada cambio se marca o se desmarca en su fila."
          : "Estás viendo el cronograma actual y puedes editarlo. Si cambias algo que la propuesta también cambia, ese cambio queda fuera (⚠)."
      }
    >
      {vista === "propuesta" ? TEXTO_VER_ANTES : TEXTO_VER_PROPUESTA}
    </Button>
  );

  return (
    <>
      {/* ── LO FIJO: una línea. El título, cómo recorrerla, descartar y aplicar ──
          `id`: el ancla del botón «Revisar la propuesta» del encabezado. */}
      <div
        id="cronograma-propuesta"
        ref={barraRef}
        role="region"
        aria-label="Propuesta de cambios del cronograma"
        className={cn(
          "sticky top-0 z-20 scroll-mt-24 rounded-xl border px-3 py-2 shadow-sm",
          atencion ? "border-warn-line bg-warn-surface" : "border-info-line bg-info-surface",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* L4: el título dice QUÉ cambia, sin cuentas (lo que se aplica lo dicen los totales, abajo). */}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider",
              atencion ? "text-warn-ink" : "text-info-ink",
            )}
            title={mensaje.titulo}
          >
            {mensaje.titulo}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-2 sm:inline-flex">
              {botonSiguiente()}
              {botonAlternar()}
            </span>
            {/* M1: visible en todos los anchos, pegado a «Aplicar». «secondary», no «destructive»: el color fuerte sigue
                siendo de «Aplicar», y «destructive» pinta un rojo crudo que la barra no usa. El rojo va en el diálogo. */}
            <Button size="sm" variant="secondary" onClick={() => setConfirmarDescarte(true)} disabled={trabajando}>
              {enCurso === "descartar" ? "Descartando…" : TEXTO_DESCARTAR}
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
          </div>
        </div>
      </div>

      {/* ── LO DE ABAJO: no es fijo (no tapa el Gantt). Debajo de 640 px, tras «Detalles». ── */}
      <div className="rounded-xl border border-line bg-surface px-3 py-2">
        <button
          type="button"
          onClick={() => setDetalles((d) => !d)}
          aria-expanded={detalles}
          className="text-xs font-semibold text-fg-secondary sm:hidden"
        >
          Detalles
        </button>
        <div className={cn("space-y-1.5 sm:block", detalles ? "mt-1.5 block" : "hidden")}>
          <div className="flex flex-wrap items-center gap-2 sm:hidden">
            {botonSiguiente()}
            {botonAlternar()}
          </div>
          {/* El origen, sin afirmar de qué: «las reuniones y notas que elegiste» mentía cuando lo único
              que había eran las instrucciones adicionales. */}
          <p>
            <span className="text-xs text-fg-muted">{desde}</span>
          </p>
          {/* En qué están las tareas de esta propuesta (faltan o fallaron). Con las tareas listas, o sin tareas que
              esperar, no hay línea. */}
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
          {/* El de las desfasadas ya lo dice la línea del recálculo: no dos veces. Los demás, sí. */}
          {bloqueo && !(recalculo && resumen.bloqueoPorDesfasadas) && <p className="text-xs font-semibold text-warn-ink">{bloqueo}</p>}
          {/* L4 · EL MENSAJE: hasta 5 líneas, en su orden (el cierre y su causa primero), completas: sin recorte. Lo que
              pide atención (⚠) va en ámbar, con su palabra. */}
          <div className="space-y-0.5 text-xs">
            {mensaje.lineas.map((l, k) => (
              <p key={l} className={k === 0 ? "font-semibold text-fg" : l.startsWith("⚠") ? "text-warn-ink" : "text-fg-secondary"}>
                {l}
              </p>
            ))}
            {/* 2026-10-02 · La propuesta contra la fecha límite y la duración vendida: aparte de las 5 líneas, para
                que ninguna se pierda. Avisa; no frena «Aplicar» (decisión de Elías). */}
            {mensaje.avisoDeLimites && (
              <p className={mensaje.avisoDeLimites.startsWith("⚠") ? "font-semibold text-warn-ink" : "text-success-ink"}>
                {mensaje.avisoDeLimites}
              </p>
            )}
            {general && (
              <p className="flex flex-wrap items-center gap-1.5 text-fg-secondary">
                <span>
                  <span className="font-semibold">Por qué:</span> {general.frase}
                </span>
                {general.fuentes.map((f) => (
                  <span key={f} className="rounded border border-info-line bg-info-surface px-1.5 py-px text-[10px] text-info-ink">
                    {f}
                  </span>
                ))}
              </p>
            )}
          </div>
          {/* «Más», plegado: dónde se concentran, la fase terminada que recibe, los atrasos cargados (en su frase aparte)
              y de dónde salen los cambios de fases (solo lo verificado, como chip). */}
          {(mensaje.detalle.length > 0 || mensaje.fuentes.length > 0 || sinMaterial) && (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-fg-secondary">Más</summary>
              <div className="mt-1 space-y-0.5">
                {mensaje.detalle.map((d) => (
                  <p key={d} className={d.startsWith("⚠") ? "text-warn-ink" : "text-fg-muted"}>
                    {d}
                  </p>
                ))}
                {sinMaterial && <p className="text-fg-muted">{sinMaterial}</p>}
                {mensaje.fuentes.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1.5 text-fg-muted">
                    <span>{TEXTO_DE_LAS_FUENTES}</span>
                    {mensaje.fuentes.map((f) => (
                      <span key={f.texto} className="rounded border border-info-line bg-info-surface px-1.5 py-px text-[10px] text-info-ink">
                        {f.texto}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </details>
          )}
          {/* Lo que ve el cliente, sola: el cierre lo dice el mensaje. */}
          <p className="text-xs text-fg-muted">{LINEA_DEL_CLIENTE}</p>
          {/* Lo que se aplica, con cada casilla que se toca en el Gantt (el lector lo anuncia). M1: solo; «Descartar»
              subió a lo fijo, al lado de «Aplicar». */}
          <p aria-live="polite" className="text-xs font-semibold text-fg-secondary">
            {textoDeLosTotales(resumen)}
          </p>

          {/* EL AVISO de la Tanda J («Es prácticamente un cronograma nuevo», con sus motivos) se fue en L4: una propuesta
              que rehace el plan ya no llega disfrazada de N cambios sueltos porque lo dice el título («Cronograma casi
              nuevo», en ámbar), sus motivos van en «Más» y qué se quita lo dicen el mensaje y la confirmación. */}

          {/* M4 P4e: la propuesta se reprogramó otra semana: vuelve a generarla (no se recalcula sola, rehacer tareas se
              paga). Antes de los choques. */}
          {mensaje.avisoDeLaSemana && <p className="text-xs text-warn-ink">{mensaje.avisoDeLaSemana}</p>}
          {choques > 0 && <p className="text-xs text-warn-ink">{textoDeLosChoques(choques)}</p>}

          {/* El avance sin revisar: se revisa en su cajón («Lo que detectó el agente»), no «más abajo». */}
          {avance?.hay && (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-secondary">
              <span>{textoDelAvance(avance.seCruza)}</span>
              {onRevisarAvance && (
                <button
                  type="button"
                  onClick={onRevisarAvance}
                  className="font-semibold text-info-ink underline underline-offset-2 hover:opacity-80"
                >
                  {ACCION_REVISAR_AVANCE}
                </button>
              )}
            </p>
          )}

          {/* Lo que la IA notó y NO puede aplicar sola: se lee y se decide a mano. Interno. Plegado, y sin la
              jerga del paso 1 (`observacionesParaMostrar`). */}
          {observaciones.length > 0 && (
            <details className="border-t border-line pt-1.5 text-xs">
              <summary className="cursor-pointer font-semibold text-fg-secondary">{tituloDeLoQueNoto(observaciones.length)}</summary>
              <ul className="mt-1 text-fg-muted space-y-0.5">
                {observaciones.map((o, i) => (
                  <li key={i}>· {o}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

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

      {/* M1: «Descartar» SIEMPRE confirma. Rojo (el de siempre de `ConfirmDialog`): se borra la propuesta, sin copia. */}
      <ConfirmDialog
        open={confirmarDescarte}
        title={TITULO_DEL_DESCARTE}
        description={TEXTO_DEL_DESCARTE}
        confirmLabel={TEXTO_DESCARTAR}
        loading={enCurso === "descartar"}
        onCancel={() => setConfirmarDescarte(false)}
        onConfirm={() => {
          setConfirmarDescarte(false);
          onDescartar();
        }}
      />
    </>
  );
}
