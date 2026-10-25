/**
 * lib/sessions/propuesta-de-empresa.ts — A QUÉ EMPRESA PROPONE NEXUS una reunión con texto que no tiene dueña (T3,
 * 2026-10-25; docs/reuniones-pieza-angular-plan.md). PURO.
 *
 * ⛔ Sin matching nuevo (invariante 2 de CLAUDE.md): la propuesta es lo que dice EL resolver, `categorizeSession`
 * (lib/sessions/categorize.ts), con una sola diferencia, que ya existe ahí para la pantalla de Sesiones:
 * `groupUnlinkedHubspotCompany`. Con ella, un dominio de fuera que en HubSpot es una empresa que Nexus no tiene sale como
 * esa empresa (la materialización, en cambio, sigue de largo al título y la deja sin dueña). Lo que resulta:
 *   · «CLIENTE»: la cascada ya la reconoce como de una empresa de Nexus (pasa cuando la empresa llegó después de la
 *     última atribución de la reunión): se propone esa;
 *   · «HUBSPOT»: los invitados de @dominio son de una empresa de HubSpot que no está en Nexus: se propone crearla como
 *     prospecto (lib/clients/cliente-de-la-empresa-de-ventas.ts, la puerta que ya crea prospectos);
 *   · nada: una categoría, un correo personal, un dominio que nadie conoce. La persona elige a mano.
 * Lo escaneado por lib/sessions/empresa-de-la-reunion.test.ts: este archivo y los que deciden no eligen empresa por su
 * cuenta (ni dominios a mano ni `resolvedClientId` escrito directo).
 */
import { DIAS_DE_FRESCURA } from "@/lib/lecturas/reglas";
import { categorizeSession, type CategorizableSession, type CategorizeContext } from "./categorize";
import { estuvoEnLaReunion } from "./preguntas-de-contexto";

export type PropuestaCalculada =
  | { tipo: "CLIENTE"; clientId: string; nombre: string; hubspotCompanyId: null; dominio: null }
  | { tipo: "HUBSPOT"; clientId: null; nombre: string; hubspotCompanyId: string; dominio: string };

/** Lo que propone el resolver para una reunión sin dueña, o null. */
export function proponerEmpresa(s: CategorizableSession, ctx: CategorizeContext): PropuestaCalculada | null {
  const g = categorizeSession(s, { ...ctx, groupUnlinkedHubspotCompany: true });
  if (g.kind === "client") return { tipo: "CLIENTE", clientId: g.id, nombre: g.label, hubspotCompanyId: null, dominio: null };
  if (g.kind === "hubspotCompany") return { tipo: "HUBSPOT", clientId: null, nombre: g.label, hubspotCompanyId: g.id, dominio: g.domain };
  return null;
}

/** ¿La propuesta guardada es la misma que la de ahora? (si no, se reescribe y vuelve a contar desde ahora). */
export function mismaPropuesta(
  a: { tipo: string; clientId: string | null; hubspotCompanyId: string | null },
  b: PropuestaCalculada,
): boolean {
  return a.tipo === b.tipo && (a.clientId ?? null) === b.clientId && (a.hubspotCompanyId ?? null) === b.hubspotCompanyId;
}

/** Por qué la propone, en una frase para la pantalla. */
export function porQueLaPropone(p: { tipo: string; nombre: string; dominio: string | null }): string {
  if (p.tipo === "HUBSPOT") {
    return `Los invitados${p.dominio ? ` de @${p.dominio}` : ""} son de «${p.nombre}» en HubSpot, que todavía no está en Nexus: al confirmar se crea como prospecto.`;
  }
  return `Por los invitados o el título, Nexus la reconoce como de ${p.nombre}.`;
}

/** Cómo se dice la opción en la lista para elegir la empresa. */
export function opcionDeLaPropuesta(p: { tipo: string; nombre: string }): string {
  return p.tipo === "HUBSPOT" ? `${p.nombre} · crear como prospecto (de HubSpot)` : p.nombre;
}

/** El valor que viaja en la lista para elegir la propuesta HUBSPOT (los demás valores son ids de empresas). */
export const VALOR_DE_LA_PROPUESTA = "__propuesta__";

/**
 * ¿Puede decidir la empresa de una reunión SIN dueña? La decide quien la organizó (2026-10-24); también quien estuvo
 * invitado del equipo, y la líder de Customer Success y dirección (`veTodo`), que ven todas en el tablero.
 */
export function puedeDecidirLaEmpresa(
  r: { organizador: string | null; participantes: readonly string[] },
  quien: { email: string; veTodo: boolean },
): boolean {
  return quien.veTodo || estuvoEnLaReunion(r, quien.email);
}

const DIA_MS = 86_400_000;

/** Qué le pasa a la reunión después, dicho para la persona. */
export function mensajeDespuesDeDecidir(nombre: string, fecha: Date, ahora: Date, creada: boolean): string {
  const base = creada ? `Listo: se creó «${nombre}» como prospecto y la reunión quedó en esa empresa.` : `Listo: la reunión quedó en ${nombre}.`;
  const fresca = +ahora - +fecha <= DIAS_DE_FRESCURA * DIA_MS;
  return fresca
    ? `${base} Si es con un cliente o un prospecto, Nexus la lee en unos minutos.`
    : `${base} Tiene más de ${DIAS_DE_FRESCURA} días, así que no se lee sola: entra en la próxima lectura por lote de lo atrasado.`;
}
