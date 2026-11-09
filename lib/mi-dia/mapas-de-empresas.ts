/**
 * lib/mi-dia/mapas-de-empresas.ts — los mapas con que «Mi día» reconoce la empresa de un invitado. PURO (lo arma
 * lib/mi-dia/empresas-server.ts con lo que lee de la base; separado el 8 nov para poder probar las unidades).
 *
 * `porDominio`: el dominio de correo → las fichas que viven en él. `porCorreo`: el correo de un contacto de HubSpot → su
 * ficha. `grupoDe`: cada ficha de una empresa con unidades → la principal.
 *
 * Las unidades siguen la regla del resolver (lib/sessions/categorize.ts, `viveEnElDominioDeLaPrincipal`):
 *  · una unidad SIN dominio propio (el TEC · AE) vive en el de la principal: un invitado de ese dominio, o un contacto
 *    de la principal, es de las dos, y la reunión no cuenta para ninguna hasta que el título diga cuál;
 *  · una unidad CON dominio propio (Cemaco · Ecuador: sukasa.com, comohogar.com) vive en el suyo, y el de la principal no
 *    la incluye. Un contacto que HubSpot guarda en la empresa de la principal pero cuyo correo es del dominio propio de
 *    la unidad (ana@sukasa.com en la empresa de Cemaco) es de la unidad: así lo decide el resolver, por el dominio.
 */
import { effectiveDomainsForClient, viveEnElDominioDeLaPrincipal } from "@/lib/sessions/categorize";

export interface FichaParaMapas {
  id: string;
  name: string;
  company: string | null;
  emailDomains: string[];
  comparteDominioConId: string | null;
}

export interface MapasDeLaGente {
  porDominio: Map<string, string[]>;
  porCorreo: Map<string, string[]>;
  grupoDe: Map<string, string>;
}

const sumar = (mapa: Map<string, string[]>, k: string, id: string) => mapa.set(k, [...new Set([...(mapa.get(k) ?? []), id])]);

export function armarMapasDeLaGente(
  clientes: readonly FichaParaMapas[],
  contactos: readonly { email: string | null; clientId: string }[],
): MapasDeLaGente {
  const porDominio = new Map<string, string[]>();
  for (const c of clientes) {
    for (const d of c.emailDomains) {
      const k = d.trim().toLowerCase();
      if (k) sumar(porDominio, k, c.id);
    }
  }
  const porCorreo = new Map<string, string[]>();
  for (const c of contactos) {
    if (!c.email) continue;
    sumar(porCorreo, c.email.trim().toLowerCase(), c.clientId);
  }
  const grupoDe = new Map<string, string>();
  const grupos = new Map<string, FichaParaMapas[]>();
  const porId = new Map(clientes.map((c) => [c.id, c]));
  for (const c of clientes) {
    const duena = c.comparteDominioConId;
    if (!duena || duena === c.id) continue;
    grupoDe.set(c.id, duena);
    grupoDe.set(duena, duena);
    const principal = porId.get(duena);
    if (!grupos.has(duena)) grupos.set(duena, principal ? [principal] : []);
    grupos.get(duena)!.push(c);
  }
  /* Primero, el dominio del correo manda dentro de la empresa, en los dos sentidos (revisión del 8 nov): el contacto que
     HubSpot guarda en una ficha del grupo es de la ficha dueña de su dominio, si es una sola. Así «Mi día» dice lo
     mismo que el resolver, y el orden en que llegan las fichas no cambia nada. */
  for (const grupo of grupos.values()) {
    const ids = new Set(grupo.map((c) => c.id));
    const duenaDe = new Map<string, string[]>();
    for (const c of grupo) for (const d of effectiveDomainsForClient(c)) duenaDe.set(d, [...(duenaDe.get(d) ?? []), c.id]);
    for (const [correo, de] of porCorreo) {
      if (!de.some((id) => ids.has(id))) continue;
      const duenas = duenaDe.get(correo.split("@")[1] ?? "");
      if (duenas?.length !== 1) continue;
      porCorreo.set(correo, [...new Set(de.map((id) => (ids.has(id) ? duenas[0]! : id)))]);
    }
  }
  /* Después, la unidad sin dominio propio (el TEC · AE) se suma a todo lo de la principal: su gente es de las dos. */
  for (const c of clientes) {
    const duena = c.comparteDominioConId;
    if (!duena || duena === c.id || !viveEnElDominioDeLaPrincipal(c)) continue;
    for (const mapa of [porDominio, porCorreo]) {
      for (const [k, de] of mapa) if (de.includes(duena) && !de.includes(c.id)) mapa.set(k, [...de, c.id]);
    }
  }
  return { porDominio, porCorreo, grupoDe };
}
