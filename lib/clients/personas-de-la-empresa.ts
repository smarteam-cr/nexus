/**
 * lib/clients/personas-de-la-empresa.ts — una persona del cliente, una sola, con su rol (R6, 2026-10-25). PURO.
 *
 * Había cinco copias sin unir: los contactos de HubSpot, los participantes de las reuniones (1.004 de fuera en la copia
 * de Meet; de 1.612 correos, solo 567 eran contactos), las personas de los cuestionarios, los stakeholders de la ficha y
 * del handoff (texto) y las personas de la preventa (Json). Esta regla une las tres que tienen correo en una persona por
 * correo y empresa (`PersonaDeLaEmpresa`), con de dónde se la conoce. Los textos de la ficha, del handoff y de la
 * preventa no se tocan al principio (docs/arquitectura-empresa-plan.md › R6).
 *
 * Quién entra, para no mezclar clientes (invariante 1):
 *   - un contacto de HubSpot asociado a la empresa, siempre;
 *   - una persona de un cuestionario de un proyecto de la empresa, siempre;
 *   - un participante de una reunión de la empresa (por el chokepoint de sesiones), solo si su correo es del dominio de
 *     la empresa o ya es su contacto. Nunca alguien del equipo de Smarteam. Alguien de fuera del dominio de la empresa
 *     que también aparece en reuniones de OTROS clientes (HubSpot, una agencia, un integrador) se queda fuera. Los del
 *     dominio de la empresa entran aunque hayan ido a una reunión de otro cliente (un webinar, una empresa del mismo
 *     grupo): si no, una sola reunión ajena sacaba a toda la empresa (revisión del 25 oct).
 * El rol (decide, influye, usa) lo dice una persona del equipo: la copia nunca lo toca.
 */
import { DOMINIOS_GENERICOS } from "@/lib/exploraciones/agendadas";

export const ROLES_DE_PERSONA = ["decide", "influye", "usa"] as const;
export type RolDePersona = (typeof ROLES_DE_PERSONA)[number];
export const ETIQUETA_DEL_ROL: Record<RolDePersona, string> = { decide: "Decide", influye: "Influye", usa: "Usa" };

export type OrigenDePersona = "hubspot" | "reunion" | "cuestionario";

export interface ContactoParaUnir {
  id: string;
  email: string | null;
  nombre: string;
  cargo: string | null;
  vigente: boolean;
}

export interface PersonaDeCuestionario {
  email: string | null;
  nombre: string;
  cargo: string | null;
}

export interface ReunionParaUnir {
  fecha: Date;
  participantes: readonly string[];
}

export interface PersonaUnida {
  correo: string;
  nombre: string | null;
  cargo: string | null;
  contactoDeHubspotId: string | null;
  origenes: OrigenDePersona[];
  reuniones: number;
  ultimaReunionAt: Date | null;
  /** empresa = trabaja en el cliente; externa = su correo es de otro dominio (una agencia, un consultor). */
  lado: "empresa" | "externa";
}

const correoValido = (c: string | null | undefined): string | null => {
  const x = (c ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) ? x : null;
};
export const dominioDe = (correo: string) => correo.split("@")[1] ?? "";

/**
 * Qué mirar en las reuniones de OTROS clientes antes de unir: solo la gente de fuera del dominio de la empresa. Un dominio
 * genérico (gmail) va como correo y nunca como dominio: si no, un gmail que fue a otra reunión sacaba a todos los gmail.
 */
export function aMirarSiEsCompartido(participantes: readonly string[], dominiosDeLaEmpresa: readonly string[]): { dominios: string[]; correos: string[] } {
  const propios = new Set(dominiosDeLaEmpresa.map((d) => d.trim().toLowerCase()));
  const deFuera = [...new Set(participantes.map((p) => p.trim().toLowerCase()))].filter((c) => c.includes("@") && !propios.has(dominioDe(c)));
  return { dominios: [...new Set(deFuera.map(dominioDe))].filter((d) => d && !DOMINIOS_GENERICOS.has(d)), correos: deFuera };
}

export function unirPersonas(o: {
  contactos: readonly ContactoParaUnir[];
  cuestionarios: readonly PersonaDeCuestionario[];
  reuniones: readonly ReunionParaUnir[];
  /** Los dominios de la empresa (`emailDomains` y su sitio). */
  dominiosDeLaEmpresa: readonly string[];
  /** Los correos del equipo de Smarteam (el roster): ellos y sus dominios nunca son personas del cliente. */
  correosDelEquipo: readonly string[];
  /** Dominios y correos que también están en reuniones de otros clientes (lib/sessions/project-sources.ts). */
  compartidos: { dominios: ReadonlySet<string>; correos: ReadonlySet<string> };
}): PersonaUnida[] {
  const propios = new Set(o.dominiosDeLaEmpresa.map((d) => d.trim().toLowerCase()).filter((d) => d && !DOMINIOS_GENERICOS.has(d)));
  const equipo = new Set(o.correosDelEquipo.map((c) => c.toLowerCase()));
  const dominiosDelEquipo = new Set([...equipo].map(dominioDe).filter((d) => d && !DOMINIOS_GENERICOS.has(d)));
  const delEquipo = (c: string) => equipo.has(c) || dominiosDelEquipo.has(dominioDe(c));
  const lado = (c: string): PersonaUnida["lado"] => {
    const d = dominioDe(c);
    return propios.has(d) || DOMINIOS_GENERICOS.has(d) || propios.size === 0 ? "empresa" : "externa";
  };

  const porCorreo = new Map<string, PersonaUnida>();
  const tomar = (correo: string): PersonaUnida => {
    let p = porCorreo.get(correo);
    if (!p) {
      p = { correo, nombre: null, cargo: null, contactoDeHubspotId: null, origenes: [], reuniones: 0, ultimaReunionAt: null, lado: lado(correo) };
      porCorreo.set(correo, p);
    }
    return p;
  };
  const sumarOrigen = (p: PersonaUnida, x: OrigenDePersona) => {
    if (!p.origenes.includes(x)) p.origenes.push(x);
  };

  for (const c of o.contactos) {
    const correo = correoValido(c.email);
    if (!correo || !c.vigente || delEquipo(correo)) continue;
    const p = tomar(correo);
    p.contactoDeHubspotId ??= c.id;
    p.nombre ??= c.nombre.trim() || null;
    p.cargo ??= c.cargo?.trim() || null;
    sumarOrigen(p, "hubspot");
  }
  for (const c of o.cuestionarios) {
    const correo = correoValido(c.email);
    if (!correo || delEquipo(correo)) continue;
    const p = tomar(correo);
    p.nombre ??= c.nombre.trim() || null;
    p.cargo ??= c.cargo?.trim() || null;
    sumarOrigen(p, "cuestionario");
  }
  for (const r of o.reuniones) {
    for (const crudo of new Set(r.participantes.map((x) => x.trim().toLowerCase()))) {
      const correo = correoValido(crudo);
      if (!correo || delEquipo(correo)) continue;
      const delDominio = propios.has(dominioDe(correo));
      if (!delDominio && (o.compartidos.correos.has(correo) || o.compartidos.dominios.has(dominioDe(correo)))) continue;
      if (!delDominio && !porCorreo.has(correo)) continue;
      const p = tomar(correo);
      p.reuniones++;
      if (!p.ultimaReunionAt || r.fecha > p.ultimaReunionAt) p.ultimaReunionAt = r.fecha;
      sumarOrigen(p, "reunion");
    }
  }
  return [...porCorreo.values()].sort((a, b) => b.reuniones - a.reuniones || a.correo.localeCompare(b.correo));
}

/** Lo que cambió de una persona que ya estaba (sin el rol, que es de una persona del equipo). null = nada. */
export function cambiosDePersona(
  antes: { nombre: string | null; cargo: string | null; contactoDeHubspotId: string | null; origenes: readonly string[]; reuniones: number; ultimaReunionAt: Date | null; lado: string; vigente: boolean },
  ahora: PersonaUnida,
): Partial<PersonaUnida & { vigente: boolean }> | null {
  const c: Partial<PersonaUnida & { vigente: boolean }> = {};
  // Un nombre o un cargo que se cargó no se borra porque una fuente dejó de decirlo.
  if (ahora.nombre && ahora.nombre !== antes.nombre) c.nombre = ahora.nombre;
  if (ahora.cargo && ahora.cargo !== antes.cargo) c.cargo = ahora.cargo;
  if (ahora.contactoDeHubspotId !== antes.contactoDeHubspotId) c.contactoDeHubspotId = ahora.contactoDeHubspotId;
  if ([...ahora.origenes].sort().join(",") !== [...antes.origenes].sort().join(",")) c.origenes = ahora.origenes;
  if (ahora.reuniones !== antes.reuniones) c.reuniones = ahora.reuniones;
  if ((ahora.ultimaReunionAt?.getTime() ?? null) !== (antes.ultimaReunionAt?.getTime() ?? null)) c.ultimaReunionAt = ahora.ultimaReunionAt;
  if (ahora.lado !== antes.lado) c.lado = ahora.lado;
  if (!antes.vigente) c.vigente = true;
  return Object.keys(c).length ? c : null;
}
