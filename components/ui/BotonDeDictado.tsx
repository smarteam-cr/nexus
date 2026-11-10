"use client";

/**
 * components/ui/BotonDeDictado.tsx — dictar en vez de escribir (2026-11-09, «La lectura del consultor» del paso Casos de
 * uso: «se puede dictar»).
 *
 * Usa el reconocimiento de voz del navegador (Web Speech API: Chrome y Edge), así que a Nexus no le cuesta nada y el audio
 * no pasa por Nexus. ⚠ Pero sí sale del equipo: en Chrome lo procesa el servicio de voz de Google y en Edge el de
 * Microsoft (revisión del 2026-11-09). El botón lo dice en su ayuda. Mientras escucha, cada frase terminada llega por
 * `onTexto`; quien lo usa decide dónde la pone. Un clic arranca y
 * otro para; también para solo cuando la persona se queda callada un rato. En un navegador sin reconocimiento de voz
 * (Firefox, Safari viejo) el botón no se muestra: el teclado sigue estando.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

/** Lo mínimo de la API de reconocimiento de voz que usamos (no viene en los tipos de TypeScript). */
interface Reconocimiento {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type ConstructorDeReconocimiento = new () => Reconocimiento;

function constructorDelNavegador(): ConstructorDeReconocimiento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: ConstructorDeReconocimiento; webkitSpeechRecognition?: ConstructorDeReconocimiento };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface BotonDeDictadoProps {
  /** Cada frase que terminó de dictar, ya sin espacios de más. */
  onTexto: (texto: string) => void;
  /** Si no se pudo (permiso del micrófono negado, sin red): el mensaje para la persona. */
  onError?: (mensaje: string) => void;
  disabled?: boolean;
  /** El idioma del reconocimiento. */
  idioma?: string;
  className?: string;
}

const MENSAJE_DEL_ERROR: Record<string, string> = {
  "not-allowed": "El navegador no dio permiso para usar el micrófono.",
  "service-not-allowed": "El navegador no dio permiso para usar el micrófono.",
  "audio-capture": "No se encontró un micrófono.",
  network: "El dictado necesita conexión a internet.",
};

const sinSuscripcion = () => () => {};

export function BotonDeDictado({ onTexto, onError, disabled, idioma = "es-CR", className }: BotonDeDictadoProps) {
  // Solo en el navegador: en el servidor no existe (false), y así el primer render coincide.
  const disponible = useSyncExternalStore(sinSuscripcion, () => constructorDelNavegador() !== null, () => false);
  const [escuchando, setEscuchando] = useState(false);
  const reconocimiento = useRef<Reconocimiento | null>(null);
  // Los callbacks del último render, sin rearmar el reconocimiento cada vez.
  const alTexto = useRef(onTexto);
  const alError = useRef(onError);
  useEffect(() => {
    alTexto.current = onTexto;
    alError.current = onError;
  });

  // Al salir de la pantalla, deja de escuchar.
  useEffect(() => () => reconocimiento.current?.stop(), []);

  if (!disponible) return null;

  const alternar = () => {
    if (escuchando) {
      reconocimiento.current?.stop();
      return;
    }
    const Constructor = constructorDelNavegador();
    if (!Constructor) return;
    const r = new Constructor();
    r.lang = idioma;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      // Las frases que terminaron en este evento, juntas: una sola llegada por evento.
      const frases: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const resultado = e.results[i];
        const texto = resultado?.[0]?.transcript?.replace(/\s+/g, " ").trim();
        if (resultado?.isFinal && texto) frases.push(texto);
      }
      if (frases.length) alTexto.current(frases.join(". "));
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") alError.current?.(MENSAJE_DEL_ERROR[e.error] ?? "No se pudo dictar. Vuelve a intentarlo.");
    };
    r.onend = () => {
      setEscuchando(false);
      reconocimiento.current = null;
    };
    reconocimiento.current = r;
    try {
      r.start();
      setEscuchando(true);
    } catch {
      alError.current?.("No se pudo empezar a dictar. Vuelve a intentarlo.");
    }
  };

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={disabled}
      aria-pressed={escuchando}
      title="El dictado lo hace tu navegador: en Chrome, la voz pasa por el servicio de Google; en Edge, por el de Microsoft."
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:pointer-events-none disabled:opacity-50",
        escuchando ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg",
        className,
      )}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
      {escuchando ? "Escuchando… toca para parar" : "Dictar"}
    </button>
  );
}
