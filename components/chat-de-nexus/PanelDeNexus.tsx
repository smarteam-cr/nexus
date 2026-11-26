"use client";

/**
 * PanelDeNexus — la conversación de «Hablar con Nexus» (Elías, 21 nov), sin saber de qué lugar es. Desde el 24 nov va en el
 * chat «Nexus» de todos (components/asistente/CajonDeNexus.tsx): la misma cabecera, la misma caja y el mismo hilo que el
 * chat de un documento.
 *
 * La persona escribe o dicta; Enter envía y Shift+Enter baja de renglón. Si CUENTA algo, Nexus pregunta lo que falta (como
 * mucho dos rondas, lib/chat-de-nexus/conversacion.ts) y, cuando entiende, el lugar recibe lo que quedó: la nota con las
 * palabras de la persona y los cambios propuestos (`alQuedarListo`). El lugar NO guarda nada sin un clic: muestra qué
 * cambia y «Guardar». Si PREGUNTA algo de la cuenta, Nexus responde con sus citas y con formato
 * (lib/chat-de-nexus/respuesta.ts, ./TextoConFormato) y la conversación sigue. Cada lado tiene su salida por si se leyó mal:
 * «Guardarlo como nota» debajo de la última respuesta, y «¿Era una pregunta? Respóndela» debajo de lo que iba a guardarse
 * (mientras el lugar diga `sePuedePreguntar`). Lo que el lugar hace con lo contado (guardar la nota, «Aplicar», la cuenta
 * regresiva) lo pinta `children` dentro del hilo, y el lugar decide cuándo está `terminado`: ahí la caja queda apagada con
 * el porqué, salvo que el lugar diga que se puede seguir (`alSeguir`). La conversación la guarda el lugar (`conversacion`,
 * `alCambiar`): cerrar el chat y volver a abrirlo no pierde lo hablado ni lo propuesto, y al volver a la página el lugar la
 * trae del servidor (lib/chat-de-nexus/guardada.ts). Si Nexus no pudo leer lo que contaste, el texto vuelve a la caja y no se
 * guarda nada. Hoy lo usa la preventa (components/exploraciones/HablarConNexus.tsx).
 *
 * UNA SOLA CONVERSACIÓN (24 nov): si la persona PIDE algo de la cuenta (una tarea, el siguiente paso, la guía), lo prepara
 * en el servidor la parte de Nexus que trabaja la cuenta y vuelve al MISMO hilo como una lista (lib/chat-de-nexus/lista.ts)
 * con sus casillas y «Aplicar» (`POST <urlDelTurno>/aplicar`): el servidor la lee de la vuelta, nunca de acá. Una lista
 * que la siguiente lleva (o suelta) se apaga; la aplicada dice lo que dejó.
 *
 * UN SOLO CONTEXTO (25 nov, Elías probando TEC · AE): un cambio a la página de La escala también es una vuelta de ESTA
 * conversación. «✨ Mejorar con IA» de una sección abre el cajón con esa parte como chip (`escala`): el chip solo dice a qué
 * parte va un cambio, y se puede preguntar de la cuenta y conversar igual. La propuesta vuelve al hilo con su vuelta y la
 * pinta el lugar (`pintarLaEscala`); lo que se hace con ella queda en el mensaje (`cambiarLaEscala`). Cada respuesta que
 * llega avisa al lugar (`alResponder`): con el cajón cerrado, el botón «Nexus» lleva un punto rojo en vez de un aviso.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui";
import { BotonEnlace } from "@/components/ui/sistema";
import CajonDeNexus, { Burbuja, CajaDeNexus, ChatVacio, ChipDeNexus, Pensando, PropuestaEnElHilo, SugerenciasDeNexus } from "@/components/asistente/CajonDeNexus";
import { devolverALaCaja } from "@/lib/asistente/caja";
import { NADA_QUE_GUARDAR, notaDeLaConversacion, paraContarComoNota, paraPreguntar, paraSeguirDespuesDeGuardar, TOPES, type ResultadoDelTurno } from "@/lib/chat-de-nexus/conversacion";
import type { MensajeGuardado } from "@/lib/chat-de-nexus/guardada";
import { conLaListaAplicada, conLaListaNueva, cuerpoDeLaVuelta, seGuardaComoNota, type ListaEnLaConversacion } from "@/lib/chat-de-nexus/lista";
import { textoDeLaEscala, type DondeEnLaEscala, type EscalaEnLaConversacion } from "@/lib/chat-de-nexus/escala-en-la-conversacion";
import type { CitaDeLaRespuesta, RespuestaDeNexus } from "@/lib/chat-de-nexus/respuesta";
import { textoDelBoton, tituloDeLaLista } from "@/lib/nexus-chat/textos";
import TextoConFormato from "./TextoConFormato";

export type TurnoListo = Extract<ResultadoDelTurno, { tipo: "listo" }>;

/** Una conversación nueva: su id viaja en cada vuelta (los topes y los hechos se cuentan por él). */
export function idDeConversacion(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Un mensaje como se ve: el de Nexus que respondió una pregunta lleva sus citas. Es el mismo que se guarda. */
export type MensajeEnPantalla = MensajeGuardado;

/** La conversación que guarda el lugar: su id (viaja en cada vuelta) y los mensajes. */
export interface ConversacionEnPantalla {
  id: string;
  mensajes: MensajeEnPantalla[];
}

export const conversacionNueva = (): ConversacionEnPantalla => ({ id: idDeConversacion(), mensajes: [] });

const DE_QUIEN: Record<NonNullable<CitaDeLaRespuesta["deQuien"]>, string> = { cliente: "del cliente", smarteam: "de Smarteam", equipo: "del equipo" };

function Cita({ c }: { c: CitaDeLaRespuesta }) {
  const quien =
    c.deQuien === "equipo"
      ? c.deDonde
      : [c.hablante && `${c.hablante}${c.deQuien ? ` (${DE_QUIEN[c.deQuien]})` : ""}`, c.deDonde].filter(Boolean).join(" · ");
  return (
    <li className="text-2xs text-fg-secondary">
      «{c.texto}» <span className="text-fg-muted">— {quien}</span>
    </li>
  );
}

function LaRespuesta({ r }: { r: RespuestaDeNexus }) {
  return (
    <>
      <TextoConFormato apagado={!r.sabe}>{r.texto}</TextoConFormato>
      {r.sinRespaldo && <p className="mt-1 text-2xs text-warn-ink">No encontré en las reuniones ni en las notas las palabras que lo respaldan: tómalo con cuidado.</p>}
      {r.citas.length > 0 && <ul className="mt-1.5 space-y-1">{r.citas.map((c, i) => <Cita key={i} c={c} />)}</ul>}
      {r.afuera.reuniones > 0 && (
        <p className="mt-1.5 text-2xs text-fg-muted">
          No entraron {r.afuera.reuniones === 1 ? "una reunión más vieja" : `${r.afuera.reuniones} reuniones más viejas`} (desde {r.afuera.ejemplos[0]})
          {r.afuera.yMas ? ", ni las anteriores" : ""}.
        </p>
      )}
      {!r.afuera.reuniones && r.afuera.yMas && <p className="mt-1.5 text-2xs text-fg-muted">Las reuniones más viejas de la cuenta no se leyeron.</p>}
      {r.afuera.sinAcceso && <p className="mt-1.5 text-2xs text-fg-muted">No leí las reuniones de esta cuenta: no tienes acceso a ellas. Respondí con lo de la preventa.</p>}
    </>
  );
}

/** El título de la caja de una lista, según en qué quedó. */
function tituloDeLaListaEnPantalla(l: ListaEnLaConversacion): string {
  if (l.estado === "soltada") return "Ya no va";
  if (l.estado !== "aplicada") return tituloDeLaLista(l.lineas.length);
  const n = l.aplicados?.length;
  return n !== undefined && n < l.lineas.length ? `${n} de ${l.lineas.length} aplicados` : "Aplicado";
}

/**
 * Lo que contestó la parte de Nexus que trabaja la cuenta, con su lista: cada renglón es UNA operación (lo que se lee es lo
 * que se aplica), con su casilla mientras la lista está viva, y «Aplicar» a todo el ancho. Igual que la lista del chat de la
 * cuenta (components/asistente/ChatDelAsistente.tsx): lo arrastrado y lo que ya no va se dicen.
 */
function LaLista({ l, aplicando, apagado, onAplicar }: { l: ListaEnLaConversacion; aplicando: boolean; apagado: boolean; onAplicar: (desmarcadas: number[]) => void }) {
  const [fuera, setFuera] = useState<ReadonlySet<number>>(new Set());
  const viva = l.estado === "viva";
  const marcados = l.lineas.length - fuera.size;
  const alternar = (i: number) =>
    setFuera((f) => {
      const n = new Set(f);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const largas = l.lineas.length > 6;
  return (
    <div className="space-y-2">
      <Burbuja de="nexus">
        <TextoConFormato>{l.texto}</TextoConFormato>
      </Burbuja>
      {/* Lo que salió de la lista de antes: en la vigente, y en la que solo la soltó (un cierre, sin renglones). */}
      {(viva || l.cierre) && l.descartadas?.length ? (
        <ul className="mr-2 space-y-0.5 rounded-lg border border-warn-line bg-warn-surface px-2 py-1.5 text-xs text-warn-ink">
          {l.descartadas.map((d, i) => (
            <li key={i}>⚠ Ya no va: {d}</li>
          ))}
        </ul>
      ) : null}
      {l.lineas.length > 0 && (
        <PropuestaEnElHilo
          titulo={tituloDeLaListaEnPantalla(l)}
          subtitulo={
            l.estado === "reemplazada"
              ? "Sigue en la lista de abajo."
              : viva && l.arrastradas?.length
                ? l.arrastradas.length === l.lineas.length
                  ? "Estos cambios ya los habías acordado y no se aplicaron."
                  : `${l.arrastradas.length} de estos ${l.lineas.length} cambios ya los habías acordado y no se aplicaron.`
                : null
          }
          apagada={!viva}
          aplicar={viva ? { rotulo: textoDelBoton(marcados), alHacer: () => onAplicar([...fuera]), apagado: apagado || marcados === 0, ocupado: aplicando } : null}
        >
          <ol
            {...(largas ? { tabIndex: 0, role: "region" as const, "aria-label": `${l.lineas.length} cambios propuestos` } : {})}
            className={`list-decimal space-y-1 pl-4 text-sm text-fg marker:text-fg-muted${largas ? " max-h-56 overflow-y-auto overscroll-contain pr-1" : ""}`}
          >
            {l.lineas.map((linea, i) => (
              <li key={i} className="leading-relaxed">
                {viva ? (
                  <label className={`flex cursor-pointer items-start gap-2${fuera.has(i) ? " line-through opacity-50" : ""}`}>
                    <input type="checkbox" checked={!fuera.has(i)} onChange={() => alternar(i)} disabled={aplicando || apagado} className="mt-1 shrink-0 accent-primary" />
                    <span>{linea}</span>
                  </label>
                ) : (
                  // Aplicada: lo que no se aplicó (desmarcado, o no llegó) va tachado.
                  <span className={l.estado === "aplicada" && l.aplicados && !l.aplicados.includes(i) ? "line-through opacity-50" : undefined}>{linea}</span>
                )}
              </li>
            ))}
          </ol>
        </PropuestaEnElHilo>
      )}
      {l.desenlace ? <p className="mr-2 whitespace-pre-wrap text-xs text-fg-secondary">{l.desenlace}</p> : null}
    </div>
  );
}

export interface PanelDeNexusProps {
  /** El chat abierto o cerrado, y cómo se cierra (la ✕ de la cabecera o Escape). */
  abierto: boolean;
  onClose: () => void;
  /** De qué se habla, debajo de «Nexus» («Preventa · …»). */
  subtitulo: string;
  /** Lo que se le garantiza, entero en su propia línea debajo del subtítulo («Nexus propone, tú aplicas; nada se publica.»). */
  garantia?: string;
  /** Fijo arriba del hilo. Hoy la preventa no lo llena: el enlace «Tareas, siguiente paso o la guía» se quitó el 24 nov. */
  arriba?: ReactNode;
  ancho: "normal" | "amplio";
  onAncho: () => void;
  /** Cada vez que sube, el cursor va a la caja aunque el chat ya estuviera abierto (el botón «Nexus» otra vez). */
  pedidoDeFoco?: number;
  /** El chat vacío: qué se le puede contar o preguntar, con sus ejemplos (solo ahí). */
  vacio: { intro: string; ejemplos: readonly string[]; cierre: string };
  /** Algo que el lugar dice arriba del hilo (que «Lo que sabes del cliente» está lleno). */
  aviso?: ReactNode;
  /** La ruta de una vuelta (POST { conversacion, mensajes } → { turno, quedan }). */
  urlDelTurno: string;
  /** Cuando Nexus entendió lo que contaste: el lugar muestra qué cambia y espera el «Guardar». Si lanza, el panel muestra el error. */
  alQuedarListo: (l: { conversacion: string; nota: string; turno: TurnoListo }) => Promise<void>;
  /** Lo contado ya tiene adónde ir: se pinta `children` y la caja espera. Lo decide el lugar. */
  terminado: boolean;
  /** Lo que el lugar pinta cuando está terminado. */
  children?: ReactNode;
  /** La conversación, que guarda el lugar. */
  conversacion: ConversacionEnPantalla;
  alCambiar: (c: ConversacionEnPantalla) => void;
  /** «Nueva conversación»: el lugar olvida lo de la anterior (y arma una nueva). */
  alReiniciar: () => void;
  /** Lo que iba a guardarse todavía no se guardó: debajo de lo último que escribió la persona, «¿Era una pregunta?». */
  sePuedePreguntar?: boolean;
  /** «¿Era una pregunta? Respóndela»: el lugar olvida lo que iba a guardarse (vuelve a no estar `terminado`). */
  alVolverAConversar?: () => void;
  /**
   * Ya se guardó y no queda nada a medias (22 nov): la caja vuelve a andar. Al mandar, el lugar olvida lo guardado (vuelve
   * a no estar `terminado`) y lo que la persona contó queda marcado como guardado: lo próximo arma una nota nueva, sin
   * repetir la anterior. Sin esto, la caja espera a que se decida lo de arriba (o a «Nueva conversación»).
   */
  alSeguir?: () => void;
  /** La caja apagada, con el porqué (lo dice adentro de la caja). */
  apagado?: string | null;
  /**
   * Quien conversa puede pedirle a Nexus algo de la cuenta (el permiso del chat de la cuenta): el servidor prepara la lista
   * de un pedido. Sin esto, un pedido se lee como antes (contar o preguntar).
   */
  pedidosDeLaCuenta?: boolean;
  /**
   * Desde dónde se abrió: «guia», la guía de la próxima sesión (la parte de Nexus que trabaja la cuenta la tiene a la vista).
   * Con la guía, lo que se escribe es un pedido sobre ella (`pedir`), como con el chip de La escala.
   */
  lugar?: "guia";
  /** Lo que se mejora, como chip sobre la caja, con su ✕ (y lo que hace la ✕, para el lector de pantalla). */
  chip?: { texto: string; alQuitar: () => void; quitarLabel?: string };
  /** Pedidos listos para mandar, en botones sobre la caja (con la caja vacía). Un clic llena la caja; no la manda. */
  sugerencias?: readonly string[];
  /** Se aplicó una lista de la cuenta: el lugar vuelve a leer lo que cambió (la guía, las tareas). */
  alAplicar?: () => void;
  /**
   * Lo que se antepone a lo PRÓXIMO que mande la persona (24 nov, «Responder con Nexus» de La escala: «Sobre Ventas · Datos
   * (…): »). Va en su mensaje, así lo lee Nexus, queda en la nota y sobrevive a recargar. Se usa una vez: al volver la
   * vuelta, `alUsarElPrefijo` (el lugar lo quita). Si la vuelta falla, lo escrito vuelve a la caja sin él.
   */
  prefijo?: string;
  alUsarElPrefijo?: () => void;
  /**
   * El chip de La escala (25 nov): a qué página y sección va un cambio. Viaja en cada envío; lo que no es pregunta ni pedido
   * de la cuenta es un cambio a esa parte. Sin esto, un cambio a la página (si lo hay) va al Resumen.
   */
  escala?: DondeEnLaEscala | null;
  /**
   * Cómo se ve una propuesta a La escala en el hilo (la pinta el lugar). `cambiar` actualiza ese mensaje; `ocupado`: Nexus
   * piensa o aplica una lista (revisión del 25 nov: un «Aplicar» entretanto se perdía cuando llegaba la respuesta).
   */
  pintarLaEscala?: (e: EscalaEnLaConversacion, cambiar: (f: (e: EscalaEnLaConversacion) => EscalaEnLaConversacion) => void, ocupado: boolean) => ReactNode;
  /** Llegó la respuesta de una vuelta (cualquiera): con el cajón cerrado, el lugar lo marca en su botón. */
  alResponder?: () => void;
  /** El lugar está aplicando algo (un cambio a La escala): «Nueva conversación» y los botones esperan, como con una lista. */
  ocupadoAfuera?: boolean;
}

export default function PanelDeNexus({
  abierto,
  onClose,
  subtitulo,
  garantia,
  arriba,
  ancho,
  onAncho,
  pedidoDeFoco = 0,
  vacio,
  aviso,
  urlDelTurno,
  alQuedarListo,
  terminado,
  children,
  conversacion: c,
  alCambiar,
  alReiniciar,
  sePuedePreguntar = false,
  alVolverAConversar,
  alSeguir,
  apagado = null,
  pedidosDeLaCuenta = false,
  lugar,
  chip,
  sugerencias,
  alAplicar,
  prefijo,
  alUsarElPrefijo,
  escala = null,
  pintarLaEscala,
  alResponder,
  ocupadoAfuera = false,
}: PanelDeNexusProps) {
  const { id: conversacion, mensajes } = c;
  const setMensajes = (m: MensajeEnPantalla[]) => alCambiar({ id: conversacion, mensajes: m });
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Desde el 80 % del tope del mes de Nexus conversando, el servidor lo avisa en cada vuelta (lib/ai/tope-de-nexus.ts).
  const [avisoDelMes, setAvisoDelMes] = useState<string | null>(null);
  // La persona eligió «Guardarlo como nota»: debajo de lo que iba a guardarse no vuelve «¿Era una pregunta?» (sin ida y
  // vuelta entre los dos botones).
  const [contadoAMano, setContadoAMano] = useState(false);
  /**
   * Lo que «Guardarlo como nota» ya intentó y no tenía nada del cliente (25 nov): su botón no vuelve (cada intento es una
   * llamada a la IA).
   */
  const [sinNadaQueGuardar, setSinNadaQueGuardar] = useState<ReadonlySet<string>>(new Set());
  const cajaRef = useRef<HTMLTextAreaElement | null>(null);
  /** La lista que se está aplicando (su vuelta): mientras tanto la caja y «Nueva conversación» esperan. */
  const [aplicando, setAplicando] = useState<string | null>(null);
  /** La conversación de AHORA: lo que vuelve de «Aplicar» va sobre ella, nunca sobre la del momento del clic. */
  const conversacionDeAhora = useRef(c);
  useEffect(() => {
    conversacionDeAhora.current = c;
  }, [c]);
  const ocupado = pensando || !!aplicando || ocupadoAfuera;

  /**
   * Una vuelta: `t` va al final de `base`. `modo`: «contar», lo último se cuenta aunque tenga forma de pregunta («Guardarlo
   * como nota»); «preguntar», se responde («¿Era una pregunta?»). Si falla, la conversación vuelve a como estaba y, en un
   * envío normal, lo escrito vuelve a la caja. `antes`: a qué vuelve si falla (al seguir después de guardar, con lo
   * guardado ya marcado: el lugar ya lo olvidó).
   */
  const mandar = async (t: string, base: MensajeEnPantalla[], modo: "normal" | "contar" | "preguntar", antes: MensajeEnPantalla[] = mensajes, soltar?: string, conPrefijo?: string) => {
    if (!t || pensando || aplicando) return;
    // El prefijo va en el mensaje (lo lee Nexus y queda en la nota); si la vuelta falla, a la caja vuelve lo escrito, sin él.
    const conLaPersona: MensajeEnPantalla[] = [...base, { de: "persona", texto: conPrefijo ? `${conPrefijo}${t}` : t }];
    setMensajes(conLaPersona);
    if (modo === "normal") setTexto("");
    setPensando(true);
    setError(null);
    /**
     * Lo de AHORA, cuando vuelve la respuesta (revisión del 25 nov): mientras Nexus pensaba, la persona pudo aplicar o
     * descartar un cambio de una propuesta de antes; armar la respuesta sobre la foto del envío lo volvía a «pendiente».
     */
    const sobreLoDeAhora = () => {
      const a = conversacionDeAhora.current;
      return a.id === conversacion && a.mensajes.length === conLaPersona.length ? a.mensajes : conLaPersona;
    };
    try {
      const r = await fetch(urlDelTurno, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // El cuerpo lo arma una función pura y probada (lib/chat-de-nexus/lista.ts › `cuerpoDeLaVuelta`).
        body: JSON.stringify(cuerpoDeLaVuelta({ conversacion, mensajes: conLaPersona, modo, pedidosDeLaCuenta, lugar, soltar, escala })),
      });
      const j = (await r.json().catch(() => null)) as { turno?: ResultadoDelTurno; error?: string; aviso?: string } | null;
      if (!r.ok || !j?.turno) throw new Error(j?.error ?? "Nexus no pudo responder. Inténtalo de nuevo.");
      setAvisoDelMes(j.aviso ?? null);
      const turno = j.turno;
      if (turno.tipo === "pregunta") {
        setMensajes([...sobreLoDeAhora(), { de: "nexus", texto: turno.preguntas.join("\n") }]);
      } else if (turno.tipo === "cortesia") {
        // Un «gracias» o un «ok»: ni va a la nota ni se ofrece guardarlo.
        const conLaCortesia = sobreLoDeAhora().map((m, i) => (i === conLaPersona.length - 1 ? { ...m, es: "cortesia" as const } : m));
        setMensajes([...conLaCortesia, { de: "nexus", es: "cortesia", texto: turno.texto }]);
      } else if (turno.tipo === "respuesta") {
        // «¿Era una pregunta?»: recién con la respuesta en la mano el lugar olvida lo que iba a guardarse. Si fallaba
        // antes, lo propuesto seguía a la vista con su «Guardar».
        if (modo === "preguntar") alVolverAConversar?.();
        // Lo que preguntó no va a la nota; la respuesta no cuenta como una ronda de preguntas.
        const conLaConsulta = sobreLoDeAhora().map((m, i) => (i === conLaPersona.length - 1 ? { ...m, es: "consulta" as const } : m));
        setMensajes([...conLaConsulta, { de: "nexus", es: "respuesta", texto: turno.respuesta.texto, respuesta: turno.respuesta }]);
      } else if (turno.tipo === "lista") {
        // Un pedido de la cuenta: lo pedido no va a la nota, y la lista queda en el hilo con su «Aplicar».
        setMensajes(conLaListaNueva(sobreLoDeAhora(), turno.lista));
      } else if (turno.tipo === "escala") {
        // Un cambio a La escala (25 nov): lo pedido no va a la nota, y la propuesta queda en el hilo, con su vuelta.
        const conElCambio = sobreLoDeAhora().map((m, i) => (i === conLaPersona.length - 1 ? { ...m, es: "cambio" as const } : m));
        setMensajes([...conElCambio, { de: "nexus", es: "escala", texto: textoDeLaEscala(turno.escala), vuelta: turno.escala.id, escala: turno.escala }]);
      } else if (turno.tipo === "listo") {
        // No leyó: nada se guarda como nota (podía ser una pregunta), y el texto vuelve a la caja.
        if (turno.sinLeer) throw new Error("Nexus no pudo leerlo esta vez. Vuelve a intentarlo: no se guardó nada.");
        await alQuedarListo({ conversacion, nota: notaDeLaConversacion(conLaPersona), turno });
      }
      setContadoAMano(modo === "contar");
      if (conPrefijo) alUsarElPrefijo?.();
      alResponder?.();
    } catch (e) {
      // Lo que escribió no se pierde: vuelve a la caja (o, al contarlo como nota, la respuesta vuelve a su lugar).
      setMensajes(antes);
      // Lo escrito mientras Nexus pensaba no se pisa: va debajo de lo que vuelve.
      if (modo === "normal") setTexto((x) => devolverALaCaja(t, x));
      setError(e instanceof Error ? e.message : "Nexus no pudo responder.");
      // «Guardarlo como nota» sin nada del cliente: ese botón no vuelve para lo mismo.
      if (modo === "contar" && e instanceof Error && e.message === NADA_QUE_GUARDAR) setSinNadaQueGuardar((s) => new Set([...s, t]));
    } finally {
      setPensando(false);
    }
  };

  const enviar = () => {
    const t = texto.trim();
    if (apagado || aplicando) return;
    if (!terminado) return mandar(t, mensajes, "normal", mensajes, undefined, prefijo);
    if (!alSeguir || !t || pensando) return;
    // Seguir después de guardar: lo guardado queda marcado y el lugar lo olvida.
    const base = paraSeguirDespuesDeGuardar(mensajes);
    setMensajes(base);
    alSeguir();
    return mandar(t, base, "normal", base, undefined, prefijo);
  };

  /**
   * «Guardarlo como nota»: lo que la persona escribió se cuenta, y la respuesta sale de la conversación. Debajo de una lista
   * viva de la cuenta, esa lista ya no va (`soltar`): no se arrastra al pedido siguiente.
   */
  const contarComoNota = (i: number) => {
    const c = paraContarComoNota(mensajes, i);
    const l = mensajes[i]?.lista;
    if (c) void mandar(c.texto, c.base, "contar", mensajes, l?.estado === "viva" ? l.id : undefined);
  };
  /** ¿Va «Guardarlo como nota» debajo del mensaje `i`? Solo si lo de la persona puede contar algo y no se probó ya sin nada. */
  const conGuardarComoNota = (i: number) => {
    const c = paraContarComoNota(mensajes, i);
    return !!c && !sinNadaQueGuardar.has(c.texto);
  };

  /**
   * «¿Era una pregunta? Respóndela»: lo último que escribió se responde, y solo con la respuesta en la mano el lugar olvida
   * lo que iba a guardarse (`mandar`). Si falla, lo propuesto sigue con su «Guardar».
   */
  const preguntarEnVezDeGuardar = () => {
    const c = paraPreguntar(mensajes);
    if (c) void mandar(c.texto, c.base, "preguntar");
  };
  const conPreguntar = terminado && sePuedePreguntar && !contadoAMano && !!alVolverAConversar && paraPreguntar(mensajes) !== null;

  /**
   * «Aplicar» una lista de la cuenta: manda solo cuál (`vuelta`) y lo desmarcado; el servidor la lee de la vuelta, la vuelve
   * a preparar contra hoy y la aplica. Lo que respondió reemplaza la lista en el hilo (aplicada, con lo que dejó).
   */
  const aplicarLista = async (l: ListaEnLaConversacion, desmarcadas: number[]) => {
    if (ocupado) return;
    setAplicando(l.id);
    setError(null);
    try {
      const r = await fetch(`${urlDelTurno}/aplicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacion, vuelta: l.id, desmarcadas }),
      });
      const j = (await r.json().catch(() => null)) as { lista?: ListaEnLaConversacion; error?: string } | null;
      if (!r.ok || !j?.lista) throw new Error(j?.error ?? "No se pudo aplicar. Inténtalo de nuevo en un momento.");
      // Sobre la conversación de ahora (si sigue siendo esta): nada de lo que pasó mientras tanto se pierde.
      const ahora = conversacionDeAhora.current;
      if (ahora.id === conversacion) alCambiar({ id: ahora.id, mensajes: conLaListaAplicada(ahora.mensajes, j.lista) });
      if (j.lista.estado === "aplicada") alAplicar?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar.");
    } finally {
      setAplicando(null);
    }
  };

  /**
   * Cambia la propuesta a La escala de la vuelta `vuelta` (lo aplicado, lo descartado) sobre la conversación de AHORA. El
   * ref se pone al día enseguida: dos cambios seguidos no se pisan.
   */
  const cambiarLaEscala = (vuelta: string, f: (e: EscalaEnLaConversacion) => EscalaEnLaConversacion) => {
    const ahora = conversacionDeAhora.current;
    if (ahora.id !== conversacion) return;
    const nueva = { id: ahora.id, mensajes: ahora.mensajes.map((m) => (m.es === "escala" && m.vuelta === vuelta && m.escala ? { ...m, escala: f(m.escala) } : m)) };
    conversacionDeAhora.current = nueva;
    alCambiar(nueva);
  };

  const reiniciar = () => {
    setTexto("");
    setError(null);
    setContadoAMano(false);
    alReiniciar();
  };

  /* Con lo de arriba sin terminar («Guardar» o «No guardar», un «Aplicar», la cuenta de La escala o su revisión), la caja
     espera: mandar algo nuevo lo borraría. El texto no nombra «Guardar»: puede que ya esté guardado y falte otra cosa. */
  const esperando = terminado && !alSeguir ? "Termina lo de arriba para seguir conversando." : null;
  // Mientras se aplica una lista, la caja espera: lo que llegara entretanto quedaría debajo de un «Aplicar» a medias.
  const cajaApagada = apagado ?? esperando ?? (aplicando ? "Nexus está aplicando la lista…" : null);

  return (
    <CajonDeNexus
      abierto={abierto}
      onClose={onClose}
      cajaRef={cajaRef}
      ariaLabel="Nexus · conversación"
      subtitulo={subtitulo}
      garantia={garantia}
      arriba={arriba}
      ancho={ancho}
      onAncho={onAncho}
      nuevaConversacion={{
        alHacer: reiniciar,
        apagada: (!terminado && mensajes.length === 0) || ocupado,
        titulo: "Empezar una conversación nueva (lo que no guardaste no queda)",
      }}
      pedidoDeFoco={pedidoDeFoco}
      // El estado de cada lista también: aplicar no suma un mensaje, pero el hilo baja a lo que dejó.
      alFinal={`${mensajes.length}·${pensando}·${terminado}·${error ?? ""}·${mensajes.map((m) => m.lista?.estado ?? "").join("")}`}
      pie={
        <>
        {chip ? (
          <ChipDeNexus onQuitar={chip.alQuitar} quitarLabel={chip.quitarLabel ?? "Volver a la conversación de siempre"}>
            {chip.texto}
          </ChipDeNexus>
        ) : null}
        {/* Con la caja apagada, los pedidos se esconden: un clic llenaría una caja que no se puede mandar. */}
        {sugerencias?.length && !texto.trim() && !ocupado && !cajaApagada ? (
          <SugerenciasDeNexus
            sugerencias={sugerencias}
            alElegir={(s) => {
              setTexto(s);
              cajaRef.current?.focus();
            }}
          />
        ) : null}
        <CajaDeNexus
          cajaRef={cajaRef}
          texto={texto}
          setTexto={setTexto}
          onEnviar={() => void enviar()}
          enviarApagado={pensando || !texto.trim()}
          placeholder={
            prefijo
              ? "Lo que sabes de esto…"
              : lugar === "guia"
                ? "Pídele un cambio a la guía…"
                : escala
                  ? "Pídele un cambio a esta parte, o pregúntale algo…"
                  : mensajes.length
                    ? "Tu respuesta, u otra pregunta…"
                    : "Cuéntale o pregúntale algo del cliente…"
          }
          ariaLabel={lugar === "guia" ? "Lo que le pides a Nexus sobre la guía" : escala ? "Lo que le pides o preguntas a Nexus" : mensajes.length ? "Tu mensaje" : "Lo que le cuentas o le preguntas a Nexus"}
          apagada={cajaApagada}
          // Con el prefijo de «Responder con Nexus», lo que la persona escribe deja lugar para él: el mensaje entero no puede
          // pasar el tope del servidor (revisión del 24 nov: volvía «Cuerpo inválido» sin decir por qué).
          maxLength={TOPES.largoDelMensaje - (prefijo?.length ?? 0)}
          conDictado
          onErrorDeDictado={setError}
        />
        </>
      }
    >
      {aviso}
      {mensajes.length === 0 && !terminado && <ChatVacio intro={vacio.intro} ejemplos={vacio.ejemplos} cierre={<p>{vacio.cierre}</p>} />}

      {mensajes.length > 0 && (
        <ol className="flex flex-col gap-3" aria-label="La conversación">
          {mensajes.map((m, i) => (
            <li key={i}>
              {m.escala && pintarLaEscala ? (
                // Una propuesta a La escala (25 nov): la pinta el lugar, con su «Aplicar» y su «Deshacer».
                <div className="space-y-2">{pintarLaEscala(m.escala, (f) => cambiarLaEscala(m.escala!.id, f), ocupado)}</div>
              ) : m.lista ? (
                <>
                  <LaLista l={m.lista} aplicando={aplicando === m.lista.id} apagado={ocupado || !!apagado} onAplicar={(d) => void aplicarLista(m.lista!, d)} />
                  {/* Lo que se leyó como pedido y se quería contar: un clic lo cuenta (y la lista, si está viva, ya no va). */}
                  {!terminado && seGuardaComoNota(m.lista) && conGuardarComoNota(i) && (
                    <p className="mr-2 mt-2 flex flex-wrap items-center gap-x-1.5 text-2xs text-fg-muted">
                      ¿Era algo que querías contar?
                      <BotonEnlace className="py-0 text-2xs" disabled={!!apagado || ocupado} onClick={() => contarComoNota(i)}>
                        Guardarlo como nota
                      </BotonEnlace>
                    </p>
                  )}
                </>
              ) : (
              /* Lo que tiene formato (una respuesta) no conserva los saltos crudos: los pone el Markdown. */
              <Burbuja de={m.de === "persona" ? "persona" : "nexus"} className={m.de === "nexus" && !m.respuesta ? "whitespace-pre-wrap" : undefined}>
                {m.respuesta ? <LaRespuesta r={m.respuesta} /> : m.texto}
                {!terminado && conGuardarComoNota(i) && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-1.5 border-t border-line pt-1.5 text-2xs text-fg-muted">
                    ¿Era algo que querías contar?
                    <BotonEnlace className="py-0 text-2xs" disabled={!!apagado || ocupado} onClick={() => contarComoNota(i)}>
                      Guardarlo como nota
                    </BotonEnlace>
                  </p>
                )}
                {conPreguntar && i === mensajes.length - 1 && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-1.5 border-t border-line pt-1.5 text-2xs text-fg-muted">
                    ¿Era una pregunta?
                    <BotonEnlace className="py-0 text-2xs" disabled={!!apagado || ocupado} onClick={preguntarEnVezDeGuardar}>
                      Respóndela
                    </BotonEnlace>
                  </p>
                )}
              </Burbuja>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Para el lector de pantalla: montada siempre, así anuncia cuando Nexus empieza a pensar. */}
      <p role="status" aria-live="polite" className="sr-only">
        {pensando ? "Nexus está pensando" : ""}
      </p>
      {pensando && <Pensando />}
      {error && <Alert variant="danger">{error}</Alert>}
      {avisoDelMes && !error && <p className="text-2xs text-fg-muted">{avisoDelMes}</p>}

      {/* Mientras Nexus responde «¿Era una pregunta?», lo que pinta el lugar («Guardar», «No guardar», «Aplicar») espera: la
          respuesta que llega después no puede deshacer lo que se apretó entretanto. */}
      {terminado && (
        <fieldset disabled={pensando} className="m-0 min-w-0 border-0 p-0">
          {children}
        </fieldset>
      )}
    </CajonDeNexus>
  );
}
