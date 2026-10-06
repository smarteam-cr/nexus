/**
 * lib/para-ti/medir-server.ts — mide «Para ti» para una persona. SERVER-ONLY.
 *
 * Corre las fuentes que le tocan (las personales que aplican y las de los frentes que lleva y puede abrir) EN PARALELO,
 * cada una con un tope de tiempo: una fuente que falla o tarda no frena a las demás ni rompe la página — se nombra en
 * «no se pudo revisar».
 *
 * El número del menú se pide cada minuto y medio desde cada pestaña abierta. Por eso la medición se guarda en memoria
 * dos minutos por persona (`medirConCache`): la página mide fresco y deja la medición guardada para el menú. Es correcto
 * porque Nexus corre en UN solo proceso (RUNBOOK, invariante #1); con más réplicas, cada una tendría su copia y el
 * número podría diferir unos minutos entre pestañas, nada más.
 */
import "server-only";
import { crDateParts } from "@/lib/jobs/time";
import { accesoParaFrentes, type Alcance } from "./alcance-server";
import { armarParaTi } from "./armar";
import { frente, puedeLlevar } from "./frentes";
import type { Fuente } from "./fuente";
import { FUENTES } from "./registro";
import type { ParaTi, ResultadoDeFuente } from "./tipos";

/** Cuánto se espera a una fuente antes de darla por «no se pudo revisar». */
export const TOPE_POR_FUENTE_MS = 8_000;
/** Cuánto dura la medición guardada para el número del menú. */
export const VIDA_DE_LA_MEDICION_MS = 2 * 60_000;

/**
 * Las fuentes que se miden para esta persona: las personales que aplican, y las de los frentes que lleva Y PUEDE ABRIR.
 * ⛔ Un frente cuyo requisito no cumple (`puedeLlevar`) se calla entero: ni pendientes, ni montos, ni textos, hasta que
 * tenga el permiso (Elías, 2026-10-05). Ni siquiera sale en «al día»: no se mide.
 */
export function fuentesQueAplican(a: Alcance, fuentes: readonly Fuente[] = FUENTES): Fuente[] {
  const acceso = accesoParaFrentes(a);
  return fuentes.filter((f) =>
    f.frente ? a.frentes.includes(f.frente) && puedeLlevar(frente(f.frente), acceso) : (f.aplica?.(a) ?? true),
  );
}

function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`tardó más de ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function medirParaTi(a: Alcance, ahora = new Date()): Promise<ParaTi> {
  const ctx = { ahora, hoyISO: crDateParts(ahora).dateKey };
  const resultados = await Promise.all(
    fuentesQueAplican(a).map(async (f): Promise<ResultadoDeFuente> => {
      try {
        const items = await conTope(f.medir(a, ctx), TOPE_POR_FUENTE_MS);
        return { fuente: f.clave, alDia: f.alDia, ok: true, items };
      } catch (e) {
        console.error(`[para-ti] la fuente ${f.clave} no se pudo medir para ${a.email}: ${e instanceof Error ? e.message : String(e)}`);
        return { fuente: f.clave, alDia: f.alDia, ok: false, items: [] };
      }
    }),
  );
  const medicion = armarParaTi(resultados);
  guardadas.set(a.email, { at: ahora.getTime(), medicion });
  return medicion;
}

const guardadas = new Map<string, { at: number; medicion: ParaTi }>();
const enVuelo = new Map<string, Promise<ParaTi>>();

/** La medición de hace menos de dos minutos, o una nueva. Dos pedidos a la vez de la misma persona comparten una. */
export async function medirConCache(a: Alcance, ahora = new Date()): Promise<ParaTi> {
  const g = guardadas.get(a.email);
  if (g && ahora.getTime() - g.at < VIDA_DE_LA_MEDICION_MS) return g.medicion;
  const corriendo = enVuelo.get(a.email);
  if (corriendo) return corriendo;
  const p = medirParaTi(a, ahora).finally(() => {
    if (enVuelo.get(a.email) === p) enVuelo.delete(a.email);
  });
  enVuelo.set(a.email, p);
  return p;
}

/** Olvida la medición guardada (cuando la persona hizo algo que la cambia y vuelve a la página). */
export function olvidarMedicion(email: string): void {
  guardadas.delete(email.toLowerCase());
}
