/**
 * lib/exploraciones/seguimiento-de-corrida.ts — UN solo seguimiento de la corrida del agente por
 * exploración, que leen todas las piezas del lienzo.
 *
 * Varias piezas muestran la corrida a la vez (las sesiones, el panel del agente, «Sumar a mano»…).
 * Cuando cada una la seguía por su cuenta, con cuatro montadas había cuatro consultas cada 3 s,
 * cuatro recargas y cuatro avisos iguales al terminar, y un botón no se enteraba de la corrida que
 * lanzó otro (auditoría del 2026-10-05). Ahora hay un seguimiento por exploración: una consulta por
 * vuelta, una recarga y un aviso por corrida. Las piezas lo leen con `useCorrida`
 * (components/exploraciones/useCorrida.ts).
 *
 * Sin React a propósito: se prueba solo, con la red y el reloj simulados.
 */
import type { ModoDeLaCorrida } from "./contenido";

export interface CorridaEnCurso {
  id: string;
  /** Qué se le pidió (preparar, leer, casos): cada paso muestra el error de la suya. */
  modo: ModoDeLaCorrida | null;
  estado: "RUNNING" | "DONE" | "ERROR";
  etiqueta: string | null;
  fase: string | null;
  empezo: string;
  propuestos: number | null;
  nadaNuevo: boolean;
  error: string | null;
}

/** Lo que ven las piezas. Cambia de objeto con cada cambio (lo pide `useSyncExternalStore`). */
export interface FotoDeLaCorrida {
  corrida: CorridaEnCurso | null;
  /** Alguna pieza está lanzando al agente: los demás botones también esperan. */
  lanzando: boolean;
}

export const FOTO_INICIAL: FotoDeLaCorrida = Object.freeze({ corrida: null, lanzando: false });

/** Lo que da el lienzo montado: cómo recargar y cómo avisar. Lo pone la última pieza que se montó. */
export interface ConexionDelLienzo {
  recargar: () => Promise<void>;
  avisos: { success: (m: string) => unknown; error: (m: string) => unknown };
}

export interface SeguimientoDeCorrida {
  foto: () => FotoDeLaCorrida;
  suscribir: (oyente: () => void) => () => void;
  conectar: (c: ConexionDelLienzo) => void;
  /**
   * Una pieza que muestra la corrida se montó, con la versión del lienzo que tenía (`vista`). Mientras
   * haya alguna montada, el seguimiento sigue. Devuelve cómo desmontarla.
   */
  montar: (vista: string) => () => void;
  /** Sigue la corrida viva hasta que termina. Si ya hay un seguimiento, no arranca otro. */
  seguir: () => Promise<void>;
  ponerLanzando: (v: boolean) => void;
}

/** Cuántas vueltas como mucho (160 × 3 s = 8 minutos) y cada cuánto se consulta. */
const VUELTAS = 160;
const CADA_MS = 3000;

/** El aviso al terminar bien, según lo que hizo la corrida. */
export function avisoAlTerminar(c: CorridaEnCurso): string {
  if (c.modo === "guia") return "La guía de la próxima reunión está lista.";
  if (c.nadaNuevo) return "No había reuniones nuevas para leer.";
  return c.propuestos
    ? `El agente propuso ${c.propuestos} ${c.propuestos === 1 ? "cosa" : "cosas"}: están en su lugar.`
    : "El agente no encontró nada nuevo que proponer.";
}

export function crearSeguimiento(deps: {
  consultar: () => Promise<CorridaEnCurso | null>;
  esperar?: (ms: number) => Promise<void>;
}): SeguimientoDeCorrida {
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let foto = FOTO_INICIAL;
  const oyentes = new Set<() => void>();
  let conexion: ConexionDelLienzo | null = null;
  let montadas = 0;
  let siguiendo = false;
  /** Alguien pidió seguir mientras ya se seguía (lanzó otra corrida al final de la anterior): otra vuelta al terminar. */
  let otraVuelta = false;
  /** La consulta del montaje en vuelo: varias piezas que se montan juntas comparten una. */
  let alMontar: Promise<CorridaEnCurso | null> | null = null;
  /** La última corrida cuyo final ya se atendió (recarga y aviso): no se atiende dos veces. */
  let atendida: string | null = null;

  const vivo = () => montadas > 0;
  const cambiar = (parcial: Partial<FotoDeLaCorrida>) => {
    foto = { ...foto, ...parcial };
    for (const o of oyentes) o();
  };

  async function seguir(): Promise<void> {
    if (siguiendo) {
      otraVuelta = true;
      return;
    }
    siguiendo = true;
    try {
      for (let i = 0; i < VUELTAS && vivo(); i++) {
        const c = await deps.consultar();
        if (!vivo()) return;
        cambiar({ corrida: c });
        if (!c || c.estado !== "RUNNING") {
          if (c && c.id !== atendida) {
            atendida = c.id;
            if (c.estado === "DONE") {
              await conexion?.recargar();
              conexion?.avisos.success(avisoAlTerminar(c));
            } else if (c.estado === "ERROR") {
              conexion?.avisos.error(c.error ?? "El agente no pudo terminar.");
            }
          }
          return;
        }
        await esperar(CADA_MS);
      }
    } finally {
      siguiendo = false;
      if (otraVuelta) {
        otraVuelta = false;
        if (vivo()) void seguir();
      }
    }
  }

  /* Lo que tenía el lienzo al montar: si una corrida arrancó después y ya terminó, el lienzo no la vio
     (la seguía otra pieza, que se desmontó al cambiar de pieza) y su versión quedó atrás. Sin recargar,
     el próximo cambio choca como si lo hubiera hecho otra persona (409). */
  async function revisar(vista: string): Promise<void> {
    if (siguiendo) return;
    alMontar ??= deps.consultar().finally(() => {
      alMontar = null;
    });
    const c = await alMontar;
    // Mientras se consultaba, alguien lanzó y ya hay seguimiento: manda el suyo, que es más nuevo.
    if (!vivo() || siguiendo) return;
    cambiar({ corrida: c });
    if (c?.estado === "RUNNING") {
      void seguir();
    } else if (c && c.id !== atendida) {
      atendida = c.id;
      if (c.estado === "DONE" && c.empezo > vista) await conexion?.recargar();
    }
  }

  return {
    foto: () => foto,
    suscribir: (oyente) => {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
      };
    },
    conectar: (c) => {
      conexion = c;
    },
    montar: (vista) => {
      montadas += 1;
      void revisar(vista);
      return () => {
        montadas -= 1;
        // Sin piezas montadas, la próxima vez se arranca de cero (como al abrir el lienzo).
        if (montadas === 0) foto = FOTO_INICIAL;
      };
    },
    seguir,
    ponerLanzando: (v) => cambiar({ lanzando: v }),
  };
}

const seguimientos = new Map<string, SeguimientoDeCorrida>();

/** El seguimiento de una exploración: el mismo para todas sus piezas. */
export function seguimientoDe(exploracionId: string): SeguimientoDeCorrida {
  let s = seguimientos.get(exploracionId);
  if (!s) {
    s = crearSeguimiento({
      consultar: async () => {
        try {
          const res = await fetch(`/api/sales/exploraciones/${exploracionId}/agente`);
          const data = (await res.json()) as { corrida?: CorridaEnCurso | null };
          return data.corrida ?? null;
        } catch {
          return null;
        }
      },
    });
    seguimientos.set(exploracionId, s);
  }
  return s;
}
