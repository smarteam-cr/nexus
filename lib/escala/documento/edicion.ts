/**
 * lib/escala/documento/edicion.ts — la escala vista por una edición de industria. PURO.
 *
 * Una edición NO es otra escala: comparte áreas, dimensiones, niveles, reglas e identificadores, y
 * dice solo lo que cambia (nombres, preguntas, costos, criterios con sus palabras, criterios propios
 * y los de la escala general que ahí no aplican). `aplicarEdicion` arma, con eso, OTRA `Escala` del
 * mismo tipo: todo lo que ya sabe leer una escala —la pantalla, los comentarios, las pruebas— la lee
 * igual, sin enterarse de que hay ediciones.
 *
 *   · La edición decide QUÉ criterios existen y cómo se dicen.
 *   · El perfil de negocio (`perfil.ts`) sigue decidiendo cuáles de esos aplican.
 *
 * Los identificadores no cambian nunca: `1.7.F1` es el mismo criterio en la escala general y en
 * cualquier edición, se lea con el texto que se lea. Por eso un comentario o una medición apuntan
 * al mismo lugar en las dos.
 */
import { FORMA_DE_EDICION, sinTildes } from "./parsear";
import type { Area, Criterio, Dimension, Edicion, EdicionDeDimension, Escala, Nivel } from "./tipos";

export { FORMA_DE_EDICION };

export function edicionPorSlug(escala: Pick<Escala, "ediciones">, slug: string | null | undefined): Edicion | null {
  if (!slug) return null;
  return escala.ediciones.find((e) => e.slug === slug) ?? null;
}

/** Una escala ya derivada por edición: son pocas y la general no cambia (se cachea por huella). */
const derivadas = new WeakMap<Escala, Map<string, Escala>>();

function dimensionDeLaEdicion(d: Dimension, e: EdicionDeDimension | undefined): Dimension {
  if (!e) return d;
  const fuera = new Set(e.noAplican);
  const niveles = d.niveles.map((n): Nivel => {
    const delNivel = e.niveles[n.letra];
    const noAplican = n.criterios.filter((c) => fuera.has(c.id));
    const generales = n.criterios
      .filter((c) => !fuera.has(c.id))
      .map((c): Criterio => (e.textos[c.id] ? { ...c, texto: e.textos[c.id], textoGeneral: c.texto } : c));
    const propios = e.propios
      .filter((c) => c.id.startsWith(n.id) && /^\d+$/.test(c.id.slice(n.id.length)))
      .map((c): Criterio => ({ ...c, propio: true }));
    return {
      ...n,
      descripcion: delNivel?.descripcion ?? n.descripcion,
      resultado: delNivel?.resultado ?? n.resultado,
      criterios: [...generales, ...propios],
      ...(noAplican.length ? { noAplican } : {}),
    };
  });
  return {
    ...d,
    nombre: e.nombre,
    ...(e.nombre !== d.nombre ? { nombreGeneral: d.nombre } : {}),
    pregunta: e.pregunta ?? d.pregunta,
    descripcion: e.descripcion ?? d.descripcion,
    costoDeQuedarse: e.costoDeQuedarse ?? d.costoDeQuedarse,
    niveles,
  };
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Los requeridos, dentro de la edición: un enlace hacia un criterio que la edición sacó («No
 * aplican») ya no tiene a dónde apuntar, y se cae. El resto queda igual, y lo que no cambia sigue
 * siendo el MISMO objeto de la escala general (nada se copia de más).
 */
function sinRequeridosQueNoEstan(areas: Area[]): Area[] {
  const estan = new Set(areas.flatMap((a) => a.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios.map((c) => c.id)))));
  const cuelga = (c: Criterio) => c.requiere?.some((id) => !estan.has(id)) ?? false;
  return areas.map((a) => {
    if (!a.dimensiones.some((d) => d.niveles.some((n) => n.criterios.some(cuelga)))) return a;
    return {
      ...a,
      dimensiones: a.dimensiones.map((d) => {
        if (!d.niveles.some((n) => n.criterios.some(cuelga))) return d;
        return {
          ...d,
          niveles: d.niveles.map((n) => {
            if (!n.criterios.some(cuelga)) return n;
            return {
              ...n,
              criterios: n.criterios.map((c): Criterio => {
                if (!cuelga(c)) return c;
                const { requiere, ...resto } = c;
                const quedan = (requiere ?? []).filter((id) => estan.has(id));
                return quedan.length ? { ...resto, requiere: quedan } : resto;
              }),
            };
          }),
        };
      }),
    };
  });
}

/**
 * La escala como la dice una edición. Sin edición (o con un slug que la escala no tiene), devuelve
 * la MISMA escala general. Se le pasa siempre la general: es la que trae las ediciones.
 */
export function aplicarEdicion(escala: Escala, slug: string | null | undefined): Escala {
  const ed = edicionPorSlug(escala, slug);
  if (!ed) return escala;
  let cache = derivadas.get(escala);
  if (!cache) derivadas.set(escala, (cache = new Map()));
  const previa = cache.get(ed.slug);
  if (previa) return previa;

  const norm = (s: string) => sinTildes(s).toLowerCase().trim();
  /** Nombre general → nombre en la edición, de lo que la edición renombró. */
  const dimensionesRenombradas = new Map<string, string>();
  const areasRenombradas = new Map<string, string>();

  const areas = sinRequeridosQueNoEstan(
    escala.areas.map((a): Area => {
      const ea = ed.areas.find((x) => x.id === a.id);
      if (!ea) return a;
      if (ea.nombre !== a.nombre) areasRenombradas.set(a.nombre, ea.nombre);
      const dimensiones = a.dimensiones.map((d) => {
        const e = ea.dimensiones.find((x) => x.id === d.id);
        if (e && e.nombre !== d.nombre) dimensionesRenombradas.set(norm(d.nombre), e.nombre);
        return dimensionDeLaEdicion(d, e);
      });
      return {
        ...a,
        nombre: ea.nombre,
        ...(ea.nombre !== a.nombre ? { nombreGeneral: a.nombre } : {}),
        descripcion: ea.descripcion ?? a.descripcion,
        panoramica: { ...a.panoramica, ...ea.panoramica },
        dimensiones,
      };
    }),
  );

  // El orden de dependencias nombra las áreas («Ventas con equipo») y las dimensiones de producción
  // por su nombre: con los nombres de la edición, la pantalla lo sigue encontrando.
  const conAreas = (cuando: string) => {
    let out = cuando;
    for (const [general, edicion] of areasRenombradas) {
      out = out.replace(new RegExp(`(?<![\\p{L}])${escapar(general)}(?![\\p{L}])`, "gu"), edicion);
    }
    return out;
  };
  const dependencias = escala.dependencias.map((dep) => ({
    ...dep,
    cuando: conAreas(dep.cuando),
    orden: dep.orden.map((paso) => dimensionesRenombradas.get(norm(paso)) ?? paso),
  }));

  const derivada: Escala = {
    ...escala,
    areas,
    dependencias,
    edicion: { slug: ed.slug, nombre: ed.nombre, descripcion: ed.descripcion, perfilHabitual: ed.perfilHabitual, palabras: ed.palabras },
  };
  cache.set(ed.slug, derivada);
  return derivada;
}

export interface ResumenDeLaEdicion {
  /** Criterios que solo existen en la edición. */
  propios: number;
  /** Criterios de la escala general dichos con las palabras de la edición. */
  reescritos: number;
  /** Criterios de la escala general que en la edición no aplican. */
  noAplican: number;
  /** Dimensiones a las que la edición les cambió el nombre. */
  renombradas: number;
}

/** Cuánto cambió una edición de un área (o de una dimensión): para decirlo en la pantalla. */
export function resumenDeLaEdicion(dimensiones: Dimension[]): ResumenDeLaEdicion {
  const niveles = dimensiones.flatMap((d) => d.niveles);
  const criterios = niveles.flatMap((n) => n.criterios);
  return {
    propios: criterios.filter((c) => c.propio).length,
    reescritos: criterios.filter((c) => c.textoGeneral !== undefined).length,
    noAplican: niveles.reduce((s, n) => s + (n.noAplican?.length ?? 0), 0),
    renombradas: dimensiones.filter((d) => d.nombreGeneral !== undefined).length,
  };
}
