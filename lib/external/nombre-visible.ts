/**
 * lib/external/nombre-visible.ts — cómo se nombra un proyecto frente al cliente.
 *
 * Los nombres de proyecto repiten al cliente porque vienen así de HubSpot: «JUDESUR | MEJORA WEB |
 * CONSULTA DE SALDOS», «Integración con Odoo | Visual Branding», «Wherex - Migración CRM». En la
 * página del cliente la empresa ya está a la vista, así que repetirla solo alarga el rótulo que
 * tiene que distinguir un proyecto del otro — que es justo para lo que se muestra.
 *
 * Se sacan los tramos que SON el nombre del cliente. Si no queda nada (el proyecto se llama como la
 * empresa) o no había nada que sacar, se deja el nombre tal cual. PURO.
 */

/** `|` con o sin espacios; un guion solo cuando está suelto (" - "), para no partir «E-commerce». */
const SEPARADORES = /\s*\|\s*|\s+[-–—]\s+/;

const normal = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function nombreVisibleDelProyecto(proyecto: string, cliente: string): string {
  const entero = proyecto.replace(/\s+/g, " ").trim();
  const empresa = normal(cliente);
  if (!empresa) return entero;
  const tramos = entero
    .split(SEPARADORES)
    .map((t) => t.trim())
    .filter(Boolean);
  const propios = tramos.filter((t) => normal(t) !== empresa);
  if (propios.length === 0 || propios.length === tramos.length) return entero;
  return propios.join(" · ");
}
