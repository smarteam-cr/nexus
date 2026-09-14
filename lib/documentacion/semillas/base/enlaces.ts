/**
 * lib/documentacion/semillas/base/enlaces.ts — las direcciones de la estructura de la base.
 *
 * Una sola tabla de slugs, títulos e íconos para la portada, sus seis secciones y las páginas nuevas
 * que cuelgan de ellas. Las páginas que ya existían (la Escala, el manual de Nexus, Customer Success
 * y sus hijas) siguen declaradas en `customer-success/enlaces.ts`: se enlazan desde ahí.
 *
 * Mismo motivo que la tabla de Customer Success: con el título escrito a mano en cada mención, un
 * renombre dejaría enlaces con el nombre viejo en la semilla.
 */
import { mencion, type MencionASembrar } from "../bloques";
import { SLUG_DE_INICIO } from "../../tipos";

const PAGINAS = {
  inicio: { slug: SLUG_DE_INICIO, titulo: "Inicio", icono: "🏠" },
  empresa: { slug: "la-empresa", titulo: "La empresa", icono: "🏛️" },
  proposito: { slug: "proposito-mision-y-valores", titulo: "Propósito, misión y valores", icono: "💡" },
  historia: { slug: "historia-e-hitos", titulo: "Historia e hitos", icono: "📜" },
  departamentos: { slug: "departamentos", titulo: "Departamentos", icono: "🏢" },
  ventas: { slug: "departamento-ventas", titulo: "Ventas", icono: "💼" },
  finanzas: { slug: "departamento-finanzas", titulo: "Finanzas y Administración", icono: "💰" },
  desarrollo: { slug: "departamento-desarrollo", titulo: "Desarrollo", icono: "💻" },
  marketing: { slug: "departamento-marketing", titulo: "Marketing", icono: "📣" },
  revops: { slug: "departamento-revops", titulo: "Revenue Operations", icono: "⚙️" },
  servicios: { slug: "servicios", titulo: "Servicios", icono: "🧩" },
  casos: { slug: "casos-de-exito", titulo: "Casos de éxito", icono: "🏆" },
  recursos: { slug: "recursos-y-herramientas", titulo: "Recursos y herramientas", icono: "🧰" },
  herramientas: { slug: "herramientas", titulo: "Herramientas", icono: "🔧" },
  marca: { slug: "marca", titulo: "Marca", icono: "🎨" },
  comoTrabajamos: { slug: "como-trabajamos", titulo: "Cómo trabajamos", icono: "🗓️" },
  condiciones: { slug: "horario-y-condiciones", titulo: "Horario y condiciones", icono: "⏰" },
  equipo: { slug: "el-equipo", titulo: "El equipo", icono: "👥" },
} as const;

export type ClaveDeLaBase = keyof typeof PAGINAS;

/** Slug, título e ícono de una página de la estructura. */
export const pagina = (clave: ClaveDeLaBase) => PAGINAS[clave];

/** Una mención a otra página de la estructura, con su título e ícono de la tabla. */
export const a = (clave: ClaveDeLaBase): MencionASembrar => {
  const p = PAGINAS[clave];
  return mencion(p.slug, p.titulo, p.icono);
};
