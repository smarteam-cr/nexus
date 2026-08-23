/**
 * lib/landing/clase-de-seccion.ts — LA CLASE DE CADA SECCIÓN DEL MOTOR, COMO DATO.
 *
 * ── DE DÓNDE SALE ────────────────────────────────────────────────────────────────────────────
 * Elías leyó la arquitectura del motor mejor de lo que estaba escrita (2026-08-23):
 *
 *   *«lo de equipo solo está en kickoff, igual de lo de horario — eso deberían ser como módulos
 *   personalizados por canvas; luego de eso, todos son tipos similares: texto y títulos, cards,
 *   cards con íconos, métricas, comparaciones, above the folds, footers, tags, subtítulos,
 *   tablas… Tampoco son demasiados para que no sirva.»*
 *
 * Tenía razón, y además tiene PODER PREDICTIVO: los tres editores que fallaron en pantalla son
 * tres de los que viven en un solo canvas. La clase que él nombró es exactamente la clase donde
 * ocurrieron los fallos.
 *
 * ⭐ Y LA CLASIFICACIÓN NO SE ESCRIBE A MANO: se DERIVA. Un módulo de canvas es un tipo que vive
 * en un solo documento; uno genérico, en dos o más; uno estructural, el que declara `backdrop`,
 * `pinned` o `noHide`. Escribirla a mano la condenaría a pudrirse — que es lo que le pasó a
 * `rotulosDeCampos`, declarado y sin producir durante meses. Lo que sí se congela es el CENSO, en
 * `registry.test.ts`: si un tipo cambia de clase, alguien tiene que decidirlo.
 *
 * ⚠ El caso real que lo justifica: `props_table` nació como módulo de Desarrollo y hoy también
 * está en Implementación. Se prestó, y nada dijo nada.
 */

/**
 * ⛔ LOS ALIAS: UN COMPONENTE CON VARIOS NOMBRES, Y HAY QUE DECLARARLOS, NO NORMALIZARLOS.
 *
 * Los `sectionType` están **congelados en los snapshots publicados**: `configForSnapshot` resuelve
 * por ese string, así que renombrar uno haría desaparecer la sección de un documento que YA está
 * en manos de un cliente. Normalizar AGREGA nombres; nunca quita.
 *
 * Lo que sí hace falta es que las guardas sepan que son el mismo componente. Sin esto, un chequeo
 * por `sectionType` trata a `desarrollo_hero` y `planificacion_hero` como dos cosas distintas y
 * **no compara sus contratos de datos** — y son la misma función React.
 *
 * ⭐ Medido el 2026-08-23: 62 `sectionType` en 12 mapas sobre 5 familias de alias que cubren 19 de
 * esos nombres. La más grande es el cierre: SEIS nombres para `KickoffCtaSection`.
 */
export const ALIAS_DE_SECTION_TYPE: Readonly<Record<string, string>> = {
  /* KickoffCtaSection — el cierre de los seis documentos de proyecto. */
  desarrollo_cta: "kickoff_cta",
  entrega_cta: "kickoff_cta",
  exploracion_cta: "kickoff_cta",
  implementacion_cta: "kickoff_cta",
  planificacion_cta: "kickoff_cta",
  /* DesarrolloHeroSection — la portada de cuatro documentos de proyecto. */
  exploracion_hero: "desarrollo_hero",
  implementacion_hero: "desarrollo_hero",
  planificacion_hero: "desarrollo_hero",
  /* HubsClienteSection — «qué se implementa» en la propuesta, «qué quedó» en la Entrega. */
  solucion: "hubs_cliente",
  /* InvestmentSection — la tabla de cobro de las dos propuestas. */
  web_investment: "inversion",
  /* PainSection — las tarjetas con ícono. */
  dolores: "pain",
};

/** El nombre bajo el que se agrupan las guardas. Un tipo sin alias es su propio canónico. */
export function tipoCanonico(sectionType: string): string {
  return ALIAS_DE_SECTION_TYPE[sectionType] ?? sectionType;
}

/**
 * Las tres clases del motor.
 *
 *  · `estructural` — portadas y cierres. No se mueven ni se ocultan: un documento sin portada no
 *    es más libre, está roto.
 *  · `modulo` — vive en UN solo documento y es propio de esa pieza (el equipo y los horarios del
 *    kickoff, el plan de sesiones de Exploración, la estimación del requerimiento técnico).
 *  · `generico` — lo comparten dos o más documentos: prosa, tarjetas, métricas, comparaciones,
 *    tablas, diagnósticos a dos columnas. Es el núcleo que Elías describió.
 */
export type ClaseDeSeccion = "estructural" | "modulo" | "generico";

export function claseDeSeccion(hechos: {
  /** `backdrop`, `pinned` o `noHide` en cualquiera de las defs que lo montan. */
  estructural: boolean;
  /** En cuántos DOCUMENTOS distintos aparece el tipo canónico. */
  documentos: number;
}): ClaseDeSeccion {
  /* El orden importa: una portada compartida por tres documentos sigue siendo estructural. Lo que
     la define es que no se mueve, no cuántas veces aparece. */
  if (hechos.estructural) return "estructural";
  return hechos.documentos > 1 ? "generico" : "modulo";
}
