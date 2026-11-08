"use client";

/**
 * AntesDeLaSesion — la pestaña «Preparación» de una sesión (tableros «Antes · Sesión 3», en orden y
 * por sección, 2026-10-07; se llamaba «Antes» hasta el mismo día). De arriba hacia abajo: en qué
 * estado está la guía y qué hace actualizarla, el objetivo que sugiere el agente (se usa, se edita o
 * se descarta), lo que traes de las sesiones anteriores, y la guía como agenda por bloques. Abajo,
 * plegado, qué hacer si se resiste.
 *
 * Sin formulario (2026-11-07, Elías): la sesión no pide «Cuándo», «Con quién» ni «Esta sesión». Arriba, en la cabecera,
 * solo «asociar una reunión»: de ahí salen la fecha, la duración y los participantes. Sin reunión se prepara igual, para
 * 60 minutos. El objetivo de la exploración se responde una vez, en el inicio; acá aparece solo mientras falta.
 */
import { useState } from "react";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { faltanAlCerrar, puntoQueSePregunta, listaParaProponer } from "@/lib/exploraciones/calidad";
import { esFuenteDeHipotesis } from "@/lib/exploraciones/contenido";
import { diaCorto, diaYHora } from "@/lib/exploraciones/fechas";
import {
  APERTURA_DE_BASE,
  CIERRE_DE_BASE,
  CONEXION_DE_BASE,
  ladoDeLaPregunta,
  loQueTraes,
  OBJECION,
  OBJECIONES_DE_BASE,
  POCA_APERTURA_DE_BASE,
  TRAMOS_DE_LA_SESION,
  type PestanaDeSesion,
  type PreguntaParaMostrar,
} from "@/lib/exploraciones/guia";
import { esTarjeta } from "@/lib/exploraciones/marco";
import { preguntaDeCierre, siNoSalio } from "@/lib/exploraciones/plan-de-la-guia";
import { avanceDeLaEstrategia, faltanDeLaEstrategia } from "@/lib/exploraciones/avance-del-proyecto";
import { REUNIONES } from "@/lib/exploraciones/sesion";
import { EQUIPOS } from "@/lib/exploraciones/equipos";
import { queContarle } from "@/lib/exploraciones/contarle";
import { useLienzo } from "./contexto";
import { useObjetivoDeLaSiguiente, usePreguntasDeLaAnterior } from "./LoQueQueda";
import { EtiquetaDePregunta, nombreDelPara, Rotulo, useCambiosDesdeLaGuia, useEditarLaSesion, useGuiaDeLaSesion } from "./piezas-de-la-sesion";
import { AgregarPregunta, PreguntaDeLaGuia, Quitadas, useAjustarLaGuia, useTemasDeLaGuia } from "./PreguntaDeLaGuia";
import { GuiaEnOrden } from "./GuiaEnOrden";
import { AgendaDeLaGuia, GuiaAnterior } from "./AgendaDeLaGuia";
import { ContactoPrevio } from "./ContextoDeLaPreparacion";
import { duracionDeLaSesion } from "@/lib/exploraciones/contexto-de-la-exploracion";
import {
  completaLasPreguntas,
  MAX_RESPUESTA_PARA_LA_GUIA,
  mismoTexto,
  objetivoAceptado,
  objetivoDeSmarteam,
  preguntasDeLaSesion,
  respuestasParaMandar,
  vieneDeLasRespuestas,
  type PreguntaConOpciones,
} from "@/lib/exploraciones/objetivo-y-hallazgos";
import { Input, Spinner } from "@/components/ui";
import { usePedirPreguntasDelObjetivo } from "./PreguntasDelObjetivo";
import { sugeridasVigentes } from "@/lib/exploraciones/ajustes-de-la-guia";
import { LoQueCubreLaGuia } from "./LoQueCubreLaGuia";
import { abrirElChatDeNexus } from "@/lib/nexus-chat/constantes";
import { queCubreLaGuia } from "@/lib/exploraciones/que-cubre-la-guia";
import { sugerenciasDelAsistente } from "@/lib/exploraciones/sugerencias-del-asistente";
import { QueVaPrimero } from "./QueVaPrimero";
import Segmentos from "./Segmentos";
import { lineasDe } from "./Resumen";
import { useCorrida } from "./useCorrida";
import { useSesiones } from "./useSesiones";
import { abreLaPuerta, TRAMOS_DE_ABRIR_LA_PUERTA } from "@/lib/exploraciones/como-llego";

type Vista = "orden" | "seccion";

// ── El estado de la guía ──────────────────────────────────────────────────────

/** «a, b y c». */
function enLista(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/**
 * En qué estado está la guía de la próxima sesión y qué hace el botón (Elías, 2026-10-07: «no hay
 * claridad de qué hace el CTA de rearmar guía»; antes era un botón con un título que solo se veía al
 * pasar el mouse). Tres casos: la de base (preguntas generales, sin el agente), la armada y al día, y
 * la armada pero vieja, que dice QUÉ cambió desde entonces.
 */
function EstadoDeLaGuia({ pestana }: { pestana: PestanaDeSesion }) {
  const { escala, marco, puedeEditar, guardando, alDia } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const { guia: deLaSesion, cambios: cambiosDeLaSesion } = useCambiosDesdeLaGuia(pestana);
  // La guía con el formato de antes no cuenta como guía: queda plegada abajo como «Guía anterior» (2026-11-06).
  const guia = deLaSesion?.agenda ? deLaSesion : null;
  const cambios = guia ? cambiosDeLaSesion : null;
  const armando = (corriendo && corrida?.modo === "guia") || lanzando;
  const nombre = (para: string) => nombreDelPara(para, escala, marco);

  // El objetivo de la sesión lo decide el vendedor (2026-11-08, cuarta vuelta): sin uno aceptado, el botón espera.
  const conObjetivo = objetivoAceptado(pestana.sesion?.objetivo);
  // Se armó con otro objetivo (el vendedor lo cambió después): la guía todavía es para el anterior.
  const otroObjetivo = !!guia?.objetivoAceptado && conObjetivo && !mismoTexto(guia.objetivoAceptado, pestana.sesion?.objetivo);
  /* El objetivo recién aceptado puede estar todavía en camino al servidor (y la sesión, naciendo): el botón espera a que
     salga y el pedido sale después (revisión del 2026-11-08). */
  const armar = () => void alDia().then(() => lanzar("guia"));

  let titulo: string;
  let detalle: string;
  let boton: string;
  let tono: "info" | "aviso" | "neutro";
  if (armando) {
    titulo = guia ? "El agente está rehaciendo la guía" : "El agente está armando la guía";
    detalle = corrida?.fase ?? "Empezando…";
    boton = "Armando…";
    tono = "info";
  } else if (!guia) {
    titulo = "Armar la guía";
    detalle = conObjetivo
      ? "Nexus la arma con el objetivo de arriba como la instrucción que más pesa, lo que ya se sabe y lo que quedó de la sesión anterior. Sale en bloques, cada uno con lo que hay que averiguar."
      : puedeEditar
        ? "Se habilita cuando el objetivo de la sesión, arriba, esté aceptado o escrito."
        : "Se arma cuando quien lleva la preventa acepte el objetivo de la sesión.";
    boton = "Armar la guía";
    tono = "info";
  } else if (!conObjetivo) {
    titulo = "Esta guía se armó sin un objetivo aceptado";
    detalle = "Para rehacerla, acepta o escribe el objetivo de la sesión de arriba: Nexus la arma con él.";
    boton = "Actualizar la guía";
    tono = "aviso";
  } else if (otroObjetivo) {
    titulo = "Cambiaste el objetivo: la guía todavía es para el anterior";
    detalle = `Se armó para «${guia.objetivoAceptado}». «Actualizar la guía» la rehace con el objetivo de ahora; tus ajustes a las preguntas se conservan.`;
    boton = "Actualizar la guía";
    tono = "aviso";
  } else if (cambios) {
    const partes = [
      cambios.equipo
        ? cambios.equipo.ahora
          ? `ahora la sesión es con ${EQUIPOS[cambios.equipo.ahora].nombre}: la guía todavía no pregunta como se le pregunta a ese equipo`
          : "la sesión volvió a ser con la empresa entera"
        : null,
      cambios.antesDelPlan ? "se armó antes de «Lo que ya sabemos»: no parte de lo que el cliente ya respondió" : null,
      cambios.leidoDespues?.length ? `una reunión leída después ya respondió ${enLista(cambios.leidoDespues.map(nombre))}` : null,
      cambios.respondidas.length ? `ya se respondió ${enLista(cambios.respondidas.map(nombre))}` : null,
      cambios.nuevas.length ? `ahora también falta ${enLista(cambios.nuevas.map(nombre))}` : null,
      cambios.dimensiones ? "cambiaron las dimensiones de la escala que conviene preguntar" : null,
      cambios.llevados ? `te llevaste ${cambios.llevados === 1 ? "un punto" : `${cambios.llevados} puntos`} de otra sesión que la guía todavía no ubica` : null,
    ].filter((x): x is string => !!x);
    titulo = `La guía es del ${diaCorto(guia.en)} y desde entonces cambió lo que se sabe`;
    detalle = `${partes.join("; ").replace(/^\p{Ll}/u, (c) => c.toUpperCase())}. ${
      cambios.equipo?.ahora
        ? `«Actualizar la guía» la arma para ${EQUIPOS[cambios.equipo.ahora].nombre}: cómo está armado, cómo lo miden, cómo funciona, con qué sistemas y dónde duele.`
        : cambios.antesDelPlan
          ? "«Actualizar la guía» la arma desde ahí: unas 5 preguntas, cada una en su paso, sin repreguntar lo que ya se sabe."
          : cambios.leidoDespues?.length
            ? "La guía no cambia sola para no perder tus ajustes: «Actualizar la guía» pasa eso al paso siguiente y suma lo nuevo."
            : "«Actualizar la guía» deja de preguntar lo ya respondido y suma lo nuevo."
    }`;
    boton = "Actualizar la guía";
    tono = "aviso";
  } else {
    titulo = `Guía armada por el agente el ${diaYHora(guia.en)}`;
    detalle = "Está al día con lo que se sabe. Si cambió algo que el lienzo no tiene (una nota, una instrucción), puedes volver a armarla.";
    boton = "Volver a armarla";
    tono = "neutro";
  }
  return (
    <section
      role={armando ? "status" : undefined}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border px-[18px] py-3.5",
        tono === "aviso" ? "border-warn-line bg-warn-surface" : tono === "info" ? "border-info-line bg-info-surface" : "border-line bg-surface",
      )}
    >
      <div className="min-w-0 flex-[1_1_360px] space-y-0.5">
        <p className={cn("text-sm font-semibold", tono === "aviso" ? "text-warn-ink" : "text-fg")}>{titulo}</p>
        <p className="text-[13px] leading-[1.45] text-fg-secondary">{detalle}</p>
      </div>
      {puedeEditar &&
        (tono === "neutro" ? (
          <BotonBlanco disabled={armando || corriendo || guardando || !conObjetivo} onClick={armar}>
            {boton}
          </BotonBlanco>
        ) : (
          <BotonAzul disabled={armando || corriendo || guardando || !conObjetivo} onClick={armar}>
            {boton}
          </BotonAzul>
        ))}
    </section>
  );
}

/** Lo que hace Nexus mientras corre algo que NO lanzaron las respuestas (sexta vuelta): se dice tal cual. */
const QUE_HACE_NEXUS: Record<string, string> = {
  guia: "Nexus está armando la guía…",
  leer: "Nexus está leyendo las reuniones…",
  preparar: "Nexus está preparando la primera reunión…",
  casos: "Nexus está proponiendo los casos de uso…",
  posicionar: "Nexus está ubicando a la empresa en la escala…",
};

/**
 * Las preguntas de Nexus de ESTA sesión (sexta vuelta, 2026-11-08): las de su guía o, sin guía propia, las que dejó la
 * lectura de la sesión anterior. Todas con tarjetas; nunca las de otra sesión ni las ya respondidas.
 */
function usePreguntasParaLaGuia(pestana: PestanaDeSesion): PreguntaConOpciones[] {
  const { exp } = useLienzo();
  const deLaAnterior = usePreguntasDeLaAnterior(pestana);
  const s = pestana.sesion;
  return preguntasDeLaSesion({
    pedido: exp.estado.propuesta.preguntasParaLaGuia,
    sesionId: s?.id,
    conGuiaPropia: !!(s && exp.estado.propuesta.guias[s.id]),
    deLaLecturaAnterior: deLaAnterior,
    respondidas: exp.estado.contenido.respuestasParaLaGuia ?? [],
  });
}

/**
 * Lo que Nexus necesita saber para armar la guía (2026-11-08): de 1 a 3 preguntas. Desde la quinta vuelta (Elías: «más fácil
 * de responder») cada una trae sus respuestas probables como tarjetas en una fila, que se eligen de un clic, y una cuarta
 * para escribir la tuya. Salen de la misma llamada que arma la guía. Al responder todas, la guía se rehace sola (sin objetivo
 * aceptado, las respuestas solo se guardan: se usan al armarla).
 *
 * Sexta vuelta (2026-11-08, Elías no podía responder y leía «Rehaciendo la guía con tus respuestas…» sin haber respondido):
 * las preguntas son de ESTA sesión y todas traen tarjetas (`usePreguntasParaLaGuia`). Mientras Nexus trabaja en otra cosa
 * se puede elegir igual: lo elegido queda en pantalla y se manda con el botón cuando termina (o al momento, si no hace
 * falta rehacer la guía). El texto dice lo que de verdad corre.
 */
function PreguntasDeNexus({ conObjetivo, lista }: { conObjetivo: boolean; lista: PreguntaConOpciones[] }) {
  const { exp, puedeEditar, guardando, cambiar } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const preguntas = lista.map((x) => x.pregunta);
  // Por el TEXTO de la pregunta: si llegan otras con la pantalla abierta, lo elegido no queda debajo de otra pregunta.
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [libres, setLibres] = useState<Record<string, string>>({});
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  // Mientras sale el pedido de la guía que lanzaron las respuestas (después, lo dice la corrida: `vieneDeLasRespuestas`).
  const [lanzandoLaMia, setLanzandoLaMia] = useState(false);
  if (!lista.length) return null;
  const trabajando = corriendo || lanzando;
  // Lo que apaga las tarjetas: guardar. Una corrida no: lo elegido espera en pantalla.
  const bloqueado = !puedeEditar || guardando || enviando;
  // Con objetivo, mandar rehace la guía, y no se lanza una corrida encima de otra: se manda cuando termine.
  const esperaLaCorrida = conObjetivo && trabajando;
  const opcionesDe = (p: string) => lista.find((x) => x.pregunta === p)?.opciones ?? [];

  const enviar = async (respuestas: Record<string, string>) => {
    const listas = respuestasParaMandar(preguntas, respuestas, libres);
    // Ni dos veces, ni con una corrida en curso que haya que rehacer.
    if (!listas.length || bloqueado || esperaLaCorrida) return;
    setEnviando(true);
    try {
      const ok = await cambiar([{ op: "responderParaLaGuia", respuestas: listas }], conObjetivo ? undefined : { exito: "Respuestas guardadas: Nexus las usa al armar la guía." });
      if (ok) {
        setElegidas({});
        setLibres({});
        setAbiertas({});
        // Sin objetivo aceptado la guía no se arma: las respuestas esperan a que se arme.
        if (conObjetivo) {
          setLanzandoLaMia(true);
          setEnviando(false);
          await lanzar("guia").finally(() => setLanzandoLaMia(false));
        }
      }
    } finally {
      setEnviando(false);
    }
  };
  /** Elige una respuesta; con todas respondidas, se manda sola (la guía se rehace igual que con el botón). */
  const elegir = (pregunta: string, respuesta: string) => {
    const t = respuesta.trim().slice(0, MAX_RESPUESTA_PARA_LA_GUIA);
    if (!t || bloqueado) return;
    const siguiente = { ...elegidas, [pregunta]: t };
    setElegidas(siguiente);
    if (completaLasPreguntas(preguntas, siguiente)) void enviar(siguiente);
  };
  const algunas = respuestasParaMandar(preguntas, elegidas, libres).length > 0;
  const lasMias =
    lanzandoLaMia || (corriendo && corrida?.modo === "guia" && vieneDeLasRespuestas(corrida.empezo, exp.estado.contenido.respuestasParaLaGuia ?? []));
  const queCorre = enviando
    ? "Guardando tus respuestas…"
    : !trabajando
      ? null
      : lasMias
        ? "Rehaciendo la guía con tus respuestas…"
        : `${!corriendo ? "Nexus está empezando…" : (QUE_HACE_NEXUS[corrida?.modo ?? ""] ?? "Nexus está trabajando en la preventa…")}${
            esperaLaCorrida ? " Puedes elegir tus respuestas: las mandas cuando termine." : ""
          }`;
  const TARJETA = "rounded-lg border px-3 py-2.5 text-left text-[13px] leading-[1.4] transition-colors disabled:opacity-60";

  return (
    <div className="w-full space-y-4 text-left">
      {preguntas.map((p) => {
        const opciones = opcionesDe(p);
        const elegida = elegidas[p];
        const libreAbierta = abiertas[p] || !opciones.length;
        const esLibre = !!elegida && !opciones.includes(elegida);
        return (
          <div key={p} className="space-y-2">
            <p className="text-sm font-medium text-fg">{p}</p>
            <div role="group" aria-label={p} className={cn("grid gap-2", opciones.length ? "sm:grid-cols-2 lg:grid-cols-4" : "")}>
              {opciones.map((o) => (
                <button
                  key={o}
                  type="button"
                  disabled={bloqueado}
                  aria-pressed={elegida === o}
                  onClick={() => elegir(p, o)}
                  className={cn(TARJETA, elegida === o ? "border-brand bg-info-surface font-medium text-fg" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover")}
                >
                  {o}
                </button>
              ))}
              {libreAbierta ? (
                <div className={cn("rounded-lg border px-2 py-1.5", esLibre ? "border-brand bg-info-surface" : "border-dashed border-line bg-surface")}>
                  <Input
                    autoFocus={opciones.length > 0}
                    value={libres[p] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLibres((r) => ({ ...r, [p]: v }));
                      // Escribir la tuya deja de lado la tarjeta elegida de esa pregunta (manda lo escrito).
                      setElegidas((r) => {
                        if (!r[p] || !opciones.includes(r[p])) return r;
                        const { [p]: _antes, ...resto } = r;
                        void _antes;
                        return resto;
                      });
                    }}
                    onKeyDown={(e) => {
                      // Solo Enter elige lo escrito: salir del campo no manda nada (revisión del 2026-11-08).
                      if (e.key === "Enter") elegir(p, libres[p] ?? "");
                    }}
                    maxLength={MAX_RESPUESTA_PARA_LA_GUIA}
                    disabled={bloqueado}
                    placeholder={opciones.length ? "Tu respuesta y Enter" : "Tu respuesta, en una línea, y Enter"}
                    aria-label={`Tu respuesta a: ${p}`}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  disabled={bloqueado}
                  onClick={() => setAbiertas((r) => ({ ...r, [p]: true }))}
                  className={cn(TARJETA, "border-dashed border-line bg-surface text-fg-muted hover:bg-surface-hover")}
                >
                  Otra respuesta…
                </button>
              )}
            </div>
          </div>
        );
      })}
      {puedeEditar && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* Lo que de verdad corre (sexta vuelta): «con tus respuestas» solo si lo lanzaron ellas. */}
          {queCorre && (
            <span role="status" className="flex items-center gap-2 text-[13px] text-fg-secondary">
              <Spinner size="sm" color="border-brand" />
              {queCorre}
            </span>
          )}
          {/* Siempre a mano: manda lo elegido y lo escrito. Con una corrida en curso, espera a que termine. */}
          {!enviando && !lasMias && (
            <BotonBlanco disabled={bloqueado || esperaLaCorrida || !algunas} onClick={() => void enviar(elegidas)}>
              {!conObjetivo ? "Guardar respuestas" : "Responder y armar la guía"}
            </BotonBlanco>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A qué objetivo de la exploración sirve la sesión (2026-11-08, quinta vuelta: «que pese y se note»): el de Smarteam y el
 * ajuste de la empresa, en una línea debajo del objetivo de la sesión. La guía los lleva en su pedido, después del de la sesión.
 */
function SirveAlObjetivoDeLaExploracion() {
  const { exp, marco, sesion } = useLienzo();
  const ajuste = exp.estado.contenido.contexto?.objetivo.trim();
  return (
    <p className="-mt-2 px-1 text-xs leading-[1.5] text-fg-muted">
      <span className="font-semibold text-fg-secondary">Sirve al objetivo de la exploración:</span> {objetivoDeSmarteam(marco.clave)}
      {ajuste ? (
        <>
          {" "}
          <span className="font-semibold text-fg-secondary">Para {exp.empresa.nombre}:</span> {ajuste}
        </>
      ) : null}{" "}
      <button type="button" className="text-brand hover:underline" onClick={sesion.irAlInicio}>
        Verlo en el inicio
      </button>
    </p>
  );
}

/**
 * El espacio de la guía mientras no hay (2026-11-08, Elías: «se tiene que notar mucho que falta»): grande, en el lugar de la
 * guía. Dice qué falta (aceptar el objetivo de la sesión, o armarla con el botón de arriba), se ve mientras Nexus la arma y
 * muestra lo que le falta saber (sus preguntas). Desde la cuarta vuelta (2026-11-08) la guía no se arma sola.
 */
function EspacioDeLaGuia({ pestana, preguntas }: { pestana: PestanaDeSesion; preguntas: PreguntaConOpciones[] }) {
  const { corrida, corriendo, lanzando } = useCorrida();
  const conObjetivo = objetivoAceptado(pestana.sesion?.objetivo);
  const armando = (corriendo && corrida?.modo === "guia") || lanzando;
  const fallo = !armando && corrida?.modo === "guia" && corrida.estado === "ERROR" ? corrida.error : null;
  const conReunion = !!(pestana.sesion?.evento || pestana.sesion?.conQuien?.length);
  return (
    <section
      aria-label={`La guía de la sesión ${pestana.numero}`}
      role={armando ? "status" : undefined}
      className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-warn-line bg-warn-surface px-6 py-10 text-center"
    >
      {armando ? (
        <>
          <Spinner size="lg" color="border-brand" />
          <p className="text-lg font-semibold text-fg">Nexus está armando la guía de la sesión {pestana.numero}</p>
          <p className="text-[13px] text-fg-secondary">{corrida?.fase ?? "Empezando…"}</p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-warn-ink">
            {conObjetivo ? `Falta la guía de la sesión ${pestana.numero}` : `Falta aceptar el objetivo de la sesión ${pestana.numero}`}
          </p>
          <p className="max-w-xl text-[13px] leading-[1.5] text-fg-secondary">
            {!conObjetivo
              ? `La guía no se arma hasta que aceptes o escribas el objetivo de la sesión, arriba. Es tu oportunidad de decirle a Nexus cómo estructurar la sesión.${
                  preguntas.length ? " Mientras, puedes responder arriba lo que Nexus necesita saber: lo usa al armarla." : ""
                }`
              : preguntas.length
                ? "Nexus necesita saber algo para armarla: respóndelo arriba, junto al objetivo, y la guía se arma con tus respuestas."
                : `Ármala con «Armar la guía», arriba. Nexus usa tu objetivo como la instrucción que más pesa${
                    conReunion ? ", y los participantes y la duración de la reunión" : ", para 60 minutos (si asocias la reunión del calendario, toma su duración)"
                  }.`}
          </p>
          {fallo && <p className="max-w-xl text-[13px] text-danger-ink">La última vez no se pudo armar: {fallo}</p>}
        </>
      )}
    </section>
  );
}

// ── El objetivo ───────────────────────────────────────────────────────────────

/** «Si sale bien…»: cuántos de los puntos que faltan para proponer cubre la guía. */
function siSaleBien(faltan: number, cubre: number): string {
  if (faltan === 0) return "La preventa ya está lista para proponer: esta sesión confirma y profundiza.";
  if (cubre === faltan) return `Si sale bien, la preventa queda lista para proponer: la guía cubre ${faltan === 1 ? "el punto que falta" : `los ${faltan} puntos que faltan`}.`;
  return `La guía cubre ${cubre} de los ${faltan} puntos que faltan para proponer.`;
}

/** En un proyecto: cuánto de la estrategia que falta cubre la guía. */
function siSaleBienEnElProyecto(faltan: number, cubre: number): string {
  if (faltan === 0) return "La estrategia del cliente ya está: esta sesión profundiza en la escala.";
  if (cubre === faltan) return `Si sale bien, la estrategia del cliente queda completa: la guía cubre ${faltan === 1 ? "lo que falta" : `las ${faltan} tarjetas que faltan`}.`;
  return `La guía cubre ${cubre} de las ${faltan} tarjetas de la estrategia que faltan.`;
}

/**
 * El objetivo de la sesión. Al guardar uno nuevo en la próxima sesión (escrito o editado), Nexus propone preguntas para
 * ese objetivo (`alCambiarElObjetivo`, CEMACO 2026-10-20): no con cada tecla, al guardar. «Proponer preguntas» las vuelve
 * a pedir cuando no hay ninguna esperando.
 */
function Objetivo({
  pestana,
  esLaProxima,
  sugerido,
  preguntas,
  alCambiarElObjetivo,
  pidiendo,
}: {
  pestana: PestanaDeSesion;
  esLaProxima: boolean;
  sugerido: string | null;
  preguntas: PreguntaParaMostrar[];
  alCambiarElObjetivo: () => void;
  pidiendo: boolean;
}) {
  const { exp, chequeo, marco, puedeEditar, guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, "antes");
  const s = pestana.sesion;
  const confirmado = s?.objetivo ?? null;
  const ofrecer = !confirmado && sugerido && sugerido !== s?.objetivoDescartado ? sugerido : null;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");

  const enProyecto = marco.clave === "cs";
  const puntos = enProyecto ? [] : listaParaProponer(exp.estado, chequeo);
  const paras = new Set(preguntas.map((p) => p.apunta?.para ?? p.para));
  const hayDimensiones = preguntas.some((p) => ladoDeLaPregunta(p) === "dimension");
  const hayImpacto = preguntas.some((p) => p.tipo === "dimension" && p.paso === "impacto");
  const faltan = puntos.filter((p) => !p.cumplido);
  const cubre = faltan.filter((p) => puntoQueSePregunta(p.id, paras, hayDimensiones, hayImpacto)).length;
  const faltanDelProyecto = enProyecto ? avanceDeLaEstrategia(exp.estado).filter((p) => !p.cumplido) : [];
  const cubreDelProyecto = faltanDelProyecto.filter((p) => paras.has(p.id)).length;
  // Con un equipo que no es Dirección, la sesión no es para cerrar lo de proponer: se dice qué es (2026-10-23).
  const equipo = pestana.sesion?.equipo ?? null;
  const saleBien =
    equipo && equipo !== "direccion"
      ? `Sesión con ${EQUIPOS[equipo].nombre}: la guía pregunta lo de ese equipo.${enProyecto ? "" : " Para cuándo, quién firma y el presupuesto se hablan con Dirección."}`
      : enProyecto
        ? siSaleBienEnElProyecto(faltanDelProyecto.length, cubreDelProyecto)
        : siSaleBien(faltan.length, cubre);

  // Proponer preguntas es de la próxima sesión (la guía que se puede cambiar) y de un objetivo escrito por la persona.
  const conPropuestas = esLaProxima && puedeEditar;
  const esperando = sugeridasVigentes(s?.ajustesDeLaGuia, confirmado).length > 0;
  const guardar = (valor: string, { proponer = true }: { proponer?: boolean } = {}) => {
    const t = valor.trim().slice(0, 400);
    const cambio = !!t && t !== (confirmado ?? "");
    /* K11: el objetivo es propio si la persona lo escribió o lo cambió; el del agente usado tal cual, no (no cuenta para
       sugerir el equipo). Guardar sin cambios deja lo que había. */
    const propio = cambio ? t !== (sugerido ?? "").trim() : !!s?.objetivoPropio;
    void editar((x) => {
      const { objetivoPropio: _antes, ...resto } = x;
      void _antes;
      return t ? { ...resto, objetivo: t, ...(propio ? { objetivoPropio: true } : {}) } : { ...resto, objetivo: undefined };
    }).then((ok) => {
      if (!ok) return;
      setEditando(false);
      if (proponer && cambio && conPropuestas) alCambiarElObjetivo();
    });
  };

  if (editando) {
    return (
      <section className="space-y-2.5 rounded-xl border border-line bg-surface px-[18px] py-4">
        <Rotulo>Objetivo de la sesión</Rotulo>
        <textarea
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
          maxLength={400}
          rows={3}
          autoFocus
          aria-label="Objetivo de la sesión"
          placeholder="Qué tienes que salir sabiendo de esta sesión"
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-[1.5] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <BotonTexto onClick={() => setEditando(false)}>Cancelar</BotonTexto>
          <BotonAzul disabled={guardando} onClick={() => guardar(texto)}>
            Guardar
          </BotonAzul>
        </div>
      </section>
    );
  }

  if (confirmado) {
    return (
      <section className="flex items-start gap-4 rounded-xl border border-line bg-surface px-[18px] py-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Rotulo>Objetivo de la sesión</Rotulo>
          <p className="text-[15px] font-semibold leading-[1.4] text-fg">{confirmado}</p>
          {esLaProxima && <p className="text-[13px] leading-[1.45] text-fg-secondary">{saleBien}</p>}
        </div>
        {puedeEditar && (
          <div className="flex flex-none flex-col items-end gap-1">
            <BotonBlanco
              onClick={() => {
                setTexto(confirmado);
                setEditando(true);
              }}
            >
              Editar
            </BotonBlanco>
            {conPropuestas && !esperando && (
              <BotonTexto disabled={pidiendo} onClick={alCambiarElObjetivo}>
                <span className="inline-flex items-center gap-1 text-brand">
                  <IconoDeSugerencia className="h-3 w-3" />
                  Proponer preguntas
                </span>
              </BotonTexto>
            )}
          </div>
        )}
      </section>
    );
  }

  if (ofrecer) {
    return (
      <section className="space-y-2.5 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
          Objetivo sugerido
        </p>
        <p className="text-[15px] font-semibold leading-[1.4] text-fg">{ofrecer}</p>
        {esLaProxima && (
          <p className="text-[13px] leading-[1.45] text-fg-secondary">
            Acéptalo o edítalo: la guía no se arma sin él, y es la instrucción que más pesa. Si quieres, dile a Nexus cómo estructurar la sesión.
          </p>
        )}
        {puedeEditar && (
          <div className="flex items-center justify-end gap-2">
            <BotonTexto disabled={guardando} onClick={() => void editar((x) => ({ ...x, objetivoDescartado: ofrecer }))}>
              Descartar
            </BotonTexto>
            <BotonBlanco
              onClick={() => {
                setTexto(ofrecer);
                setEditando(true);
              }}
            >
              Editar
            </BotonBlanco>
            {/* El objetivo que sugiere el agente se armó con la guía: usarlo no pide preguntas nuevas. */}
            <BotonAzul disabled={guardando} onClick={() => guardar(ofrecer, { proponer: false })}>
              Aceptar
            </BotonAzul>
          </div>
        )}
      </section>
    );
  }

  if (!puedeEditar) return null;
  return (
    <section className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-[18px] py-3.5">
      <p className="min-w-0 flex-1 text-[13px] text-fg-muted">
        Sin objetivo todavía: ¿qué tienes que salir sabiendo de esta sesión?{esLaProxima ? " La guía no se arma sin él." : ""}
      </p>
      <BotonBlanco
        onClick={() => {
          setTexto("");
          setEditando(true);
        }}
      >
        Escribirlo
      </BotonBlanco>
    </section>
  );
}

// ── Lo que traes de las sesiones anteriores ───────────────────────────────────

function LoQueTraes({ pestana }: { pestana: PestanaDeSesion }) {
  const { exp, escala, marco, sesion: seleccion } = useLienzo();
  const { todas } = useSesiones();
  const filas = loQueTraes(pestana, todas, { nombreDe: (para) => nombreDelPara(para, escala, marco), tecnica: exp.estado.propuesta.alertaTecnica });
  /* Lo que ya se sabe va en «Lo que ya sabemos», con sus palabras: acá no se repite (en un proyecto mostraba las tarjetas
     respondidas hasta el 2026-10-19, cuando el proyecto ganó «Lo que ya sabemos»). */
  if (!filas.length) return null;
  const ir = (clave: string) => {
    seleccion.elegir(clave);
    seleccion.ponerMomento(clave, "despues");
  };
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">Lo que traes de las sesiones anteriores</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">Lo que viene de antes va primero en la guía de abajo, con la etiqueta de su sesión.</p>
      </header>
      {filas.map((f) => (
        <div key={f.clave} className="flex gap-4 border-b border-surface-hover px-[18px] py-3.5 last:border-b-0">
          <div className="w-[110px] flex-none">
            <button type="button" className="text-[13px] font-semibold text-brand hover:underline" onClick={() => ir(f.clave)}>
              Sesión {f.numero}
            </button>
            <p className={cn("mt-0.5 text-xs", f.aviso ? "text-warn-ink" : "text-fg-muted")}>
              {[f.fecha ? diaCorto(f.fecha) : null, f.estado].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ul className="min-w-0 flex-1 space-y-[9px] text-[13px] leading-[19px] text-fg-secondary">
            {f.lineas.map((l, i) => (
              <li key={i}>
                {l.texto} <span className="font-semibold text-fg">→ {l.consecuencia}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * «Para el demo» (sexta vuelta, 2026-11-08, Elías: el análisis de la sesión alimenta la preparación de la siguiente con
 * los números, los huecos de decisión y las preguntas para el demo). Los dos primeros ya entran a la guía; las del demo
 * llegaban al pedido («lo del demo NO se pregunta») sin verse en ningún lado. Cada una con quién la preguntó. Salen del
 * análisis de la última sesión, sin IA (`paraElDemo`, al abrir y al recargar). Solo en la preventa.
 */
function ParaElDemo() {
  const { paraElDemo, marco } = useLienzo();
  if (marco.clave === "cs" || !paraElDemo?.preguntas.length) return null;
  return (
    <section aria-label="Para el demo" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">Para el demo</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          Lo que el cliente preguntó por funciones en {paraElDemo.deLaReunion}. Se lleva al demo: no se responde en vivo en esta sesión.
        </p>
      </header>
      <ul className="space-y-[9px] px-[18px] py-3.5 text-[13px] leading-[19px] text-fg-secondary">
        {paraElDemo.preguntas.map((p, i) => (
          <li key={`${i}-${p.pregunta}`}>
            {p.pregunta} <span className="text-fg-muted">· lo preguntó {p.quien}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Lo que ya sabemos ─────────────────────────────────────────────────────────

/**
 * Lo que el cliente ya respondió, en 3 a 5 líneas, con sus palabras y de dónde sale cada una (iniciativa A, 2026-10-18:
 * Marco abrió el diagnóstico y la nota de HubSpot porque la guía le hacía repetir lo que el cliente ya había dicho). Lo
 * arma lib/exploraciones/lo-que-ya-sabemos.ts; la guía de abajo parte de acá y no lo vuelve a preguntar.
 */
function LoQueYaSabemos({ pestana }: { pestana: PestanaDeSesion }) {
  const { escala, marco } = useLienzo();
  const { saber } = useGuiaDeLaSesion(pestana, true);
  const lineas = saber?.lineas ?? [];
  if (!lineas.length) return null;
  return (
    <section data-recorrido="preventa.sesion.sabemos" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">Lo que ya sabemos</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">Lo que el cliente ya respondió. La guía parte de acá: no lo vuelvas a preguntar.</p>
      </header>
      <ul>
        {lineas.map((l) => (
          <li key={l.para} className="flex gap-3 border-b border-surface-hover px-[18px] py-3 last:border-b-0">
            <EtiquetaDePregunta p={{ para: l.para, tipo: esTarjeta(l.para) ? "tarjeta" : "dimension", pregunta: "", repreguntas: [] }} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-[20px] text-fg">{l.origen === "resumen" ? l.texto : `«${l.texto}»`}</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {nombreDelPara(l.para, escala, marco)} · {l.de}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Retos de su industria ─────────────────────────────────────────────────────

/**
 * Los retos típicos de su industria, de la investigación en internet, como HIPÓTESIS para preguntar
 * (Elías, 2026-10-07): no van al Resumen, que es lo que dijo o hizo el cliente. Cada uno con la
 * pregunta para saber si le pasa. Los arma la guía.
 */
function RetosDeLaIndustria({ pestana, esLaProxima }: { pestana: PestanaDeSesion; esLaProxima: boolean }) {
  const { guia } = useGuiaDeLaSesion(pestana, esLaProxima);
  const retos = guia?.retosDeLaIndustria ?? [];
  /* Plegados y fuera de una sesión con un equipo (2026-10-23): eran tres preguntas más, siempre abiertas, encima de una
     guía que ya llena la hora (Marco: «redundancias»). Siguen para quien los quiera abrir. */
  if (!retos.length || pestana.sesion?.equipo) return null;
  return (
    <details className="overflow-hidden rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2.5 border-b border-line px-[18px] py-3.5">
        <span className="text-[15px] font-semibold text-fg">Retos de su industria</span>
        <span className="rounded-full border border-warn-line bg-warn-surface px-2 py-px text-[11.5px] text-warn-ink">Hipótesis</span>
        <span className="text-[12.5px] text-fg-muted">· {retos.length} para usar si sobra tiempo</span>
      </summary>
      <p className="border-b border-line px-[18px] py-2.5 text-[12.5px] text-fg-muted">
        Salen de lo que el agente encontró en internet sobre su industria, no de lo que dijo el cliente. Úsalos solo para preguntar: si le pasa, lo anotas en «En vivo».
      </p>
      <ul>
        {retos.map((r, i) => (
          <li key={i} className="border-b border-surface-hover px-[18px] py-3 last:border-b-0">
            <p className="text-[13px] leading-[19px] text-fg-secondary">{r.reto}</p>
            <p className="mt-1 text-[13.5px] font-semibold leading-[19px] text-fg">
              <span className="font-normal text-fg-muted">Para confirmarlo: </span>«{r.pregunta.replace(/^«|»$/g, "")}»
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ── La guía ───────────────────────────────────────────────────────────────────

/** Un tramo de la sesión: su nombre y sus minutos a la izquierda, lo que se hace a la derecha. */
function Tramo({ nombre, minutos, children, className }: { nombre: string; minutos: readonly [number, number]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 px-[18px] py-4 sm:flex-row sm:gap-4", className)}>
      <div className="sm:w-[92px] sm:flex-none">
        <Rotulo>{nombre}</Rotulo>
        <p className="mt-0.5 text-xs text-fg-muted">
          {minutos[0]} – {minutos[1]} min
        </p>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Una de las dos columnas de «Por sección». */
function Columna({
  titulo,
  detalle,
  preguntas,
  vacio,
  pestana,
  editable,
}: {
  titulo: string;
  detalle: string;
  preguntas: PreguntaParaMostrar[];
  vacio: string;
  pestana: PestanaDeSesion;
  editable: boolean;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line">
      <div className="flex items-baseline gap-2 border-b border-line px-4 py-3">
        <h4 className="text-[15px] font-semibold text-fg">{titulo}</h4>
        <span className="text-xs text-fg-muted">{detalle}</span>
      </div>
      {preguntas.length ? (
        <ul className="px-4 py-3">
          {preguntas.map((p) => (
            <PreguntaDeLaGuia key={p.para} p={p} pestana={pestana} corta borde editable={editable} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-[13px] text-fg-muted">{vacio}</p>
      )}
    </div>
  );
}

function LaGuia({ pestana, esLaProxima }: { pestana: PestanaDeSesion; esLaProxima: boolean }) {
  const { exp, escala, marco, chequeo, mapa, puedeEditar, conAsistente, nombreDeNivel } = useLienzo();
  const temas = useTemasDeLaGuia(pestana.sesion?.equipo ?? null);
  // Cambiar la guía (regenerar, editar, quitar, sumar) es de la próxima sesión: la de una que ya pasó queda como se armó.
  const editable = esLaProxima && puedeEditar;
  const enProyecto = marco.clave === "cs";
  const { guia, preguntas, enOrden } = useGuiaDeLaSesion(pestana, esLaProxima);
  const [vista, setVista] = useState<Vista>("orden");
  const e = exp.estado;
  const conTest = exp.leido.tests.length > 0;
  const conEvidencia = Object.values(e.contenido.chequeo).some((x) => !esFuenteDeHipotesis(x.fuente)) || e.propuesta.leidas.sesiones.length > 0;
  // En un proyecto el cliente ya compró: nunca se arranca «desde cero».
  // K2 (2026-10-27): la primera sesión de un prospecto en frío o referido abre la puerta (como-llego.ts).
  const abrirLaPuerta = esLaProxima && abreLaPuerta(e, pestana.sesion?.id ?? null, { marco: marco.clave });
  const desdeCero = !enProyecto && !abrirLaPuerta && esLaProxima && !conTest && !conEvidencia && pestana.numero === 1;
  const apertura = guia?.apertura ?? [];
  /* «Por sección» agrupa por sección y, dentro de cada una, sigue el orden de «En orden» (el que eligió la persona
     arrastrando, si lo eligió): arrastrar se hace solo en «En orden», donde se ve la conversación entera. */
  const deTarjetas = enOrden.filter((p) => ladoDeLaPregunta(p) === "tarjeta");
  const deDimensiones = enOrden.filter((p) => ladoDeLaPregunta(p) === "dimension");
  // Los temas del equipo del cliente de la sesión (2026-10-23), o la pregunta de sistemas y datos de la empresa.
  const equipo = pestana.sesion?.equipo ?? null;
  const deEquipo = enOrden.filter((p) => ladoDeLaPregunta(p) === "equipo");
  // Lo vendido (solo en un proyecto): sus preguntas las escribe el agente al armar la guía.
  const deLoVendido = enOrden.filter((p) => ladoDeLaPregunta(p) === "vendido");
  // Solo lo llevado que todavía no se sabe a qué apunta (se llevó después de armar la guía), y las tuyas sin tema.
  const sueltas = enOrden.filter((p) => ladoDeLaPregunta(p) === null && p.tipo !== "propia");
  const tuyasSinTema = enOrden.filter((p) => ladoDeLaPregunta(p) === null && p.tipo === "propia");
  const conOrdenPropio = !!pestana.sesion?.ajustesDeLaGuia?.orden?.length;
  const ajustar = useAjustarLaGuia(pestana);
  const faltan = marco.tarjetas.filter((c) => lineasDe(c, e.contenido.casillas[c]).length === 0).length;
  const donde = enProyecto ? "en el panel de la derecha" : "en «La escala»";
  /* Siempre cierra con la pregunta de cierre y el siguiente paso, y pide lo que falta que no salió: para proponer en la
     preventa, de la estrategia en un proyecto (avance-del-proyecto.ts). */
  const temasDeLaGuia = new Set(preguntas.map((p) => p.apunta?.para ?? p.para));
  // Con un equipo que no es Dirección, el cierre no pide quién firma ni el presupuesto: no es con quien se habla de eso.
  const sinPreguntar = !esLaProxima || (equipo && equipo !== "direccion")
    ? []
    : enProyecto
      ? faltanDeLaEstrategia(avanceDeLaEstrategia(e), temasDeLaGuia)
      : faltanAlCerrar(listaParaProponer(e, chequeo), temasDeLaGuia, {
          hayDimensiones: deDimensiones.length > 0,
          hayImpacto: preguntas.some((p) => p.tipo === "dimension" && p.paso === "impacto"),
        }).map((p) => p.corto);
  const siNo = siNoSalio(sinPreguntar);
  const areasEnJuego = escala.areas.filter((a) => e.areas.includes(a.id)).map((a) => a.nombre);
  const contar = queContarle({
    marco: marco.clave,
    equipo,
    areas: mapa.chequeo.areas.map((a) => ({ id: a.id, nombre: a.nombre, nivel: a.nivel })),
    nombreDeNivel,
    casos: Object.values(e.contenido.casosDeUso),
  });
  const columnas = 2 + (enProyecto ? 1 : 0) + (deEquipo.length ? 1 : 0);

  // La guía nueva (2026-11-06): una agenda por bloques. Las de antes se siguen viendo como se armaron.
  if (guia?.agenda) return <AgendaDeLaGuia pestana={pestana} agenda={guia.agenda} objetivo={null} momento="antes" editable={puedeEditar} />;

  return (
    <section data-recorrido="preventa.sesion.preguntas" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">La guía</h3>
        <span className="text-[12.5px] text-fg-muted">
          {duracionDeLaSesion(pestana.sesion)} min · {preguntas.length} {preguntas.length === 1 ? "pregunta" : "preguntas"}
        </span>
        <span className="flex-1" />
        {editable && conAsistente && (
          <button
            type="button"
            data-recorrido="preventa.sesion.asistente"
            onClick={() =>
              abrirElChatDeNexus({
                chip: { tipo: "guia", id: exp.id, etiqueta: `la guía de la sesión ${pestana.numero}` },
                texto: "",
                // Lo que se le puede pedir sobre ESTA guía, en botones (sin IA): ver sugerencias-del-asistente.ts.
                sugerencias: sugerenciasDelAsistente({
                  preguntas,
                  cubre: queCubreLaGuia({
                    preguntas,
                    puntos: enProyecto ? avanceDeLaEstrategia(e) : listaParaProponer(e, chequeo),
                    escala,
                    posiciones: mapa.posiciones,
                    marco: enProyecto ? "cs" : "venta",
                  }),
                  dimensiones: escala.areas.filter((a) => e.areas.includes(a.id)).flatMap((a) => a.dimensiones.filter((d) => d.aplica)),
                  posiciones: mapa.posiciones,
                  nombreDe: (tema) => nombreDelPara(tema, escala, marco),
                  sinLoVendido: enProyecto && deLoVendido.length === 0,
                }),
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:bg-surface-hover"
          >
            <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />
            Mejorar con el asistente
          </button>
        )}
        <Segmentos
          etiqueta="Cómo ver las preguntas"
          opciones={[
            { clave: "orden", nombre: "En orden" },
            { clave: "seccion", nombre: "Por sección" },
          ]}
          valor={vista}
          onCambiar={setVista}
        />
      </header>

      <Tramo nombre="Abrir" minutos={TRAMOS_DE_LA_SESION.abrir} className="border-b border-line">
        <div className="space-y-2">
          {conTest && pestana.numero === 1 && <p className="text-[13px] text-fg-muted">{REUNIONES[0].promesa}</p>}
          {desdeCero && <p className="text-[13px] text-fg-muted">No hizo el test: empieza conectando, y después explícale la escala en simple.</p>}
          {abrirLaPuerta && (
            <p className="text-[13px] text-fg-muted">
              Esta sesión abre la puerta: presenta a Smarteam (minutos {TRAMOS_DE_ABRIR_LA_PUERTA.presentar.join("–")}; cómo, en la Preparación), deja que
              el cliente cuente lo que le pasa (minutos {TRAMOS_DE_ABRIR_LA_PUERTA.escuchar.join("–")}) y al final haz estas pocas preguntas. Sin diagnóstico.
            </p>
          )}
          {apertura.map((a, i) => (
            <p key={`a-${i}`} className="text-[14.5px] leading-[21px] text-fg">
              «{a.replace(/^«|»$/g, "")}»
            </p>
          ))}
          {desdeCero &&
            CONEXION_DE_BASE.map((q, i) => (
              <p key={`c-${i}`} className="text-[14.5px] leading-[21px] text-fg">
                «{q}»
              </p>
            ))}
          {desdeCero && guia?.escalaEnSimple && (
            <p className="text-[13px] text-fg-secondary">
              <span className="font-semibold text-fg">La escala, en simple: </span>
              {guia.escalaEnSimple}
            </p>
          )}
          {!apertura.length && !desdeCero && <p className="text-[14.5px] leading-[21px] text-fg">{APERTURA_DE_BASE}</p>}
        </div>
      </Tramo>

      {vista === "orden" ? (
        <Tramo nombre="Preguntar" minutos={TRAMOS_DE_LA_SESION.preguntar}>
          {editable && enOrden.length > 1 && (
            <p className="mb-3 text-xs text-fg-muted">
              {conOrdenPropio ? "Van en el orden que elegiste. " : "Arrastra las preguntas para ponerlas en el orden en que las vas a hacer."}
              {conOrdenPropio && (
                <button type="button" className="text-brand hover:underline" onClick={() => void ajustar({ tipo: "ordenar", claves: [] })}>
                  Volver al orden de la guía
                </button>
              )}
            </p>
          )}
          {enOrden.length ? (
            <GuiaEnOrden preguntas={enOrden} pestana={pestana} editable={editable} />
          ) : (
            <p className="text-[13px] text-fg-muted">
              {e.areas.length === 0
                ? `Elige las áreas en juego ${donde} para saber qué preguntar.`
                : `${enProyecto ? "La estrategia está completa" : "El marco está completo"} y las dimensiones en juego tienen evidencia: esta sesión confirma y profundiza.`}
            </p>
          )}
          {editable && <AgregarPregunta pestana={pestana} temas={temas} />}
          {editable && <Quitadas pestana={pestana} />}
        </Tramo>
      ) : (
        <div className="space-y-4 px-[18px] py-4">
          {conOrdenPropio && <p className="text-xs text-fg-muted">Cada sección sigue el orden que elegiste en «En orden».</p>}
          {sueltas.length > 0 && (
            <div className="rounded-xl border border-line px-4 py-3">
              <p className="text-[13px] font-semibold text-fg">Quedó abierto</p>
              <p className="mb-2 text-xs text-fg-muted">Lo llevaste de otra sesión después de armar la guía: al actualizarla, cada punto va a su sección.</p>
              <ul>
                {sueltas.map((p) => (
                  <PreguntaDeLaGuia key={p.para} p={p} pestana={pestana} borde editable={editable} />
                ))}
              </ul>
            </div>
          )}
          {tuyasSinTema.length > 0 && (
            <div className="rounded-xl border border-line px-4 py-3">
              <p className="mb-2 text-[13px] font-semibold text-fg">Tuyas, sin tema</p>
              <ul>
                {tuyasSinTema.map((p) => (
                  <PreguntaDeLaGuia key={p.para} p={p} pestana={pestana} borde editable={editable} />
                ))}
              </ul>
            </div>
          )}
          <div className={cn("grid items-start gap-4", columnas >= 4 ? "xl:grid-cols-4" : columnas === 3 ? "xl:grid-cols-3" : "xl:grid-cols-2")}>
            {deEquipo.length > 0 && (
              <Columna
                titulo={equipo ? EQUIPOS[equipo].nombre : "Sistemas y datos"}
                detalle={equipo ? "el equipo de esta sesión" : "la conversación se puso técnica"}
                preguntas={deEquipo}
                pestana={pestana}
                editable={editable}
                vacio=""
              />
            )}
            <Columna
              titulo={marco.nombre}
              detalle={faltan > 0 ? `faltan ${faltan} de ${marco.tarjetas.length}` : "completa"}
              preguntas={deTarjetas}
              pestana={pestana}
              editable={editable}
              vacio={enProyecto ? "La estrategia está completa: no falta nada por preguntar." : "El marco está completo: no falta nada por preguntar."}
            />
            <Columna
              titulo="Escala de rendimiento"
              detalle={[areasEnJuego.join(" · "), deDimensiones.length ? `${deDimensiones.length} sin evidencia` : ""].filter(Boolean).join(" · ")}
              preguntas={deDimensiones}
              pestana={pestana}
              editable={editable}
              vacio={e.areas.length === 0 ? `Elige las áreas en juego ${donde} para saber qué dimensiones preguntar.` : "Todas las dimensiones en juego ya tienen evidencia."}
            />
            {enProyecto && (
              <Columna
                titulo="Lo vendido"
                detalle={deLoVendido.length ? `${deLoVendido.length} ${deLoVendido.length === 1 ? "pieza" : "piezas"} del alcance` : ""}
                preguntas={deLoVendido}
                pestana={pestana}
                editable={editable}
                vacio={guia ? "La guía no trajo preguntas de lo vendido: actualízala para que las arme desde el handoff." : "Arma la guía: pregunta por cada pieza de lo vendido, desde el handoff."}
              />
            )}
          </div>
          {editable && <AgregarPregunta pestana={pestana} temas={temas} />}
          {editable && <Quitadas pestana={pestana} />}
        </div>
      )}

      {/* Una hora con tiempo para hablarle (2026-10-23): lo que se le cuenta, de lo que Nexus ya sabe. */}
      <Tramo nombre="Contarle" minutos={TRAMOS_DE_LA_SESION.contar} className="border-t border-line">
        <p className="text-[14.5px] leading-[21px] text-fg">{contar.guia}</p>
        {contar.puntos.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] leading-[19px] text-fg-secondary">
            {contar.puntos.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </Tramo>

      <Tramo nombre="Cerrar" minutos={TRAMOS_DE_LA_SESION.cerrar} className="border-t border-line">
        <p className="text-[14.5px] font-semibold leading-[21px] text-fg">
          {equipo
            ? "Valida lo que entendiste de su equipo («Entonces lo que más les pesa es…, ¿es así?») y acuerda el siguiente paso."
            : enProyecto
              ? "Confirma lo que entendiste y acuerda el siguiente paso, con fecha y con quién."
              : "Pide el siguiente paso con fecha y con quién."}
        </p>
        <p className="mt-1 text-[14.5px] leading-[21px] text-fg">«{equipo ? EQUIPOS[equipo].cierre : preguntaDeCierre(marco.clave)}»</p>
        <p className="mt-1 text-[13px] leading-[19px] text-fg-secondary">{guia?.cierre ?? CIERRE_DE_BASE}</p>
        {siNo && <p className="mt-1 text-[13px] leading-[19px] text-fg-secondary">{siNo}</p>}
        {/* K8 (2026-10-26): en una sesión con la empresa entera, las sesiones por equipo que conviene agendar después. */}
        {!equipo && !!guia?.sesionesSugeridas?.length && (
          <div className="mt-2.5">
            <p className="text-xs text-fg-muted">Para agendar después, por equipo:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-[19px] text-fg-secondary">
              {guia.sesionesSugeridas.map((s) => (
                <li key={s.equipo}>
                  <span className="font-medium text-fg">{EQUIPOS[s.equipo].nombre}</span>: {s.porque}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Tramo>
    </section>
  );
}

/** Qué hacer si se resiste, plegado: lo que se pregunta ante cada objeción, y la señal de poca apertura. */
export function SiSeResiste({ pestana, esLaProxima, compacto = false }: { pestana: PestanaDeSesion; esLaProxima: boolean; compacto?: boolean }) {
  const { abrirObjeciones, marco } = useLienzo();
  const { guia } = useGuiaDeLaSesion(pestana, esLaProxima);
  // Las objeciones son de la venta: en un proyecto el cliente ya compró.
  if (!marco.conObjeciones) return null;
  const objeciones = guia?.objeciones.length ? guia.objeciones : OBJECIONES_DE_BASE;
  const nombres = objeciones.slice(0, 3).map((o) => OBJECION[o.tipo].toLowerCase());
  return (
    <details className="rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer select-none px-[18px] py-3.5 text-sm font-semibold text-fg">
        Si se resiste {!compacto && <span className="text-[13px] font-normal text-fg-muted">· {nombres.join(", ")}</span>}
      </summary>
      <div className="space-y-2 px-[18px] pb-4 text-[13px] leading-[19px] text-fg-secondary">
        {objeciones.map((o) => (
          <p key={o.tipo}>
            <span className="font-medium text-fg">{OBJECION[o.tipo]}</span> → {o.explorar}
          </p>
        ))}
        {!compacto && <p className="text-fg-muted">{guia?.pocaApertura ?? POCA_APERTURA_DE_BASE}</p>}
        <button type="button" className="text-[12.5px] text-brand hover:underline" onClick={abrirObjeciones}>
          Ver cómo responder cada una
        </button>
      </div>
    </details>
  );
}

export default function AntesDeLaSesion({ pestana, esLaProxima }: { pestana: PestanaDeSesion; esLaProxima: boolean }) {
  const { exp, marco } = useLienzo();
  const { guia, preguntas } = useGuiaDeLaSesion(pestana, esLaProxima);
  const delObjetivo = usePedirPreguntasDelObjetivo();
  // Sexta vuelta: solo las de esta sesión, todas con tarjetas.
  const paraLaGuia = usePreguntasParaLaGuia(pestana);
  // 2026-11-07: sin guía todavía, Nexus sugiere el objetivo desde lo que quedó de la sesión anterior (sin otra IA).
  const deLaAnterior = useObjetivoDeLaSiguiente(pestana);
  const traidos = pestana.sesion?.explorar ?? [];
  const conTest = exp.leido.tests.length > 0;
  // En la próxima, una guía con el formato de antes se pliega abajo como «Guía anterior» (2026-11-06, Elías).
  const guiaDeAntes = !!guia && !guia.agenda;
  const actual = esLaProxima && guiaDeAntes ? null : guia;
  const anterior = esLaProxima ? (guiaDeAntes ? guia : pestana.sesion ? (exp.estado.propuesta.guiasAnteriores?.[pestana.sesion.id] ?? null) : null) : null;

  if (!esLaProxima && !guia) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[13px] text-fg-muted">
        <p>
          {pestana.hecha
            ? "No quedó guardada la guía con que se preparó esta sesión. La de la próxima está en su sesión, a la izquierda."
            : "Su guía se arma cuando sea la próxima sesión: primero va la que está antes."}
        </p>
        {!pestana.hecha && traidos.length > 0 && (
          <div className="mx-auto max-w-xl text-left">
            <Rotulo>Te llevas a esta sesión</Rotulo>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] text-fg-secondary">
              {traidos.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* La guía espera el objetivo de la sesión aceptado (2026-11-08, cuarta vuelta). En la primera de una preventa, el contacto previo. */}
      {esLaProxima && marco.clave !== "cs" && pestana.numero === 1 && !pestana.hecha && <ContactoPrevio />}
      <Objetivo
        pestana={pestana}
        esLaProxima={esLaProxima}
        sugerido={guia?.objetivo ?? deLaAnterior}
        preguntas={preguntas}
        alCambiarElObjetivo={() => {
          // Las preguntas para el objetivo eran de la guía de antes: la agenda se arma entera con el objetivo.
          if (guiaDeAntes && !esLaProxima) void delObjetivo.pedir();
        }}
        pidiendo={delObjetivo.pidiendo}
      />
      {esLaProxima && <SirveAlObjetivoDeLaExploracion />}
      {/* Quinta vuelta (2026-11-08): lo que Nexus necesita saber pide algo de ti, así que va arriba, junto al objetivo. */}
      {esLaProxima && paraLaGuia.length > 0 && (
        <section data-recorrido="preventa.sesion.lo-que-necesita" className="space-y-3 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <IconoDeSugerencia className="h-4 w-4 text-brand" />
              {actual ? "Para afinar esta guía, Nexus necesita saber esto" : "Para armar la guía, Nexus necesita saber esto"}
            </p>
            <p className="mt-0.5 text-[12.5px] text-fg-muted">
              Elige una respuesta de un clic o escribe la tuya.{" "}
              {!objetivoAceptado(pestana.sesion?.objetivo)
                ? "Se guardan y Nexus las usa al armar la guía, cuando el objetivo esté aceptado."
                : actual
                  ? "Al responder todo, la guía se rehace."
                  : "Al responder todo, la guía se arma."}
            </p>
          </div>
          <PreguntasDeNexus conObjetivo={objetivoAceptado(pestana.sesion?.objetivo)} lista={paraLaGuia} />
        </section>
      )}
      {/* Cuarta vuelta (2026-11-08): «Armar la guía» va debajo del objetivo y arriba de «Lo que ya sabemos». */}
      {esLaProxima && <EstadoDeLaGuia pestana={pestana} />}
      {esLaProxima && <LoQueTraes pestana={pestana} />}
      {esLaProxima && <ParaElDemo />}
      {esLaProxima && <LoQueYaSabemos pestana={pestana} />}
      {/* Sin guía, su espacio grande (2026-11-08). Lo que Nexus necesita saber va arriba, junto al objetivo. */}
      {esLaProxima && !actual && <EspacioDeLaGuia pestana={pestana} preguntas={paraLaGuia} />}
      {actual && <LaGuia pestana={pestana} esLaProxima={esLaProxima} />}
      {actual && <LoQueCubreLaGuia pestana={pestana} esLaProxima={esLaProxima} />}
      {actual && <RetosDeLaIndustria pestana={pestana} esLaProxima={esLaProxima} />}
      {conTest && pestana.numero === 1 && (
        <details className="rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer select-none px-[18px] py-3.5 text-sm font-semibold text-fg">Su plan: qué va primero (es lo que se lleva de esta reunión)</summary>
          <div className="border-t border-line p-4">
            <QueVaPrimero />
          </div>
        </details>
      )}
      {actual && <SiSeResiste pestana={pestana} esLaProxima={esLaProxima} />}
      {anterior && <GuiaAnterior guia={anterior} />}
    </div>
  );
}
