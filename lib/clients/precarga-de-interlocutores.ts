/**
 * lib/clients/precarga-de-interlocutores.ts — las piezas puras de la precarga desde un mapa (scripts/interlocutores-precargar.ts,
 * 2026-11-26): el cambio de las fichas en memoria, la deriva y la huella. Viven en lib/ para que las pruebas las cubran
 * (revisión del 26 nov: en scripts/ ninguna prueba avisaba si dejaban de hacer lo que dicen).
 */
import { huellaDeMovidas, type CambioDeInterlocutor } from "./interlocutores";
import { limpiarDominio, normalizarSigla } from "./siglas-y-dominios";

/** Lo que una persona aprobó cambiar en las fichas: [id de la ficha, valor], ya limpio (siglas-y-dominios.ts). */
export interface CambiosDeFichas {
  siglas: readonly (readonly [string, string])[];
  dominios: readonly (readonly [string, string])[];
}

type FichaAjustable = { id: string; siglas?: string[] | null; emailDomains: string[] };

/**
 * El cambio de las fichas, UNA función para el simulacro, la cuenta de INV37 y lo que escribe el --apply: la sigla se
 * suma a su ficha (si no la tiene, sin distinguir mayúsculas); el dominio pasa a su ficha y se quita de toda otra que lo
 * tenga (comparado como lo guarda la ficha). Devuelve las MISMAS filas con esos campos cambiados.
 */
export function ajustarConLosCambios(c: CambiosDeFichas) {
  return <T extends FichaAjustable>(clients: readonly T[]): T[] =>
    clients.map((ficha) => {
      let x = ficha;
      for (const [id, sigla] of c.siglas) {
        const actuales = x.siglas ?? [];
        if (id === ficha.id && !actuales.some((s) => normalizarSigla(s) === sigla)) x = { ...x, siglas: [...actuales, sigla] } as T;
      }
      for (const [id, dominio] of c.dominios) {
        const loTiene = x.emailDomains.some((d) => limpiarDominio(d) === dominio);
        if (id === ficha.id) {
          if (!loTiene) x = { ...x, emailDomains: [...x.emailDomains, dominio] } as T;
        } else if (loTiene) {
          x = { ...x, emailDomains: x.emailDomains.filter((d) => limpiarDominio(d) !== dominio) } as T;
        }
      }
      return x;
    });
}

const igual = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Las fichas que el cambio toca, como están HOY (para respaldarlas y devolverlas si escribir falla). */
export function fichasQueCambian<T extends { id: string; siglas: string[]; emailDomains: string[] }>(
  todas: readonly T[],
  ajustar: (clients: readonly T[]) => T[],
): T[] {
  const despues = new Map(ajustar(todas).map((c) => [c.id, c]));
  return todas.filter((c) => {
    const d = despues.get(c.id);
    return !!d && (!igual(c.siglas, d.siglas) || !igual(c.emailDomains, d.emailDomains));
  });
}

type Movida = { sessionId: string; de: string | null; a: string | null };

/**
 * Separa lo que mueve el cambio de la DERIVA (lo que ya hoy da distinto de lo guardado, y el cambio no toca). La deriva de
 * la gente del mapa se pone al día; la de otra gente no es de este cambio y no se mueve, salvo `conLaDeriva`, o que una
 * corrida anterior que se cortó ya la hubiera aprobado con esa misma ficha (`yaAprobadas`, del respaldo de esa corrida).
 */
export function separarLaDeriva<R extends Movida>(o: {
  hoy: readonly R[];
  con: readonly R[];
  deLaGente: ReadonlySet<string>;
  conLaDeriva?: boolean;
  yaAprobadas?: ReadonlyMap<string, string | null>;
}): { porElMapa: R[]; derivaPropia: R[]; derivaAjena: R[]; deLaCorridaAnterior: R[]; aprobadas: R[] } {
  const yaDistintas = new Map(o.hoy.map((c) => [c.sessionId, c.a]));
  const porElMapa = o.con.filter((c) => !yaDistintas.has(c.sessionId) || yaDistintas.get(c.sessionId) !== c.a);
  const deriva = o.con.filter((c) => yaDistintas.has(c.sessionId) && yaDistintas.get(c.sessionId) === c.a);
  const derivaPropia = deriva.filter((c) => o.deLaGente.has(c.sessionId));
  const ajena = deriva.filter((c) => !o.deLaGente.has(c.sessionId));
  const deLaCorridaAnterior = ajena.filter((c) => o.yaAprobadas?.has(c.sessionId) && o.yaAprobadas.get(c.sessionId) === c.a);
  const derivaAjena = ajena.filter((c) => !deLaCorridaAnterior.includes(c));
  const aprobadas = [...porElMapa, ...derivaPropia, ...deLaCorridaAnterior, ...(o.conLaDeriva ? derivaAjena : [])];
  return { porElMapa, derivaPropia, derivaAjena, deLaCorridaAnterior, aprobadas };
}

/**
 * La huella de TODO lo que escribe el --apply (revisión del 26 nov: la de las reuniones sola no veía un rol que pisa el
 * mapa ni un vínculo que una persona eligió entre el simulacro y la escritura): las reuniones que se mueven, de qué ficha
 * a cuál; lo que se escribe de cada persona; el cambio de las fichas; y los vínculos que se sueltan, con su candado.
 * `${reuniones}-${hash}`, como `huellaDeMovidas`.
 */
export function huellaDeLaPrecarga(x: {
  aprobadas: readonly Movida[];
  personas: readonly CambioDeInterlocutor[];
  cambios: CambiosDeFichas;
  /** Cada vínculo que se suelta: `sesión>proyecto:candado`. */
  sueltan: readonly string[];
}): string {
  const orden = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  /* Cada campo en un orden fijo; «sin cambio» (undefined) se distingue de «borrar» (null). */
  const campo = (v: unknown) => (v === undefined ? "~" : JSON.stringify(v));
  const lista = (v: readonly string[] | undefined) => (v === undefined ? "~" : JSON.stringify([...v].sort(orden)));
  const personas = x.personas
    .map((p) => [p.correo.trim().toLowerCase(), campo(p.nombre), campo(p.cargo), campo(p.rol), lista(p.confirmadaEn), lista(p.sugeridaEn)].join(";"))
    .sort(orden);
  const texto = [
    huellaDeMovidas(x.aprobadas),
    personas.join("|"),
    x.cambios.siglas.map(([k, v]) => `${k}=${v}`).sort(orden).join(","),
    x.cambios.dominios.map(([k, v]) => `${k}=${v}`).sort(orden).join(","),
    [...x.sueltan].sort(orden).join(","),
  ].join("#");
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${x.aprobadas.length}-${h.toString(16)}`;
}
