/**
 * lib/analizador-venta/alcance.ts — QUÉ SE ESPERABA EXPLORAR EN UNA SESIÓN: el alcance del juicio «qué se exploró y qué
 * quedó sin explorar» (2026-10-27, la noche 2). PURO y client-safe.
 *
 * Antes el analizador le pasaba al agente todas las dimensiones de las áreas en juego (hasta 24): una sesión con el equipo
 * de Marketing salía con «sin explorar» en las dimensiones de Ventas y de Servicio, que nadie llevó a esa reunión. Ahora
 * se acota al área de la sesión, en este orden:
 *   1. la sesión es con un equipo del cliente (`SesionPlaneada.equipo`):
 *      · con área en la escala (Ventas, Marketing, Servicio): las dimensiones de esa área;
 *      · sin área (Dirección, Operaciones, Finanzas, Tecnología): los temas del equipo, que es lo que su guía pregunta;
 *   2. la guía de la sesión estaba enfocada en dimensiones (`GuiaDeLaSesion.enfoque`): esas;
 *   3. si no: las de las áreas en juego de la preventa (lo de antes, el último recurso).
 * Solo las dimensiones que aplican al perfil de la empresa.
 */
import { EQUIPOS, type ClaveDeEquipo } from "@/lib/exploraciones/equipos";

export interface AreaParaElAlcance {
  id: string;
  nombre: string;
  dimensiones: readonly { id: string; nombre: string; aplica: boolean }[];
}

export interface DimensionDelAlcance {
  id: string | null;
  nombre: string;
  area: string;
}

export interface AlcanceDeLaSesion {
  de: "equipo" | "temas_del_equipo" | "guia" | "areas_en_juego";
  /** En una línea, para el agente y para la pantalla. */
  descripcion: string;
  dimensiones: DimensionDelAlcance[];
}

export function alcanceDeLaSesion(o: {
  equipo: ClaveDeEquipo | null | undefined;
  /** Las dimensiones en foco de la guía que se llevó (ids). */
  enfoque: readonly string[];
  areasEnJuego: readonly string[];
  areas: readonly AreaParaElAlcance[];
}): AlcanceDeLaSesion {
  const dims = (a: AreaParaElAlcance, filtro: (id: string) => boolean = () => true) =>
    a.dimensiones.filter((d) => d.aplica && filtro(d.id)).map((d) => ({ id: d.id, nombre: d.nombre, area: a.nombre }));

  const eq = o.equipo ? EQUIPOS[o.equipo] : null;
  if (eq?.area) {
    const area = o.areas.find((a) => a.id === eq.area);
    if (area) return { de: "equipo", descripcion: `La sesión fue con el equipo de ${eq.nombre}: solo las dimensiones del área ${area.nombre}.`, dimensiones: dims(area) };
  }
  if (eq) {
    return {
      de: "temas_del_equipo",
      descripcion: `La sesión fue con el equipo de ${eq.nombre}, que la escala no mide por dimensiones: los temas que su guía pregunta.`,
      dimensiones: eq.temas.map((t) => ({ id: null, nombre: t.nombre, area: eq.nombre })),
    };
  }
  const enfoque = new Set(o.enfoque);
  if (enfoque.size) {
    const enFoco = o.areas.flatMap((a) => dims(a, (id) => enfoque.has(id)));
    if (enFoco.length) return { de: "guia", descripcion: "Las dimensiones en las que estaba enfocada la guía de la sesión.", dimensiones: enFoco };
  }
  return {
    de: "areas_en_juego",
    descripcion: "La sesión no tenía equipo ni guía enfocada: las dimensiones de las áreas en juego de la preventa.",
    dimensiones: o.areas.filter((a) => o.areasEnJuego.includes(a.id)).flatMap((a) => dims(a)),
  };
}
