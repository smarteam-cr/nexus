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
 */
import { useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui";
import { BotonEnlace } from "@/components/ui/sistema";
import CajonDeNexus, { Burbuja, CajaDeNexus, ChatVacio, Pensando } from "@/components/asistente/CajonDeNexus";
import { devolverALaCaja } from "@/lib/asistente/caja";
import { notaDeLaConversacion, paraContarComoNota, paraPreguntar, paraSeguirDespuesDeGuardar, TOPES, type ResultadoDelTurno } from "@/lib/chat-de-nexus/conversacion";
import type { MensajeGuardado } from "@/lib/chat-de-nexus/guardada";
import type { CitaDeLaRespuesta, RespuestaDeNexus } from "@/lib/chat-de-nexus/respuesta";
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

export interface PanelDeNexusProps {
  /** El chat abierto o cerrado, y cómo se cierra (la ✕ de la cabecera o Escape). */
  abierto: boolean;
  onClose: () => void;
  /** De qué se habla, debajo de «Nexus» («Preventa · …»). */
  subtitulo: string;
  /** Fijo arriba del hilo (en la preventa: «Tareas, siguiente paso o la guía»). */
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
}

export default function PanelDeNexus({
  abierto,
  onClose,
  subtitulo,
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
  const cajaRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Una vuelta: `t` va al final de `base`. `modo`: «contar», lo último se cuenta aunque tenga forma de pregunta («Guardarlo
   * como nota»); «preguntar», se responde («¿Era una pregunta?»). Si falla, la conversación vuelve a como estaba y, en un
   * envío normal, lo escrito vuelve a la caja. `antes`: a qué vuelve si falla (al seguir después de guardar, con lo
   * guardado ya marcado: el lugar ya lo olvidó).
   */
  const mandar = async (t: string, base: MensajeEnPantalla[], modo: "normal" | "contar" | "preguntar", antes: MensajeEnPantalla[] = mensajes) => {
    if (!t || pensando) return;
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
      const j = (await r.json().catch(() => null)) as { turno?: ResultadoDelTurno; error?: string; aviso?: string } | null;
      if (!r.ok || !j?.turno) throw new Error(j?.error ?? "Nexus no pudo responder. Inténtalo de nuevo.");
      setAvisoDelMes(j.aviso ?? null);
      const turno = j.turno;
      if (turno.tipo === "pregunta") {
        setMensajes([...conLaPersona, { de: "nexus", texto: turno.preguntas.join("\n") }]);
      } else if (turno.tipo === "cortesia") {
        // Un «gracias» o un «ok»: ni va a la nota ni se ofrece guardarlo.
        const conLaCortesia = conLaPersona.map((m, i) => (i === conLaPersona.length - 1 ? { ...m, es: "cortesia" as const } : m));
        setMensajes([...conLaCortesia, { de: "nexus", es: "cortesia", texto: turno.texto }]);
      } else if (turno.tipo === "respuesta") {
        // «¿Era una pregunta?»: recién con la respuesta en la mano el lugar olvida lo que iba a guardarse. Si fallaba
        // antes, lo propuesto seguía a la vista con su «Guardar».
        if (modo === "preguntar") alVolverAConversar?.();
        // Lo que preguntó no va a la nota; la respuesta no cuenta como una ronda de preguntas.
        const conLaConsulta = conLaPersona.map((m, i) => (i === conLaPersona.length - 1 ? { ...m, es: "consulta" as const } : m));
        setMensajes([...conLaConsulta, { de: "nexus", es: "respuesta", texto: turno.respuesta.texto, respuesta: turno.respuesta }]);
      } else if (turno.tipo === "listo") {
        // No leyó: nada se guarda como nota (podía ser una pregunta), y el texto vuelve a la caja.
        if (turno.sinLeer) throw new Error("Nexus no pudo leerlo esta vez. Vuelve a intentarlo: no se guardó nada.");
        await alQuedarListo({ conversacion, nota: notaDeLaConversacion(conLaPersona), turno });
      }
      setContadoAMano(modo === "contar");
    } catch (e) {
      // Lo que escribió no se pierde: vuelve a la caja (o, al contarlo como nota, la respuesta vuelve a su lugar).
      setMensajes(antes);
      // Lo escrito mientras Nexus pensaba no se pisa: va debajo de lo que vuelve.
      if (modo === "normal") setTexto((x) => devolverALaCaja(t, x));
      setError(e instanceof Error ? e.message : "Nexus no pudo responder.");
    } finally {
      setPensando(false);
    }
  };

  const enviar = () => {
    const t = texto.trim();
    if (apagado) return;
    if (!terminado) return mandar(t, mensajes, "normal");
    if (!alSeguir || !t || pensando) return;
    // Seguir después de guardar: lo guardado queda marcado y el lugar lo olvida.
    const base = paraSeguirDespuesDeGuardar(mensajes);
    setMensajes(base);
    alSeguir();
    return mandar(t, base, "normal", base);
  };

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

  /* Con lo de arriba sin terminar («Guardar» o «No guardar», un «Aplicar», la cuenta de La escala o su revisión), la caja
     espera: mandar algo nuevo lo borraría. El texto no nombra «Guardar»: puede que ya esté guardado y falte otra cosa. */
  const esperando = terminado && !alSeguir ? "Termina lo de arriba para seguir conversando." : null;
  const cajaApagada = apagado ?? esperando;

  return (
    <CajonDeNexus
      abierto={abierto}
      onClose={onClose}
      cajaRef={cajaRef}
      ariaLabel="Nexus · conversación"
      subtitulo={subtitulo}
      arriba={arriba}
      ancho={ancho}
      onAncho={onAncho}
      nuevaConversacion={{
        alHacer: reiniciar,
        apagada: (!terminado && mensajes.length === 0) || pensando,
        titulo: "Empezar una conversación nueva (lo que no guardaste no queda)",
      }}
      pedidoDeFoco={pedidoDeFoco}
      alFinal={`${mensajes.length}·${pensando}·${terminado}·${error ?? ""}`}
      pie={
        <CajaDeNexus
          cajaRef={cajaRef}
          texto={texto}
          setTexto={setTexto}
          onEnviar={() => void enviar()}
          enviarApagado={pensando || !texto.trim()}
          placeholder={mensajes.length ? "Tu respuesta, u otra pregunta…" : "Cuéntale o pregúntale algo del cliente…"}
          ariaLabel={mensajes.length ? "Tu mensaje" : "Lo que le cuentas o le preguntas a Nexus"}
          apagada={cajaApagada}
          maxLength={TOPES.largoDelMensaje}
          conDictado
          onErrorDeDictado={setError}
        />
      }
    >
      {aviso}
      {mensajes.length === 0 && !terminado && <ChatVacio intro={vacio.intro} ejemplos={vacio.ejemplos} cierre={<p>{vacio.cierre}</p>} />}

      {mensajes.length > 0 && (
        <ol className="flex flex-col gap-3" aria-label="La conversación">
          {mensajes.map((m, i) => (
            <li key={i}>
              {/* Lo que tiene formato (una respuesta) no conserva los saltos crudos: los pone el Markdown. */}
              <Burbuja de={m.de === "persona" ? "persona" : "nexus"} className={m.de === "nexus" && !m.respuesta ? "whitespace-pre-wrap" : undefined}>
                {m.respuesta ? <LaRespuesta r={m.respuesta} /> : m.texto}
                {!terminado && paraContarComoNota(mensajes, i) && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-1.5 border-t border-line pt-1.5 text-2xs text-fg-muted">
                    ¿Era algo que querías contar?
                    <BotonEnlace className="py-0 text-2xs" disabled={!!apagado || pensando} onClick={() => contarComoNota(i)}>
                      Guardarlo como nota
                    </BotonEnlace>
                  </p>
                )}
                {conPreguntar && i === mensajes.length - 1 && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-1.5 border-t border-line pt-1.5 text-2xs text-fg-muted">
                    ¿Era una pregunta?
                    <BotonEnlace className="py-0 text-2xs" disabled={!!apagado || pensando} onClick={preguntarEnVezDeGuardar}>
                      Respóndela
                    </BotonEnlace>
                  </p>
                )}
              </Burbuja>
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
