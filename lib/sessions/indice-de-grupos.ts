/**
 * lib/sessions/indice-de-grupos.ts — el ÍNDICE de la barra lateral de /sessions, contado en el servidor.
 *
 * C-19 (2026-09-04): /sessions mandaba las ~16k filas al navegador y la barra lateral las volvía
 * a contar ahí. Y como el grupo elegido viaja en la URL (`?g=`) y cada clic hace `router.replace`,
 * el servidor re-renderizaba y re-mandaba las 16k filas en CADA selección, no solo al entrar.
 * Ahora manda esto —un renglón de conteos por grupo— más las filas del grupo elegido, y nada más.
 *
 * La semántica no cambia: todas las empresas, las futuras marcadas, y la búsqueda de la barra
 * sigue filtrando por nombre/empresa/dominio (nunca miró títulos de sesiones, así que el índice
 * le alcanza).
 *
 * Puro y SERIALIZABLE (Records, no Maps): cruza la frontera servidor → cliente como prop.
 */
import type { SessionGroup } from "./categorize";

export interface ConteoDeGrupo {
  total: number;
  withTranscript: number;
}

export interface EntradaHuerfana extends ConteoDeGrupo {
  label: string;
  domain?: string;
}

export interface IndiceDeGrupos {
  byClient: Record<string, ConteoDeGrupo>;
  byHubspotCompany: Record<string, ConteoDeGrupo>;
  byCategory: Record<string, ConteoDeGrupo>;
  /** Clave = dominio, o el label cuando no hay dominio (es la clave que viaja en `?g=orphan:…`). */
  orphans: Record<string, EntradaHuerfana>;
  /** Cuántas sesiones representa el índice, aunque al navegador solo viaje un grupo. */
  total: number;
}

/** El grupo elegido en la barra lateral: `null` = la lista agrupada. */
export type GrupoElegido = { kind: SessionGroup["kind"]; id: string } | null;

const KINDS_VALIDOS = new Set<SessionGroup["kind"]>(["client", "hubspotCompany", "category", "orphan"]);

/** La clave estable de un grupo — la misma para agrupar, para comparar y para la URL. */
export function claveDeGrupo(g: SessionGroup): string {
  if (g.kind === "orphan") return `orphan:${g.domain ?? g.label}`;
  return `${g.kind}:${g.id}`;
}

/** El grupo de una sesión, como selección de la barra (una huérfana se identifica por su dominio o label). */
export function grupoDeSesion(g: SessionGroup): NonNullable<GrupoElegido> {
  if (g.kind === "orphan") return { kind: "orphan", id: g.domain ?? g.label };
  return { kind: g.kind, id: g.id };
}

/** Grupo → query param `?g=kind:id`. */
export function grupoAParam(g: GrupoElegido): string | null {
  if (!g) return null;
  return `${g.kind}:${encodeURIComponent(g.id)}`;
}

/** Query param `?g=kind:id` → grupo. Tolerante a valores inválidos: devuelve null, nunca lanza. */
export function paramAGrupo(param: string | null | undefined): GrupoElegido {
  if (!param) return null;
  const idx = param.indexOf(":");
  if (idx === -1) return null;
  const kind = param.slice(0, idx) as SessionGroup["kind"];
  if (!KINDS_VALIDOS.has(kind)) return null;
  let id: string;
  try {
    id = decodeURIComponent(param.slice(idx + 1));
  } catch {
    return null;
  }
  if (!id) return null;
  return { kind, id };
}

export function construirIndice(
  sesiones: ReadonlyArray<{ group: SessionGroup; hasTranscript: boolean }>,
): IndiceDeGrupos {
  const byClient: Record<string, ConteoDeGrupo> = {};
  const byHubspotCompany: Record<string, ConteoDeGrupo> = {};
  const byCategory: Record<string, ConteoDeGrupo> = {};
  const orphans: Record<string, EntradaHuerfana> = {};
  const sumar = (m: Record<string, ConteoDeGrupo>, k: string, hasTr: boolean) => {
    const e = (m[k] ??= { total: 0, withTranscript: 0 });
    e.total += 1;
    if (hasTr) e.withTranscript += 1;
  };
  for (const s of sesiones) {
    const g = s.group;
    if (g.kind === "client") sumar(byClient, g.id, s.hasTranscript);
    else if (g.kind === "hubspotCompany") sumar(byHubspotCompany, g.id, s.hasTranscript);
    else if (g.kind === "category") sumar(byCategory, g.id, s.hasTranscript);
    else {
      const key = g.domain ?? g.label;
      const e = (orphans[key] ??= { label: g.label, total: 0, withTranscript: 0, domain: g.domain });
      e.total += 1;
      if (s.hasTranscript) e.withTranscript += 1;
    }
  }
  return { byClient, byHubspotCompany, byCategory, orphans, total: sesiones.length };
}

/** Las filas del grupo elegido, en el orden en que vinieron. Sin grupo no viaja ninguna. */
export function filasDelGrupo<T extends { group: SessionGroup }>(sesiones: readonly T[], grupo: GrupoElegido): T[] {
  if (!grupo) return [];
  const clave = `${grupo.kind}:${grupo.id}`;
  return sesiones.filter((s) => claveDeGrupo(s.group) === clave);
}
