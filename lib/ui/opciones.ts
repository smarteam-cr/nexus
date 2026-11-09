/**
 * lib/ui/opciones.ts — qué opciones muestra un selector con buscador, y en qué grupos.
 *
 * La lógica pura de `PanelDeOpciones` (components/ui), el panel que comparten `Selector` y `CeldaSelect`. Vive acá y
 * no en el componente para poder probarla: la suite unit solo corre `lib/**`.
 */
import { coincideBusqueda } from "./text-search";

export interface OpcionDeLista {
  /** Lo que se manda al elegir. Único dentro de la lista. */
  value: string;
  label: string;
  /** Segunda línea opcional, corta (ej. el correo, para desempatar dos nombres iguales). */
  hint?: string;
  /** El grupo al que pertenece (ej. la etapa de una actividad). Los grupos salen en el orden en que aparecen. */
  grupo?: string;
  /** Una marca corta a la derecha: «ya está», «una vez más». */
  marca?: string;
  /** Se ve, pero no se puede elegir (ej. una actividad que ya está y no se repite). */
  deshabilitada?: boolean;
}

export interface GrupoDeOpciones {
  /** `null` = las opciones sin grupo, que van primero y sin título. */
  grupo: string | null;
  opciones: OpcionDeLista[];
}

/**
 * Las opciones que coinciden con lo escrito. Busca sin tildes (`coincideBusqueda`): «Elias» encuentra a «Elías». Mira
 * el nombre, la segunda línea y el grupo, así que escribir «Diagnóstico» trae todo ese grupo.
 */
export function filtrarOpciones(opciones: readonly OpcionDeLista[], consulta: string): OpcionDeLista[] {
  const q = consulta.trim();
  if (!q) return [...opciones];
  return opciones.filter(
    (o) => coincideBusqueda(o.label, q) || coincideBusqueda(o.hint ?? "", q) || coincideBusqueda(o.grupo ?? "", q),
  );
}

/** Junta las opciones por grupo, en el orden en que aparece cada grupo; las sin grupo, primero. */
export function agruparOpciones(opciones: readonly OpcionDeLista[]): GrupoDeOpciones[] {
  const sueltas: OpcionDeLista[] = [];
  const grupos = new Map<string, OpcionDeLista[]>();
  for (const o of opciones) {
    if (!o.grupo) {
      sueltas.push(o);
      continue;
    }
    const lista = grupos.get(o.grupo);
    if (lista) lista.push(o);
    else grupos.set(o.grupo, [o]);
  }
  return [
    ...(sueltas.length ? [{ grupo: null, opciones: sueltas }] : []),
    ...[...grupos].map(([grupo, lista]) => ({ grupo, opciones: lista })),
  ];
}
