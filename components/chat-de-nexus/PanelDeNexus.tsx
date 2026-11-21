"use client";

/**
 * PanelDeNexus — la conversación de «Hablar con Nexus» (Elías, 21 nov), sin saber de qué lugar es.
 *
 * La persona escribe o dicta (el dictado del navegador, components/ui/BotonDeDictado). Si CUENTA algo, Nexus pregunta lo
 * que falta (como mucho dos rondas, lib/chat-de-nexus/conversacion.ts) y, cuando entiende, el lugar recibe lo que quedó:
 * la nota con las palabras de la persona y los cambios propuestos (`alQuedarListo`). Si PREGUNTA algo de la cuenta, Nexus
 * responde con sus citas (lib/chat-de-nexus/respuesta.ts) y la conversación sigue. Lo que el lugar hace con lo contado
 * (guardar la nota, «Aplicar», la cuenta regresiva) lo pinta `children`, y el lugar decide cuándo está `terminado`. La
 * conversación también la guarda el lugar (`conversacion`, `alCambiar`): cerrar el cajón y volver a abrirlo no pierde lo
 * hablado ni lo propuesto, y al volver a la página el lugar la trae del servidor (lib/chat-de-nexus/guardada.ts). Si Nexus no pudo leer lo que contaste, el texto vuelve al cuadro y no se guarda nada. Hoy lo usa la preventa
 * (components/exploraciones/HablarConNexus.tsx); mañana, la ficha del cliente y cada documento, con su propia ruta.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, BotonDeDictado, Textarea } from "@/components/ui";
import { BotonAzul, BotonEnlace } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { notaDeLaConversacion, TOPES, type ResultadoDelTurno } from "@/lib/chat-de-nexus/conversacion";
import type { MensajeGuardado } from "@/lib/chat-de-nexus/guardada";
import type { CitaDeLaRespuesta, RespuestaDeNexus } from "@/lib/chat-de-nexus/respuesta";

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
      <p className={cn(r.sabe ? "text-fg" : "text-fg-muted")}>{r.texto}</p>
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
  /** Cuando Nexus entendió lo que contaste: el lugar guarda la nota y prepara lo suyo. Si lanza, el panel muestra el error. */
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
  disabled?: boolean;
}

export default function PanelDeNexus({ urlDelTurno, placeholder, alQuedarListo, terminado, children, conversacion: c, alCambiar, alReiniciar, disabled }: PanelDeNexusProps) {
  const { id: conversacion, mensajes } = c;
  const setMensajes = (m: MensajeEnPantalla[]) => alCambiar({ id: conversacion, mensajes: m });
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const enviar = async () => {
    const t = texto.trim();
    if (!t || pensando) return;
    const conLaPersona: MensajeEnPantalla[] = [...mensajes, { de: "persona", texto: t }];
    setMensajes(conLaPersona);
    setTexto("");
    setPensando(true);
    setError(null);
    try {
      const paraMandar = conLaPersona.map(({ de, texto: x, es }) => ({ de, texto: x, ...(es ? { es } : {}) }));
      const r = await fetch(urlDelTurno, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversacion, mensajes: paraMandar }) });
      const j = (await r.json().catch(() => null)) as { turno?: ResultadoDelTurno; error?: string } | null;
      if (!r.ok || !j?.turno) throw new Error(j?.error ?? "Nexus no pudo responder. Inténtalo de nuevo.");
      const turno = j.turno;
      if (turno.tipo === "pregunta") {
        setMensajes([...conLaPersona, { de: "nexus", texto: turno.preguntas.join("\n") }]);
      } else if (turno.tipo === "respuesta") {
        // Lo que preguntó no va a la nota; la respuesta no cuenta como una ronda de preguntas.
        const conLaConsulta = conLaPersona.map((m, i) => (i === conLaPersona.length - 1 ? { ...m, es: "consulta" as const } : m));
        setMensajes([...conLaConsulta, { de: "nexus", es: "respuesta", texto: turno.respuesta.texto, respuesta: turno.respuesta }]);
      } else if (turno.tipo === "listo") {
        // No leyó: nada se guarda como nota (podía ser una pregunta), y el texto vuelve al cuadro.
        if (turno.sinLeer) throw new Error("Nexus no pudo leerlo esta vez. Vuelve a intentarlo: no se guardó nada.");
        await alQuedarListo({ conversacion, nota: notaDeLaConversacion(conLaPersona), turno });
      }
    } catch (e) {
      // Lo que escribió no se pierde: vuelve al cuadro.
      setMensajes(mensajes);
      setTexto(t);
      setError(e instanceof Error ? e.message : "Nexus no pudo responder.");
    } finally {
      setPensando(false);
    }
  };

  const reiniciar = () => {
    setTexto("");
    setError(null);
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
                "max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-[19px]",
                m.de === "persona" ? "self-end bg-surface-muted text-fg" : "self-start border border-line bg-surface text-fg",
              )}
            >
              {m.de === "nexus" && <span className="mb-0.5 block text-2xs font-semibold text-brand">Nexus</span>}
              {m.respuesta ? <LaRespuesta r={m.respuesta} /> : m.texto}
            </li>
          ))}
        </ol>
      )}

      {pensando && <p className="text-2xs text-fg-muted" aria-live="polite">Nexus está leyendo…</p>}
      {error && <Alert variant="danger">{error}</Alert>}

      {terminado ? (
        children
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Textarea
              className="pr-11"
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, TOPES.largoDelMensaje))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar();
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
            <p className="text-2xs text-fg-muted">Lo que cuentas se guarda con tu nombre en «Lo que sabes del cliente». Lo que preguntas, no.</p>
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
