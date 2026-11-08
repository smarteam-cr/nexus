"use client";

/**
 * useAreasDeLaEscala — de qué equipos se habló y qué se sabe de cada área (lib/exploraciones/equipos-de-la-escala.ts),
 * con lo que tiene el lienzo: lo confirmado, lo que dibuja el mapa sin usar y las sesiones que ya ocurrieron con un
 * equipo. La leen «Dónde está hoy» (PasoEscala) y «Qué equipos ve» (AccesoALaEscala): cuentan lo mismo.
 */
import { areasDeLaEscala, type AreaDeLaEscala, type LoDeLaDimension } from "@/lib/exploraciones/equipos-de-la-escala";
import { EQUIPOS } from "@/lib/exploraciones/equipos";
import { useLienzo } from "./contexto";
import { useSesiones } from "./useSesiones";

export function useAreasDeLaEscala(): AreaDeLaEscala[] {
  const { exp, escala, mapa } = useLienzo();
  const { pestanas } = useSesiones();
  const lo: Record<string, LoDeLaDimension> = {};
  for (const [id, e] of Object.entries(exp.estado.contenido.chequeo)) lo[id] = { confirmado: { fuente: e.fuente } };
  for (const [id, p] of Object.entries(mapa.posiciones)) {
    if (p.origen === "propuesto") lo[id] = { ...lo[id], sugerido: { fuente: p.fuente, conCita: p.citas.length > 0 } };
  }
  return areasDeLaEscala({
    areas: escala.areas,
    enJuego: exp.estado.areas,
    lo,
    areasDeLasSesiones: pestanas.flatMap((p) => (p.hecha && p.sesion?.equipo ? [EQUIPOS[p.sesion.equipo].area] : [])),
  });
}
