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
  for (const c of clientes) {
    const duena = c.comparteDominioConId;
    if (!duena || duena === c.id) continue;
    grupoDe.set(c.id, duena);
    grupoDe.set(duena, duena);
    if (viveEnElDominioDeLaPrincipal(c)) {
      for (const mapa of [porDominio, porCorreo]) {
        for (const [k, ids] of mapa) if (ids.includes(duena) && !ids.includes(c.id)) mapa.set(k, [...ids, c.id]);
      }
      continue;
    }
    /* Con dominio propio: el contacto de la principal con correo de ese dominio es de la unidad. */
    const propios = new Set(effectiveDomainsForClient(c));
    for (const [correo, ids] of porCorreo) {
      if (!ids.includes(duena) || !propios.has(correo.split("@")[1] ?? "")) continue;
      porCorreo.set(correo, [...new Set(ids.map((id) => (id === duena ? c.id : id)))]);
    }
  }
  return { porDominio, porCorreo, grupoDe };
}
