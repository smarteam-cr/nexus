"use client";
/**
 * components/asistente/CajonDeNexus.tsx — EL CHAT «NEXUS», UNO SOLO (Elías, 24 nov).
 *
 * «Todo debe abrir el mismo chat con la misma interfaz»: el botón «Nexus», «✨ Mejorar con IA», el chat de un documento,
 * el del cronograma, el de la cuenta, el de Tareas y el de la preventa. Hasta el 24 nov había dos caras: el cajón de los
 * documentos (lateral, sin fondo oscuro) y una ventana modal en la preventa, con su título, su «Nueva conversación» al pie
 * y su caja distinta. Elías eligió la de los documentos («la veo más sencilla»), con buenas prácticas de un chat. Este es
 * ese marco, y lo usan todos (components/asistente/ChatDelAsistente.tsx, components/chat-de-nexus/PanelDeNexus.tsx y
 * components/exploraciones/PedirleANexus.tsx). Cada uno pone su conversación adentro: este archivo no sabe de acuerdos,
 * notas ni propuestas.
 *
 * Lo que garantiza el marco, para todos:
 *  · Un solo título, «Nexus», y debajo de qué se habla («Diagnóstico · …», «Preventa · …»).
 *  · «Nueva conversación» en la cabecera, arriba a la derecha junto a cerrar, SIEMPRE a la vista (apagada si no hay nada).
 *  · La caja fija abajo: crece al escribir, Enter envía, Shift+Enter baja de renglón (en el celular, Enter baja de renglón
 *    y se envía con el botón; mientras se compone un acento, no envía).
 *  · Lo que se mejora, como chip quitable encima de la caja (`ChipDeNexus`).
 *  · «Nexus está pensando…» a la vista, y el hilo baja solo al último mensaje.
 *  · Escape cierra; los ejemplos, solo con el chat vacío (`ChatVacio`).
 *
 * ── POR QUÉ NO ES MODAL ─────────────────────────────────────────────────────────────────────
 * La conversación es SOBRE lo que está en pantalla: hay que poder mirar el documento, el cronograma o La escala mientras se
 * habla, y scrollearlos sin cerrar nada. Así que:
 *  · sin fondo oscuro y sin candado de scroll — la página sigue viva debajo;
 *  · `z-[45]`, por DEBAJO de los modales de verdad (z-55/60), así un `ConfirmDialog` lo tapa como corresponde;
 *  · por PORTAL a `document.body`, porque el riel del cliente es `sticky` y una capa flotante adentro de un contenedor con
 *    `sticky` se recorta contra él (ya mordido antes).
 * ⚠ El cajón TAPA los ~400 px derechos de la página: es el canje aceptado (se cierra con un clic o con Escape).
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { BotonDeDictado, Button, IconButton } from "@/components/ui";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { cn } from "@/lib/cn";
import { textoConLoDictado } from "@/lib/asistente/caja";

/** El único título del chat, en toda la app. */
export const TITULO_DEL_CHAT = "Nexus";

/** Lo dispara un chat al abrirse: los demás se cierran (ver el efecto de abajo). */
export const EVENTO_CHAT_ABIERTO = "nexus:chat-abierto";

/** El id del cajón. Lo apunta el `aria-controls` del botón que lo abre. */
export const ID_DEL_CAJON = "cajon-del-asistente";

/** Alto máximo de la caja antes de scrollear adentro — ~10 renglones, para no comerse el hilo. */
export const ALTO_MAXIMO_COMPOSER = 200;

/** ¿Se usa con el dedo? (el celular): ahí Enter baja de renglón y se envía con el botón. */
const esTactil = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

export interface CajonDeNexusProps {
  abierto: boolean;
  onClose: () => void;
  /** De qué se habla, debajo de «Nexus»: «Diagnóstico · Conversa el cambio antes de generarlo». */
  subtitulo: ReactNode;
  /** Una línea más debajo del subtítulo (lo que leyó el cronograma en su último turno). */
  debajoDelSubtitulo?: ReactNode;
  /**
   * Lo que se le garantiza a la persona («Nexus propone, tú aplicas; nada se publica»), en su propia línea y entera: el
   * subtítulo se corta con «…» y esto no se puede perder (segunda revisión del 24 nov).
   */
  garantia?: string;
  /** Para el lector de pantalla: «Nexus · Diagnóstico». */
  ariaLabel: string;
  /**
   * «Nueva conversación». Va siempre en la cabecera; `apagada` cuando no hay nada que empezar de nuevo o mientras Nexus
   * piensa o aplica. `titulo` explica qué pasa con la de antes.
   */
  nuevaConversacion: { alHacer: () => void; apagada: boolean; titulo?: string };
  /** El ancho del cajón. «amplio» para leer un plan largo. ⚠ El cronograma nunca: su Gantt se corre 400 px. */
  ancho?: "normal" | "amplio";
  /** Con esto, la cabecera ofrece «Más ancho» / «Más angosto». */
  onAncho?: () => void;
  /** Fijo arriba del hilo, debajo de la cabecera (en la preventa: «Tareas, siguiente paso o la guía»). */
  arriba?: ReactNode;
  /** El hilo: el chat vacío con sus ejemplos, los mensajes, las propuestas, «pensando…» y los errores. */
  children: ReactNode;
  /** Cambia cuando llega algo al hilo (un mensaje, «pensando…», una propuesta): el hilo baja al final. */
  alFinal: unknown;
  /** Lo que va fijo abajo: avisos, chips y la caja (`CajaDeNexus`). */
  pie: ReactNode;
  /** La caja de escribir: el cajón le pone el foco al abrirse y lo devuelve al cerrarse. */
  cajaRef: RefObject<HTMLTextAreaElement | null>;
  /** Si el cajón toma el foco al abrirse. `false` cuando se abrió SOLO (llegó una propuesta). */
  enfocarAlAbrir?: boolean;
  /** Cada vez que sube, el cursor va a la caja aunque el cajón ya estuviera abierto. */
  pedidoDeFoco?: number;
  /** Para quien necesita saber si un foco o una tecla vienen de adentro (el chat de un documento suelta el foco al aplicar). */
  cajonRef?: RefObject<HTMLElement | null>;
}

export default function CajonDeNexus({
  abierto,
  onClose,
  subtitulo,
  debajoDelSubtitulo,
  garantia,
  ariaLabel,
  nuevaConversacion,
  ancho = "normal",
  onAncho,
  arriba,
  children,
  alFinal,
  pie,
  cajaRef,
  enfocarAlAbrir = true,
  pedidoDeFoco = 0,
  cajonRef: cajonRefDeAfuera,
}: CajonDeNexusProps) {
  const hydrated = useHydrated();
  const cajonPropio = useRef<HTMLElement | null>(null);
  const cajonRef = cajonRefDeAfuera ?? cajonPropio;
  const finRef = useRef<HTMLDivElement | null>(null);

  /* El foco va a la caja; si la caja está apagada (hay algo arriba por decidir, como «Guardar»), al cajón mismo: así el
     siguiente Tab recorre lo que hay que decidir, en vez de quedarse en la página. */
  const enfocar = () => {
    const caja = cajaRef.current;
    if (caja && !caja.disabled) caja.focus();
    else cajonRef.current?.focus();
  };

  /* Escape cierra. No hay trampa de foco a propósito: el cajón no es modal y hay que poder tabular a la página. */
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      /* ⛔ NO si hay un modal encima. `Modal` escucha en `document` y esto en `window`; el evento burbujea a los dos y
         ninguno corta, así que UN Escape cerraba el modal Y el chat de una: la persona quería descartar una propuesta y
         encima perdía el hilo. Es el mismo criterio del z-index —el cajón vive DEBAJO de los modales— llevado al teclado. */
      if (document.querySelector('[aria-modal="true"]')) return;
      /* E3 P5: ni si viene de un campo editable FUERA del cajón (el nombre de una fase, una fecha): ese Escape es de ese
         campo. Con el chat abierto solo, alguien que estaba escribiendo en el Gantt perdía el chat que se le acababa de abrir. */
      const origen = e.target instanceof HTMLElement ? e.target : null;
      if (
        origen &&
        !cajonRef.current?.contains(origen) &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(origen.tagName) || origen.isContentEditable)
      ) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, onClose, cajonRef]);

  /* Un solo chat a la vez: todos ocupan el mismo lado y se tapaban. El que se abre avisa; el otro, si estaba abierto, se
     cierra (lo escrito y el hilo quedan guardados por quien lo monta). */
  const idDelCajon = useId();
  useEffect(() => {
    if (abierto) window.dispatchEvent(new CustomEvent(EVENTO_CHAT_ABIERTO, { detail: idDelCajon }));
  }, [abierto, idDelCajon]);
  useEffect(() => {
    if (!abierto) return;
    const onOtro = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== idDelCajon) onClose();
    };
    window.addEventListener(EVENTO_CHAT_ABIERTO, onOtro);
    return () => window.removeEventListener(EVENTO_CHAT_ABIERTO, onOtro);
  }, [abierto, onClose, idDelCajon]);

  /**
   * ⭐ EL FOCO ENTRA AL CAJÓN Y VUELVE DE DONDE VINO.
   *
   * El cajón se portaliza al FINAL de `body`, y su botón vive arriba de la página. Sin esto, quien abre el chat con
   * teclado tiene que tabular por TODA la página para llegar a la caja; y al cerrar, el portal se desmonta y el foco cae
   * a `body`. ⚠ NO es una trampa de foco: solo se pone al abrir y se devuelve al cerrar.
   * Cuando se abre SOLO (llegó una propuesta), el foco no se toca: robárselo le haría tipear en el chat.
   */
  useEffect(() => {
    if (!abierto || !enfocarAlAbrir) return;
    const previo = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => enfocar(), 0);
    return () => {
      window.clearTimeout(t);
      // Sin mover la página: al pasar de la conversación a La escala, el foco volvía al botón de arriba y la página saltaba.
      previo?.focus?.({ preventScroll: true });
    };
    // Solo al abrir: si deja de ser una apertura automática con el cajón abierto, no se le roba el foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  /* Con el cajón YA abierto, un botón de otra parte de la página (el «Mejorar con IA» de otra fase) no cambia `abierto`
     y el efecto de arriba no vuelve a correr: el cursor se quedaba afuera. Este escucha SOLO el pedido de foco. */
  useEffect(() => {
    if (!abierto || !pedidoDeFoco) return;
    const t = window.setTimeout(() => enfocar(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDeFoco]);

  /* El hilo baja solo a lo último que llegó. */
  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [abierto, alFinal]);

  if (!hydrated || !abierto) return null;

  return createPortal(
    <aside
      ref={cajonRef}
      id={ID_DEL_CAJON}
      tabIndex={-1}
      className={cn(
        "fixed right-0 top-0 z-[45] flex h-full max-w-[92vw] flex-col border-l border-line bg-surface shadow-2xl focus:outline-none",
        ancho === "amplio" ? "w-[560px]" : "w-[400px]",
      )}
      aria-label={ariaLabel}
    >
      <header className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">{TITULO_DEL_CHAT}</h2>
          <div className="flex shrink-0 items-center gap-1">
            {onAncho ? (
              <button
                type="button"
                onClick={onAncho}
                className="hidden rounded-lg px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg sm:inline-flex"
                title={ancho === "amplio" ? "Volver al ancho de siempre" : "Más ancho, para leer un plan largo"}
              >
                {ancho === "amplio" ? "Más angosto" : "Más ancho"}
              </button>
            ) : null}
            <Button
              variant="secondary"
              size="xs"
              onClick={nuevaConversacion.alHacer}
              disabled={nuevaConversacion.apagada}
              title={nuevaConversacion.titulo ?? "Empezar una conversación nueva"}
              className="gap-1"
            >
              <span aria-hidden="true">+</span>
              Nueva conversación
            </Button>
            <IconButton
              aria-label="Cerrar el chat"
              onClick={onClose}
              icon={
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              }
            />
          </div>
        </div>
        <p className="mt-0.5 truncate text-xs text-fg-muted">{subtitulo}</p>
        {garantia ? <p className="mt-0.5 text-[11px] text-fg-secondary">{garantia}</p> : null}
        {debajoDelSubtitulo}
      </header>

      {arriba ? <div className="shrink-0 border-b border-line px-4 py-2">{arriba}</div> : null}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {children}
        <div ref={finRef} />
      </div>

      <div className="shrink-0 border-t border-line px-3 py-3">{pie}</div>
    </aside>,
    document.body,
  );
}

/* ── Las piezas del hilo y del pie, iguales en todos los chats ─────────────────────────────────────────────────────── */

/**
 * El chat vacío: qué se le puede pedir, los ejemplos (solo acá) y qué pasa después. Con `alElegir`, un clic en un ejemplo lo
 * pone en la caja sin mandarlo (los ejemplos de la ventana vieja de «Mejorar con IA» se tocaban).
 */
export function ChatVacio({
  intro,
  ejemplos,
  cierre,
  alElegir,
}: {
  intro: ReactNode;
  ejemplos?: readonly string[];
  cierre?: ReactNode;
  alElegir?: (ejemplo: string) => void;
}) {
  return (
    <div className="space-y-2 text-sm text-fg-secondary">
      <p>{intro}</p>
      {ejemplos?.length ? (
        <ol className="list-decimal space-y-1 pl-4 text-xs text-fg-muted">
          {ejemplos.map((e) => (
            <li key={e}>
              {alElegir ? (
                <button type="button" onClick={() => alElegir(e)} className="text-left text-brand hover:underline" title="Ponerlo en la caja (no se manda solo)">
                  «{e}»
                </button>
              ) : (
                <>«{e}»</>
              )}
            </li>
          ))}
        </ol>
      ) : null}
      {cierre ? <div className="space-y-1 text-xs text-fg-muted">{cierre}</div> : null}
    </div>
  );
}

/** Un mensaje: el de la persona a la derecha, el de Nexus a la izquierda. */
export function Burbuja({ de, children, className }: { de: "persona" | "nexus"; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2 text-sm",
        de === "persona" ? "ml-8 whitespace-pre-wrap bg-surface-active text-fg" : "mr-2 bg-surface-muted text-fg-secondary",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** «Nexus está pensando…», a la vista. (El aviso para el lector de pantalla lo pone cada chat en su región viva.) */
export function Pensando({ texto = "Nexus está pensando…" }: { texto?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-fg-muted">
      <span aria-hidden="true" className="skeleton-shimmer h-1.5 w-6 rounded-full" />
      {texto}
    </p>
  );
}

/**
 * Una propuesta de Nexus dentro del hilo, con la cara de la caja del acuerdo de los documentos: el título con la cuenta,
 * lo que dice Nexus, el detalle (cada cambio con su antes y su después, que pone quien monta) y, abajo, «Aplicar» a todo
 * el ancho y «Descartar». Es el marco de una propuesta EN EL CHAT: el hilo mide 400 px y el `<AgentProposal>` de las
 * páginas pone sus botones a la derecha del título (ver su cabecera, «cuándo no usarlo»).
 */
export function PropuestaEnElHilo({
  titulo,
  subtitulo,
  nota,
  children,
  aplicar,
  descartar,
  apagada = false,
}: {
  titulo: string;
  subtitulo?: string | null;
  /** Lo que Nexus le dice a la persona sobre lo que propone. */
  nota?: ReactNode;
  children?: ReactNode;
  aplicar?: { rotulo: string; alHacer: () => void; apagado?: boolean; ocupado?: boolean } | null;
  descartar?: { rotulo: string; alHacer: () => void; apagado?: boolean } | null;
  /** Ya no es la vigente (se aplicó o se descartó): se apaga, no se borra. */
  apagada?: boolean;
}) {
  return (
    <div className={cn("mr-2 rounded-xl border border-info-line bg-info-surface px-3 py-2", apagada && "opacity-60")}>
      <p className="text-xs font-semibold text-info-ink">{titulo}</p>
      {subtitulo ? <p className="mt-0.5 text-xs text-fg-secondary">{subtitulo}</p> : null}
      {nota ? <div className="mt-1 text-sm text-fg">{nota}</div> : null}
      {children ? <div className="mt-2">{children}</div> : null}
      {aplicar ? (
        <Button
          variant="primary"
          size="sm"
          className="mt-2 w-full font-semibold"
          onClick={aplicar.alHacer}
          disabled={aplicar.apagado}
          loading={aplicar.ocupado}
        >
          {aplicar.ocupado ? "Aplicando…" : aplicar.rotulo}
        </Button>
      ) : null}
      {descartar ? (
        <button
          type="button"
          onClick={descartar.alHacer}
          disabled={descartar.apagado}
          className="mt-1 w-full rounded-lg py-1 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          {descartar.rotulo}
        </button>
      ) : null}
    </div>
  );
}

/** Lo que se mejora («Sobre «Portada»»), encima de la caja, con su ✕ para dejar de hablar solo de eso. */
export function ChipDeNexus({ children, onQuitar, quitarLabel }: { children: ReactNode; onQuitar?: () => void; quitarLabel?: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-xs">
      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-info-line bg-info-surface px-2 py-1 text-info-ink">
        <span className="truncate">{children}</span>
        {onQuitar ? (
          <button
            type="button"
            onClick={onQuitar}
            aria-label={quitarLabel ?? "Dejar de hablar solo de esto"}
            title={quitarLabel ?? "Dejar de hablar solo de esto"}
            className="text-info-ink/70 hover:text-info-ink"
          >
            ✕
          </button>
        ) : null}
      </span>
    </div>
  );
}

export interface CajaDeNexusProps {
  texto: string;
  setTexto: (t: string) => void;
  /** Enter o el botón. Quien monta decide si de verdad se manda (no se manda vacío ni mientras Nexus piensa). */
  onEnviar: () => void;
  /** El botón se apaga (la caja no: se puede ir escribiendo lo próximo mientras Nexus piensa). */
  enviarApagado: boolean;
  placeholder: string;
  ariaLabel?: string;
  /** La caja entera apagada, con el porqué (lo dice el placeholder y el botón). */
  apagada?: string | null;
  cajaRef: RefObject<HTMLTextAreaElement | null>;
  maxLength?: number;
  /** Dictar en vez de escribir: el micrófono en la esquina de la caja; cada frase se suma a lo escrito. */
  conDictado?: boolean;
  /** Si el dictado no pudo (permiso del micrófono, sin red): el mensaje para la persona. */
  onErrorDeDictado?: (e: string) => void;
}

/**
 * ⭐ LA CAJA CRECE CON LO QUE SE ESCRIBE O SE PEGA (Elías, 2026-08-21): con dos renglones fijos, pegar un párrafo dejaba
 * casi todo tapado. Hasta `ALTO_MAXIMO_COMPOSER`; después scrollea adentro. Enter envía y Shift+Enter baja de renglón.
 */
export function CajaDeNexus({
  texto,
  setTexto,
  onEnviar,
  enviarApagado,
  placeholder,
  ariaLabel = "Tu mensaje para Nexus",
  apagada = null,
  cajaRef,
  maxLength,
  conDictado = false,
  onErrorDeDictado,
}: CajaDeNexusProps) {
  useEffect(() => {
    const el = cajaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, ALTO_MAXIMO_COMPOSER)}px`;
  }, [texto, cajaRef]);

  /* El texto del último render, para sumar lo dictado sin rearmar el dictado en cada tecla. */
  const ultimo = useRef(texto);
  useEffect(() => {
    ultimo.current = texto;
  }, [texto]);
  const demasiadoLargo = !!maxLength && texto.length > maxLength;
  const enviarSiCabe = () => {
    if (!demasiadoLargo) onEnviar();
  };
  const alDictar = (frase: string) => {
    const nuevo = textoConLoDictado(ultimo.current, frase, maxLength);
    ultimo.current = nuevo;
    setTexto(nuevo);
  };

  return (
    <>
      <div className="relative">
        <textarea
          ref={cajaRef}
          value={texto}
          /* Sin cortar: el `maxLength` del campo ya no deja escribir de más, y lo que vuelve de un envío fallido puede pasarse
             (lo mandado más lo escrito mientras tanto). Cortarlo acá perdía el final; se avisa abajo y no se envía. */
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            /* Enter envía, Shift+Enter hace salto de línea — la convención de un chat. Mientras se compone un acento, no
               envía; en el celular (puntero táctil) Enter baja de renglón: ahí no hay Shift y se envía con el botón. */
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || esTactil()) return;
            e.preventDefault();
            enviarSiCabe();
          }}
          rows={2}
          maxLength={maxLength}
          disabled={!!apagada}
          aria-label={ariaLabel}
          placeholder={apagada ?? placeholder}
          className={cn(
            "w-full resize-none overflow-y-auto rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted disabled:opacity-60",
            conDictado && "pr-10",
          )}
          style={{ maxHeight: ALTO_MAXIMO_COMPOSER }}
        />
        {conDictado ? (
          <BotonDeDictado
            variante="icono"
            className="absolute bottom-2 right-2"
            onTexto={alDictar}
            onError={(m) => onErrorDeDictado?.(m)}
            disabled={!!apagada}
          />
        ) : null}
      </div>
      {demasiadoLargo ? (
        <p className="mt-1 text-[11px] text-warn-ink">Pasa del largo máximo ({maxLength} caracteres): acórtalo para enviarlo.</p>
      ) : null}
      <Button variant="primary" size="sm" className="mt-2 w-full font-semibold" onClick={enviarSiCabe} disabled={enviarApagado || !!apagada || demasiadoLargo}>
        Enviar
      </Button>
    </>
  );
}
