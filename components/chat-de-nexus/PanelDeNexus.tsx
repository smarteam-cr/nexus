"use client";

/**
 * PanelDeNexus — la conversación de «Hablar con Nexus» (Elías, 21 nov), sin saber de qué lugar es.
 *
 * La persona escribe o dicta (el dictado del navegador, components/ui/BotonDeDictado); Enter envía y Shift+Enter baja de
 * renglón. Si CUENTA algo, Nexus pregunta lo que falta (como mucho dos rondas, lib/chat-de-nexus/conversacion.ts) y,
 * cuando entiende, el lugar recibe lo que quedó: la nota con las palabras de la persona y los cambios propuestos
 * (`alQuedarListo`). El lugar NO guarda nada sin un clic: muestra qué cambia y «Guardar». Si PREGUNTA algo de la cuenta,
 * Nexus responde con sus citas y con formato (lib/chat-de-nexus/respuesta.ts, ./TextoConFormato) y la conversación sigue.
 * Cada lado tiene su salida por si se leyó mal: «Guardarlo como nota» debajo de la última respuesta, y «¿Era una
 * pregunta? Respóndela» debajo de lo que iba a guardarse (mientras el lugar diga `sePuedePreguntar`). Lo que el lugar hace
 * con lo contado (guardar la nota, «Aplicar», la cuenta regresiva) lo pinta `children`, y el lugar decide cuándo está
 * `terminado`. La
 * conversación también la guarda el lugar (`conversacion`, `alCambiar`): cerrar el cajón y volver a abrirlo no pierde lo
 * hablado ni lo propuesto, y al volver a la página el lugar la trae del servidor (lib/chat-de-nexus/guardada.ts). Si Nexus no pudo leer lo que contaste, el texto vuelve al cuadro y no se guarda nada. Hoy lo usa la preventa
 * (components/exploraciones/HablarConNexus.tsx); mañana, la ficha del cliente y cada documento, con su propia ruta.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, BotonDeDictado, Textarea } from "@/components/ui";
import { BotonAzul, BotonEnlace } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { notaDeLaConversacion, paraContarComoNota, paraPreguntar, TOPES, type ResultadoDelTurno } from "@/lib/chat-de-nexus/conversacion";
import type { MensajeGuardado } from "@/lib/chat-de-nexus/guardada";
import type { CitaDeLaRespuesta, RespuestaDeNexus } from "@/lib/chat-de-nexus/respuesta";
import TextoConFormato from "./TextoConFormato";

export type TurnoListo = Extract<ResultadoDelTurno, { tipo: "listo" }>;

/** ¿Se usa con el dedo? (el celular): ahí Enter baja de renglón. */
const esTactil = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

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

export interface PanelDeNexusProps {
  /** La ruta de una vuelta (POST { conversacion, mensajes } → { turno, quedan }). */
  urlDelTurno: string;
  placeholder: string;
  /** Cuando Nexus entendió lo que contaste: el lugar muestra qué cambia y espera el «Guardar». Si lanza, el panel muestra el error. */
  alQuedarListo: (l: { conversacion: string; nota: string; turno: TurnoListo }) => Promise<void>;
  /** Lo contado ya tiene adónde ir: se pinta `children` en vez del cuadro de texto. Lo decide el lugar. */
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
  disabled?: boolean;
}

export default function PanelDeNexus({
  urlDelTurno,
  placeholder,
  alQuedarListo,
  terminado,
  children,
  conversacion: c,
  alCambiar,
  alReiniciar,
  sePuedePreguntar = false,
  alVolverAConversar,
  disabled,
}: PanelDeNexusProps) {
  const { id: conversacion, mensajes } = c;
  const setMensajes = (m: MensajeEnPantalla[]) => alCambiar({ id: conversacion, mensajes: m });
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La persona eligió «Guardarlo como nota»: debajo de lo que iba a guardarse no vuelve «¿Era una pregunta?» (sin ida y
  // vuelta entre los dos botones).
  const [contadoAMano, setContadoAMano] = useState(false);
  // El texto del último render, para sumar lo dictado sin rearmar el dictado en cada tecla.
  const ultimo = useRef("");
  useEffect(() => {
    ultimo.current = texto;
  }, [texto]);

  const dictado = (frase: string) => {
    const base = ultimo.current.replace(/\s+$/, "");
    const nuevo = `${base}${base ? (/[.!?]$/.test(base) ? " " : ". ") : ""}${frase.charAt(0).toUpperCase()}${frase.slice(1)}`.slice(0, TOPES.largoDelMensaje);
    ultimo.current = nuevo;
    setTexto(nuevo);
  };

  /**
   * Una vuelta: `t` va al final de `base`. `modo`: «contar», lo último se cuenta aunque tenga forma de pregunta («Guardarlo
   * como nota»); «preguntar», se responde («¿Era una pregunta?»). Si falla, la conversación vuelve a como estaba y, en un
   * envío normal, lo escrito vuelve al cuadro.
   */
  const mandar = async (t: string, base: MensajeEnPantalla[], modo: "normal" | "contar" | "preguntar") => {
    if (!t || pensando) return;
    const antes = mensajes;
    const conLaPersona: MensajeEnPantalla[] = [...base, { de: "persona", texto: t }];
    setMensajes(conLaPersona);
    if (modo === "normal") setTexto("");
    setPensando(true);
    setError(null);
    try {
      const paraMandar = conLaPersona.map(({ de, texto: x, es }) => ({ de, texto: x, ...(es ? { es } : {}) }));
      const r = await fetch(urlDelTurno, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacion, mensajes: paraMandar, ...(modo === "contar" ? { contar: true } : modo === "preguntar" ? { preguntar: true } : {}) }),
      });
      const j = (await r.json().catch(() => null)) as { turno?: ResultadoDelTurno; error?: string } | null;
      if (!r.ok || !j?.turno) throw new Error(j?.error ?? "Nexus no pudo responder. Inténtalo de nuevo.");
      const turno = j.turno;
      if (turno.tipo === "pregunta") {
        setMensajes([...conLaPersona, { de: "nexus", texto: turno.preguntas.join("\n") }]);
      } else if (turno.tipo === "respuesta") {
        // «¿Era una pregunta?»: recién con la respuesta en la mano el lugar olvida lo que iba a guardarse. Si fallaba
        // antes, lo propuesto seguía a la vista con su «Guardar».
        if (modo === "preguntar") alVolverAConversar?.();
        // Lo que preguntó no va a la nota; la respuesta no cuenta como una ronda de preguntas.
        const conLaConsulta = conLaPersona.map((m, i) => (i === conLaPersona.length - 1 ? { ...m, es: "consulta" as const } : m));
        setMensajes([...conLaConsulta, { de: "nexus", es: "respuesta", texto: turno.respuesta.texto, respuesta: turno.respuesta }]);
      } else if (turno.tipo === "listo") {
        // No leyó: nada se guarda como nota (podía ser una pregunta), y el texto vuelve al cuadro.
        if (turno.sinLeer) throw new Error("Nexus no pudo leerlo esta vez. Vuelve a intentarlo: no se guardó nada.");
        await alQuedarListo({ conversacion, nota: notaDeLaConversacion(conLaPersona), turno });
      }
      setContadoAMano(modo === "contar");
    } catch (e) {
      // Lo que escribió no se pierde: vuelve al cuadro (o, al contarlo como nota, la respuesta vuelve a su lugar).
      setMensajes(antes);
      if (modo === "normal") setTexto(t);
      setError(e instanceof Error ? e.message : "Nexus no pudo responder.");
    } finally {
      setPensando(false);
    }
  };

  const enviar = () => mandar(texto.trim(), mensajes, "normal");

  /** «Guardarlo como nota»: lo que la persona escribió se cuenta, y la respuesta sale de la conversación. */
  const contarComoNota = (i: number) => {
    const c = paraContarComoNota(mensajes, i);
    if (c) void mandar(c.texto, c.base, "contar");
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

  const reiniciar = () => {
    setTexto("");
    setError(null);
    setContadoAMano(false);
    alReiniciar();
  };

  return (
    <div className="flex flex-col gap-4">
      {mensajes.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label="La conversación">
          {mensajes.map((m, i) => (
            <li
              key={i}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-[13px] leading-[19px]",
                // Lo que tiene formato (una respuesta) no conserva los saltos crudos: los pone el Markdown.
                !m.respuesta && "whitespace-pre-wrap",
                m.de === "persona" ? "self-end bg-surface-muted text-fg" : "self-start border border-line bg-surface text-fg",
              )}
            >
              {m.de === "nexus" && <span className="mb-0.5 block text-2xs font-semibold text-brand">Nexus</span>}
              {m.respuesta ? <LaRespuesta r={m.respuesta} /> : m.texto}
              {!terminado && paraContarComoNota(mensajes, i) && (
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 border-t border-line pt-1.5 text-2xs text-fg-muted">
                  ¿Era algo que querías contar?
                  <BotonEnlace className="py-0 text-2xs" disabled={disabled || pensando} onClick={() => contarComoNota(i)}>
                    Guardarlo como nota
                  </BotonEnlace>
                </p>
              )}
              {conPreguntar && i === mensajes.length - 1 && (
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 border-t border-line pt-1.5 text-2xs text-fg-muted">
                  ¿Era una pregunta?
                  <BotonEnlace className="py-0 text-2xs" disabled={disabled || pensando} onClick={preguntarEnVezDeGuardar}>
                    Respóndela
                  </BotonEnlace>
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {pensando && <p className="text-2xs text-fg-muted" aria-live="polite">Nexus está leyendo…</p>}
      {error && <Alert variant="danger">{error}</Alert>}

      {terminado ? (
        // Mientras Nexus responde «¿Era una pregunta?», lo que pinta el lugar («Guardar», «No guardar», «Aplicar») espera:
        // la respuesta que llega después no puede deshacer lo que se apretó entretanto.
        <fieldset disabled={pensando} className="m-0 min-w-0 border-0 p-0">
          {children}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Textarea
              className="pr-11"
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, TOPES.largoDelMensaje))}
              onKeyDown={(e) => {
                // Enter envía, como el botón; Shift+Enter baja de renglón. Mientras se compone un acento, no envía. En el
                // celular (puntero táctil) Enter baja de renglón: ahí no hay Shift y se envía con el botón.
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || esTactil()) return;
                e.preventDefault();
                void enviar();
              }}
              rows={mensajes.length ? 3 : 5}
              maxLength={TOPES.largoDelMensaje}
              autoFocus
              disabled={disabled || pensando}
              aria-label={mensajes.length ? "Tu mensaje" : "Lo que le cuentas o le preguntas a Nexus"}
              placeholder={mensajes.length ? "Tu respuesta, u otra pregunta…" : placeholder}
            />
            <BotonDeDictado variante="icono" className="absolute bottom-2 right-2" onTexto={dictado} onError={setError} disabled={disabled || pensando} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs text-fg-muted">Si cuentas algo, te muestro qué cambia y lo guardas tú. Enter envía; Shift+Enter, otro renglón.</p>
            <BotonAzul disabled={disabled || pensando || !texto.trim()} onClick={() => void enviar()}>
              Enviar
            </BotonAzul>
          </div>
        </div>
      )}
      {(terminado || mensajes.length > 0) && (
        <div>
          <BotonEnlace onClick={reiniciar} disabled={pensando}>
            Nueva conversación
          </BotonEnlace>
        </div>
      )}
    </div>
  );
}
