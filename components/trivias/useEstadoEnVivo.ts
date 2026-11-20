"use client";

/**
 * components/trivias/useEstadoEnVivo.ts — el estado de una partida, consultado seguido (polling corto).
 *
 * Por qué polling y no Supabase Realtime: las tablas tienen RLS sin policies de lectura (ARCHITECTURE §4.5) y en el
 * 3005 la base es local, así que Realtime no vería nada; para ~20 personas, una consulta cada 1–1,5 s alcanza y la
 * fuente de verdad sigue siendo la base (DECISIONS «Trivias»).
 *
 * - El ritmo lo decide quien lo usa según el estado (`cadaMs`): más rápido con una pregunta en curso.
 * - Con la pestaña escondida no consulta; al volver, consulta en el acto.
 * - `ahoraDelServidor()` corrige el reloj del teléfono con el del servidor (el que valida las respuestas), así la
 *   cuenta regresiva de todas las pantallas llega a cero a la vez.
 * - Si la sesión venció, el portero contesta con la página de login (redirección a «/»): se va al login y vuelve acá.
 *   Cualquier otra respuesta rara (un 500, un corte durante un deploy) NO es una sesión vencida: se avisa y se sigue
 *   intentando, sin recargar la pantalla proyectada ni sacar a nadie de la partida.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "@/lib/api/fetch-json";

export interface ErrorEnVivo {
  status: number;
  mensaje: string;
}

/**
 * `activo: false` no consulta todavía: el jugador lo prende recién cuando «entrar» respondió, así una consulta que
 * salió antes de entrar (y vuelve sin participación) no pisa el estado que trajo la entrada.
 */
export function useEstadoEnVivo<T extends { ahora: number }>(
  url: string,
  cadaMs: (estado: T | null) => number,
  { activo = true }: { activo?: boolean } = {},
) {
  const [estado, setEstado] = useState<T | null>(null);
  const [error, setError] = useState<ErrorEnVivo | null>(null);
  const desfase = useRef(0);
  const pidiendo = useRef(false);
  const ultimo = useRef<T | null>(null);
  const ritmo = useRef(cadaMs);
  useEffect(() => {
    ritmo.current = cadaMs;
  }, [cadaMs]);

  /** Aplica un estado que trajo otra llamada (p. ej. la respuesta de «entrar»). */
  const aplicar = useCallback((nuevo: T, enviadoEn: number, recibidoEn: number) => {
    desfase.current = nuevo.ahora - (enviadoEn + recibidoEn) / 2;
    ultimo.current = nuevo;
    setEstado(nuevo);
    setError(null);
  }, []);

  const otraVuelta = useRef(false);

  /** Un pedido; false si la sesión venció y ya se fue al login. */
  const pedirUnaVez = useCallback(async (): Promise<boolean> => {
    const enviadoEn = Date.now();
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.redirected && new URL(r.url).pathname === "/") {
        window.location.href = `/?next=${encodeURIComponent(window.location.pathname)}`;
        return false;
      }
      if (!(r.headers.get("content-type") ?? "").includes("application/json")) {
        setError({ status: r.status, mensaje: "No pudimos leer la partida." });
        return true;
      }
      const cuerpo: unknown = await r.json();
      if (!r.ok) {
        setError({ status: r.status, mensaje: extractErrorMessage(cuerpo, "No pudimos leer la partida.") });
        return true;
      }
      aplicar(cuerpo as T, enviadoEn, Date.now());
    } catch {
      // Sin red por un momento: la próxima vuelta lo intenta de nuevo, sin borrar lo que se ve.
    }
    return true;
  }, [url, aplicar]);

  const mirar = useCallback(async (): Promise<void> => {
    // Con un pedido en vuelo (que pudo salir ANTES de un clic), se pide otra vez al terminar: lo último manda.
    if (pidiendo.current) {
      otraVuelta.current = true;
      return;
    }
    pidiendo.current = true;
    try {
      do {
        otraVuelta.current = false;
        if (!(await pedirUnaVez())) return;
      } while (otraVuelta.current);
    } finally {
      pidiendo.current = false;
    }
  }, [pedirUnaVez]);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let timer: number | undefined;
    const vuelta = async () => {
      if (!vivo) return;
      if (document.visibilityState === "visible") await mirar();
      if (vivo) timer = window.setTimeout(vuelta, ritmo.current(ultimo.current));
    };
    void vuelta();
    const alVolver = () => {
      if (document.visibilityState === "visible") void mirar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [mirar, activo]);

  const ahoraDelServidor = useCallback(() => Date.now() + desfase.current, []);

  return { estado, error, refrescar: mirar, aplicar, ahoraDelServidor };
}

/** Un reloj que avanza solo mientras `activo` (para la cuenta regresiva), con el reloj del servidor. */
export function useAhora(ahoraDelServidor: () => number, activo: boolean, cadaMs = 200): number {
  const [ahora, setAhora] = useState(() => ahoraDelServidor());
  useEffect(() => {
    if (!activo) return;
    const t = window.setInterval(() => setAhora(ahoraDelServidor()), cadaMs);
    return () => window.clearInterval(t);
  }, [ahoraDelServidor, activo, cadaMs]);
  return ahora;
}
