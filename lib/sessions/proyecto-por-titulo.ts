/**
 * lib/sessions/proyecto-por-titulo.ts — DENTRO DE UN CLIENTE, EL TÍTULO MANDA EL PROYECTO. PURO. (U6, 2026-11-07)
 *
 * kölbi es UN cliente con tres proyectos (Ventas, Marketing, InfoClic; decisión 5 del plan de unidades, después de leer
 * sus 77 transcripciones). Su gente se cruza: 20 de las 45 personas del ICE están en reuniones de Ventas y de Marketing,
 * así que la IA del clasificador (classify-session-project.ts), que ve los correos, no puede separarlas por la gente.
 * Lo que separa es el título: «kölbi Marketing | Campaña de recargas» es de Marketing aunque vaya la gente de Ventas.
 *
 * La regla, antes de la IA: si el título nombra a UN solo proyecto de la ficha, la reunión es de ese. «Nombrar» es traer,
 * como palabras enteras, TODAS las palabras PROPIAS del nombre del proyecto: sin las del cliente («kölbi», «kolbi.cr»),
 * sin las que tiene otro proyecto de la misma ficha, sin números sueltos (un año) y sin las genéricas de cualquier
 * proyecto («Integración», «HubSpot», «Implementación», «proyecto»…). Si nombra a dos o a ninguno, decide la IA de siempre.
 *
 * ⚠ TODAS, no una (medido el 7 nov en los 23 clientes con dos o más proyectos, revisión del cambio): con una alcanzaba,
 * «RCI - Hubspot CRM» se iba a «WEBs * RCI» por «rci», «STL: Propuesta» a «SECURE TITLE SERVICE HUB | STL» por «stl» y
 * «Sitio web Smarteam» a «Integración con Reportes web» por «web». El nombre corto del cliente y las palabras de oficio
 * aparecen en títulos de todos sus proyectos; el nombre entero del proyecto, no.
 *
 * Plan: docs/empresas-con-dominio-compartido-plan.md, parte 2, etapa U6. DECISIONS «Una empresa con varias unidades».
 */
import { normalize, TITLE_MATCH_STOPWORDS } from "./categorize";

/**
 * Palabras que están en el nombre de cualquier proyecto de la agencia y no distinguen uno de otro. Medido en los
 * proyectos de kölbi: «Integración con InfoClic» se nombra por «InfoClic»; si «integración» contara, «Integración de
 * WhatsApp» se iría a InfoClic.
 */
const GENERICAS_DE_PROYECTO = new Set([
  "del", "las", "los", "con", "por", "una", "uno", "sin", "the", "and", "for", "with",
  "proyecto", "proyectos", "implementacion", "reimplementacion", "integracion", "integraciones", "hubspot", "crm",
  "fase", "etapa", "plan", "servicio", "servicios", "smarteam", "smartloop", "cliente", "informacion",
]);

/** Las palabras de un texto, sin acentos y en minúsculas, de 3 letras o más. */
function palabras(texto: string): string[] {
  return normalize(texto)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

/** Un número suelto («2026», «100») no nombra a un proyecto: está en títulos de cualquiera. */
const esNumero = (w: string) => /^[0-9]+$/.test(w);

export interface ProyectoParaTitulo {
  id: string;
  name: string;
}

export interface ClienteParaTitulo {
  name: string;
  company: string | null;
  siglas?: readonly string[] | null;
}

/** Las palabras propias de cada proyecto: las de su nombre que no son del cliente, ni genéricas, ni de otro proyecto. */
export function palabrasPropiasDeLosProyectos(
  proyectos: readonly ProyectoParaTitulo[],
  cliente: ClienteParaTitulo,
): Map<string, Set<string>> {
  const delCliente = new Set([cliente.name, cliente.company ?? "", ...(cliente.siglas ?? [])].flatMap(palabras));
  const comunes = (w: string) => delCliente.has(w) || GENERICAS_DE_PROYECTO.has(w) || TITLE_MATCH_STOPWORDS.has(w) || esNumero(w);
  const porProyecto = new Map(proyectos.map((p) => [p.id, new Set(palabras(p.name).filter((w) => !comunes(w)))]));
  const vistas = new Map<string, number>();
  for (const ws of porProyecto.values()) for (const w of ws) vistas.set(w, (vistas.get(w) ?? 0) + 1);
  for (const ws of porProyecto.values()) for (const w of [...ws]) if ((vistas.get(w) ?? 0) > 1) ws.delete(w);
  return porProyecto;
}

export interface ProyectoDelTitulo {
  /** El proyecto que nombra el título, o null si nombra a dos o a ninguno (decide la IA). */
  proyectoId: string | null;
  /** Los que nombra, con las palabras que los nombraron. */
  nombrados: { proyectoId: string; palabra: string }[];
}

/** ¿A qué proyecto de la ficha nombra el título? Ver el encabezado. */
export function proyectoQueNombraElTitulo(
  titulo: string,
  proyectos: readonly ProyectoParaTitulo[],
  cliente: ClienteParaTitulo,
): ProyectoDelTitulo {
  const delTitulo = new Set(palabras(titulo));
  const nombrados: ProyectoDelTitulo["nombrados"] = [];
  for (const [proyectoId, propias] of palabrasPropiasDeLosProyectos(proyectos, cliente)) {
    if (propias.size === 0 || ![...propias].every((w) => delTitulo.has(w))) continue;
    nombrados.push({ proyectoId, palabra: [...propias].join(" ") });
  }
  return { proyectoId: nombrados.length === 1 ? nombrados[0]!.proyectoId : null, nombrados };
}
