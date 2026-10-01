/**
 * lib/exploraciones/escala-del-lienzo.ts — la parte de la escala que el lienzo necesita. PURO.
 *
 * El servidor lee la escala publicada (nunca el archivo de `docs/`), le aplica la edición de la
 * industria elegida y le baja al navegador solo lo que el lienzo usa: los nombres, la pregunta y el
 * costo de quedarse de cada dimensión, las descripciones y líneas de resultado de sus niveles, lo que
 * pide Funcional para el perfil de la empresa y los riesgos con su mensaje. Ningún texto de la
 * escala está escrito en el código: todo viene de acá.
 */
import { areaParaChequeo, type AreaParaChequeo } from "@/lib/escala/chequeo";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { aplica, type Perfil } from "@/lib/escala/documento/perfil";
import type {
  Cierre,
  ClaveDeCapa,
  Despues,
  Escala,
  Letra,
  PreguntaDelPerfil,
  Verificacion,
} from "@/lib/escala/documento/tipos";

export interface CriterioDelLienzo {
  id: string;
  texto: string;
  verificacion: Verificacion;
  habito: boolean;
}

export interface RiesgoDelLienzo {
  id: string;
  texto: string;
  /** Lo que ve el cliente cuando el riesgo está activo (tabla de Riesgos de la escala). */
  mensaje: string | null;
}

export interface DimensionDelLienzo {
  id: string;
  nombre: string;
  nombreGeneral: string | null;
  capa: ClaveDeCapa;
  pregunta: string;
  descripcion: string | null;
  costoDeQuedarse: string;
  /** No aplica al perfil de la empresa: no se pregunta ni se cuenta. */
  aplica: boolean;
  niveles: { letra: Letra; descripcion: string; resultado: string | null }[];
  /** Lo que pide Funcional para este perfil (los criterios que deciden el nivel). */
  funcional: CriterioDelLienzo[];
  /** Los criterios de riesgo de Funcional, con su mensaje. */
  riesgos: RiesgoDelLienzo[];
}

export interface AreaDelLienzo {
  id: string;
  nombre: string;
  nombreGeneral: string | null;
  dimensiones: DimensionDelLienzo[];
  paraChequeo: AreaParaChequeo;
}

export interface EscalaDelLienzo {
  version: string;
  niveles: { letra: Letra; nombre: string }[];
  capas: { clave: ClaveDeCapa; nombre: string }[];
  /** Las ediciones de la escala, con para quién es cada una y su perfil habitual. */
  ediciones: { slug: string; nombre: string; descripcion: string | null; perfilHabitual: { cierre: Cierre; despues: Despues } | null }[];
  edicion: { slug: string; nombre: string } | null;
  perfil: { cierre: PreguntaDelPerfil | null; despues: PreguntaDelPerfil | null };
  areas: AreaDelLienzo[];
}

/** Las tres áreas, vistas con la edición y el perfil de la exploración. */
export function escalaParaElLienzo(general: Escala, edicion: string | null, perfil: Perfil): EscalaDelLienzo {
  const vista = aplicarEdicion(general, edicion);
  return {
    version: vista.version,
    niveles: vista.niveles.map((n) => ({ letra: n.letra, nombre: n.nombre })),
    capas: vista.capas.map((c) => ({ clave: c.clave, nombre: c.nombre })),
    ediciones: general.ediciones.map((e) => ({ slug: e.slug, nombre: e.nombre, descripcion: e.descripcion, perfilHabitual: e.perfilHabitual })),
    edicion: vista.edicion ? { slug: vista.edicion.slug, nombre: vista.edicion.nombre } : null,
    perfil: { cierre: vista.perfilDeNegocio.cierre, despues: vista.perfilDeNegocio.despues },
    areas: vista.areas.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      nombreGeneral: a.nombreGeneral ?? null,
      paraChequeo: areaParaChequeo(vista, a.id, perfil) as AreaParaChequeo,
      dimensiones: a.dimensiones.map((d) => {
        const funcional = d.niveles.find((n) => n.letra === "F");
        const queAplican = (funcional?.criterios ?? []).filter((c) => aplica(c, perfil));
        return {
          id: d.id,
          nombre: d.nombre,
          nombreGeneral: d.nombreGeneral ?? null,
          capa: d.capa,
          pregunta: d.pregunta,
          descripcion: d.descripcion,
          costoDeQuedarse: d.costoDeQuedarse,
          aplica: queAplican.some((c) => !c.riesgo),
          niveles: d.niveles.map((n) => ({ letra: n.letra, descripcion: n.descripcion, resultado: n.resultado })),
          funcional: queAplican
            .filter((c) => !c.riesgo)
            .map((c) => ({ id: c.id, texto: c.texto, verificacion: c.verificacion, habito: c.habito })),
          riesgos: queAplican
            .filter((c) => c.riesgo)
            .map((c) => ({ id: c.id, texto: c.texto, mensaje: vista.riesgos[c.id] ?? null })),
        };
      }),
    })),
  };
}

/**
 * Los ids que las operaciones pueden tocar: las dimensiones de la escala y lo que pide Funcional.
 * De TODAS las áreas, no solo de las que están en juego: el vendedor suma un área y estima sus
 * dimensiones en el mismo gesto, y lo de un área que no está en juego no entra en ninguna cuenta.
 */
export function idsDeLaEscala(escala: EscalaDelLienzo): { dimensiones: Set<string>; criterios: Set<string> } {
  return {
    dimensiones: new Set(escala.areas.flatMap((a) => a.dimensiones.map((d) => d.id))),
    criterios: new Set(escala.areas.flatMap((a) => a.dimensiones.flatMap((d) => d.funcional.map((c) => c.id)))),
  };
}
