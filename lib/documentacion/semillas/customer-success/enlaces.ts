/**
 * lib/documentacion/semillas/customer-success/enlaces.ts — las direcciones de la sección.
 *
 * Una sola tabla de slugs, títulos e íconos para las 15 páginas de Customer Success y las que la
 * sección nombra de afuera. Las páginas se enlazan mucho entre sí: con el título escrito a mano en
 * cada mención, un renombre dejaría la mitad de los enlaces con el nombre viejo en la semilla.
 */
import { mencion, type MencionASembrar } from "../bloques";

const PAGINAS = {
  customerSuccess: { slug: "customer-success", titulo: "Customer Success", icono: "🌱" },
  rolCse: { slug: "rol-cse", titulo: "Customer Success Executive (CSE)", icono: "🛠️" },
  rolCsl: { slug: "rol-csl", titulo: "Customer Success Lead (CSL)", icono: "🛡️" },
  guiaCse: { slug: "guia-de-cse", titulo: "Guía de CSE", icono: "🎯" },
  competencias: { slug: "competencias-core", titulo: "Competencias core", icono: "🧠" },
  dominio: { slug: "competencia-dominio", titulo: "Dominio de producto e industria", icono: "📚" },
  resolucion: { slug: "competencia-resolucion", titulo: "Resolución de problemas", icono: "🔧" },
  relacional: { slug: "competencia-relacional", titulo: "Habilidad relacional", icono: "🗣️" },
  relacion: { slug: "relacion-con-el-cliente", titulo: "La relación con el cliente", icono: "💬" },
  confianza: { slug: "empatia-y-confianza", titulo: "Empatía y confianza", icono: "💛" },
  reunion: { slug: "antes-de-una-reunion", titulo: "Antes de una reunión", icono: "📋" },
  descubrimiento: { slug: "descubrimiento", titulo: "Descubrimiento", icono: "🔎" },
  landAndExpand: { slug: "land-and-expand", titulo: "Land and Expand", icono: "🌳" },
  smartloop: { slug: "smartloop", titulo: "SmartLoop", icono: "🔁" },
  smartloopProceso: {
    slug: "smartloop-proceso-operativo",
    titulo: "SmartLoop: el proceso operativo",
    icono: "⚙️",
  },
  // De afuera de la sección.
  escala: { slug: "escala-de-rendimiento", titulo: "Escala de rendimiento", icono: "📈" },
  nexus: { slug: "como-funciona-nexus", titulo: "¿Cómo funciona Nexus?", icono: "🧭" },
  trabajar: { slug: "como-trabajar-en-smarteam", titulo: "¿Cómo trabajar en Smarteam?", icono: "🤝" },
} as const;

export type ClaveDePagina = keyof typeof PAGINAS;

/** Slug, título e ícono de una página de la sección. */
export const pagina = (clave: ClaveDePagina) => PAGINAS[clave];

/** Una mención a otra página, con su título e ícono de la tabla. */
export const a = (clave: ClaveDePagina): MencionASembrar => {
  const p = PAGINAS[clave];
  return mencion(p.slug, p.titulo, p.icono);
};
