/**
 * lib/uso/por-equipo.ts — qué secciones de Nexus usa cada EQUIPO («Uso de Nexus» › Equipo). PURO y client-safe: lo
 * calcula el navegador con lo que ya trae la pestaña (las secciones de cada persona).
 *
 * Por equipo, no por persona: cuántas personas del equipo abrieron cada sección en las 4 semanas y cuántos días de uso
 * suman. Un equipo sin nadie que abra una sección se ve vacío: eso es lo que hay que mirar.
 */

export interface SeccionDePersona {
  clave: string;
  nombre: string;
  aperturas: number;
  dias: number;
}

export interface PersonaConSecciones {
  equipo: string;
  secciones: readonly SeccionDePersona[];
}

export interface CeldaDeEquipo {
  personas: number;
  dias: number;
}

export interface UsoPorEquipo {
  /** Las secciones de las columnas: las que alguien abrió, de la más usada (por personas) a la menos. */
  secciones: { clave: string; nombre: string }[];
  equipos: { equipo: string; personas: number; porSeccion: Record<string, CeldaDeEquipo> }[];
}

/** Agrupa por equipo, en el orden en que llegan las personas (que ya vienen ordenadas por equipo). */
export function usoPorEquipo(personas: readonly PersonaConSecciones[]): UsoPorEquipo {
  const equipos = new Map<string, { equipo: string; personas: number; porSeccion: Record<string, CeldaDeEquipo> }>();
  const totales = new Map<string, { nombre: string; personas: number; dias: number }>();
  for (const p of personas) {
    const e = equipos.get(p.equipo) ?? { equipo: p.equipo, personas: 0, porSeccion: {} };
    e.personas++;
    for (const s of p.secciones) {
      const c = (e.porSeccion[s.clave] ??= { personas: 0, dias: 0 });
      c.personas++;
      c.dias += s.dias;
      const t = totales.get(s.clave) ?? { nombre: s.nombre, personas: 0, dias: 0 };
      t.personas++;
      t.dias += s.dias;
      totales.set(s.clave, t);
    }
    equipos.set(p.equipo, e);
  }
  return {
    secciones: [...totales.entries()]
      .sort((a, b) => b[1].personas - a[1].personas || b[1].dias - a[1].dias || a[1].nombre.localeCompare(b[1].nombre))
      .map(([clave, t]) => ({ clave, nombre: t.nombre })),
    equipos: [...equipos.values()],
  };
}
