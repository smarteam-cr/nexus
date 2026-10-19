/**
 * lib/tareas/cupo.ts — el cupo de propuestas que deja una reunión a cada persona. CLIENT-SAFE y puro.
 *
 * Una reunión le propone a una persona como mucho `MAX_PROPUESTAS_POR_PERSONA_POR_REUNION` tareas (ficha A, 2026-10-17).
 * El cupo se cuenta sobre TODO lo que ya dejó esa reunión a esa persona (otra pasada, «¿Faltó algo?») y sobre lo que se
 * va escribiendo, en el orden de las líneas. «Por asignar» no tiene dueño y no cuenta.
 */
import { MAX_PROPUESTAS_POR_PERSONA_POR_REUNION } from "./reglas";
import { huellaDeTexto } from "./texto";

export interface Cupo {
  /** ¿Le queda lugar a esta persona? Si sí, lo ocupa. */
  tomar(email: string): boolean;
  /** Las que no entraron, por persona. */
  sinLugar(): Map<string, number>;
}

export function cupoPorPersona(yaTiene: ReadonlyMap<string, number>, tope = MAX_PROPUESTAS_POR_PERSONA_POR_REUNION): Cupo {
  const usados = new Map<string, number>([...yaTiene].map(([k, v]) => [k.toLowerCase(), v]));
  const fuera = new Map<string, number>();
  return {
    tomar(email) {
      const k = email.toLowerCase();
      const n = usados.get(k) ?? 0;
      if (n >= tope) {
        fuera.set(k, (fuera.get(k) ?? 0) + 1);
        return false;
      }
      usados.set(k, n + 1);
      return true;
    },
    sinLugar: () => new Map(fuera),
  };
}

/** «2 quedaron sin proponer (cada reunión propone como mucho 5 por persona)». null si entraron todas. */
export function textoSinLugar(n: number, tope = MAX_PROPUESTAS_POR_PERSONA_POR_REUNION): string | null {
  if (n <= 0) return null;
  return `${n === 1 ? "1 quedó" : `${n} quedaron`} sin proponer: cada reunión propone como mucho ${tope} tareas por persona.`;
}

/**
 * De lo que arma una lectura, lo de UNA persona que el tope dejó fuera: no tiene tarea escrita (su línea no está en
 * `yaEscritas`) y no hay una propuesta suya igual a la que se habría sumado (`huellasPropuestas`: esa no se cortó, se
 * sumó). «Por asignar» nunca queda fuera: no es de nadie.
 */
export function lasQueQuedaronFuera<T extends { lineaId: string; titulo: string; responsableEmail: string | null; porAsignar: boolean }>(
  propuestas: readonly T[],
  email: string,
  yaEscritas: ReadonlySet<string>,
  huellasPropuestas: ReadonlySet<string>,
): T[] {
  const yo = email.toLowerCase();
  return propuestas.filter(
    (p) => !p.porAsignar && p.responsableEmail?.toLowerCase() === yo && !yaEscritas.has(p.lineaId) && !huellasPropuestas.has(huellaDeTexto(p.titulo)),
  );
}

/** «4 tareas tuyas quedaron sin proponer…». */
export function textoFueraDelTope(n: number, tope = MAX_PROPUESTAS_POR_PERSONA_POR_REUNION): string {
  return `${n === 1 ? "1 tarea tuya quedó" : `${n} tareas tuyas quedaron`} sin proponer: cada reunión propone como mucho ${tope} por persona.`;
}
