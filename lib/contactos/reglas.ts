/**
 * lib/contactos/reglas.ts — las reglas de la copia de contactos y tickets de HubSpot (etapa 6a de docs/mi-dia-plan.md).
 * PURO y client-safe.
 *
 *   · `planDeCopia`: qué filas se crean, se actualizan o se dan de baja. Una fila solo se da de baja si su cliente se
 *     leyó entero: «no se pudo leer» no es «ya no lo tiene».
 *   · `invitadosDeLaReunion`: quién estuvo en una reunión, con nombre y cargo, cruzando el correo de cada invitado con
 *     el equipo y con los contactos del cliente de la reunión (nunca con los de otro cliente).
 */

export interface FilaExistente {
  clientId: string;
  hubspotId: string;
  huella: string;
  vigente: boolean;
}

export interface FilaNueva {
  clientId: string;
  hubspotId: string;
  huella: string;
}

export interface PlanDeCopia {
  crear: FilaNueva[];
  actualizar: FilaNueva[];
  /** Las que se dan de baja: claves `clientId:hubspotId`. */
  bajas: { clientId: string; hubspotId: string }[];
  sinCambio: number;
}

const clave = (f: { clientId: string; hubspotId: string }) => `${f.clientId}:${f.hubspotId}`;

/**
 * `clientesLeidos`: los clientes cuyas empresas se leyeron enteras (asociaciones y registros). Solo ahí se da de baja
 * lo que ya no volvió. Una fila dada de baja que vuelve se reactiva (cuenta como actualizar).
 */
export function planDeCopia(
  existentes: readonly FilaExistente[],
  nuevas: readonly FilaNueva[],
  clientesLeidos: ReadonlySet<string>,
): PlanDeCopia {
  const porClave = new Map(existentes.map((e) => [clave(e), e]));
  const vistas = new Set<string>();
  const plan: PlanDeCopia = { crear: [], actualizar: [], bajas: [], sinCambio: 0 };
  for (const n of nuevas) {
    const k = clave(n);
    if (vistas.has(k)) continue;
    vistas.add(k);
    const e = porClave.get(k);
    if (!e) plan.crear.push(n);
    else if (!e.vigente || e.huella !== n.huella) plan.actualizar.push(n);
    else plan.sinCambio++;
  }
  for (const e of existentes) {
    if (!e.vigente || vistas.has(clave(e)) || !clientesLeidos.has(e.clientId)) continue;
    plan.bajas.push({ clientId: e.clientId, hubspotId: e.hubspotId });
  }
  return plan;
}

/** La huella de una fila: lo que, si cambia, hay que reescribir. */
export function huellaDe(campos: Record<string, string | number | boolean | Date | null | undefined>): string {
  return JSON.stringify(
    Object.keys(campos)
      .sort()
      .map((k) => {
        const v = campos[k];
        return [k, v instanceof Date ? v.toISOString() : (v ?? null)];
      }),
  );
}

/** ¿El ticket está abierto? Cerrado si tiene fecha de cierre o si HubSpot da su etapa por cerrada. */
export function ticketAbierto(cerrado: Date | null, etapaCerrada: boolean | null): boolean {
  return !cerrado && etapaCerrada !== true;
}

export type LadoDelInvitado = "smarteam" | "cliente" | "otro";

export interface Invitado {
  email: string;
  nombre: string | null;
  cargo: string | null;
  lado: LadoDelInvitado;
}

/**
 * Los invitados de una reunión, en el orden de la reunión: quien es del equipo, del lado de Smarteam; quien es un
 * contacto del cliente de la reunión, con su nombre y su cargo; el resto, solo el correo. Sin repetir.
 */
export function invitadosDeLaReunion(
  participantes: readonly string[],
  equipo: ReadonlyMap<string, string>,
  contactos: ReadonlyMap<string, { nombre: string; cargo: string | null }>,
): Invitado[] {
  const out: Invitado[] = [];
  const vistos = new Set<string>();
  for (const crudo of participantes) {
    const email = crudo.trim().toLowerCase();
    if (!email || vistos.has(email)) continue;
    vistos.add(email);
    const delEquipo = equipo.get(email);
    if (delEquipo) {
      out.push({ email, nombre: delEquipo, cargo: null, lado: "smarteam" });
      continue;
    }
    const c = contactos.get(email);
    out.push(c ? { email, nombre: c.nombre, cargo: c.cargo, lado: "cliente" } : { email, nombre: null, cargo: null, lado: "otro" });
  }
  return out;
}
