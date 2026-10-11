/**
 * lib/hubspot/duenos.ts — los dueños (owners) del portal del sistema, con su correo. SERVIDOR.
 *
 * HubSpot nombra a las personas por su id de dueño (`hubspot_owner_id`) o por su id de usuario
 * (`hs_assignee_user_id` en una meta). Nexus las conoce por correo. Esto trae la tabla para
 * traducir, también los dueños archivados: una venta o una meta de alguien que ya se fue sigue
 * siendo suya.
 */
import type { Client } from "@hubspot/api-client";

export interface Dueno {
  ownerId: string;
  userId: string | null;
  email: string | null;
  nombre: string | null;
  archivado: boolean;
}

interface OwnerCrudo {
  id: string | number;
  userId?: number | string | null;
  userIdIncludingInactive?: number | string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/** Normaliza un dueño crudo de `/crm/v3/owners`. Puro. */
export function aDueno(o: OwnerCrudo, archivado: boolean): Dueno {
  const uid = o.userId ?? o.userIdIncludingInactive ?? null;
  const nombre = [o.firstName, o.lastName].filter((x) => x && x.trim()).join(" ").trim();
  return {
    ownerId: String(o.id),
    userId: uid == null ? null : String(uid),
    email: o.email ? o.email.trim().toLowerCase() : null,
    nombre: nombre || null,
    archivado,
  };
}

/** Todos los dueños del portal (activos y archivados), por id de dueño y por id de usuario. */
export async function leerDuenos(hs: Client): Promise<{ porOwner: Map<string, Dueno>; porUsuario: Map<string, Dueno> }> {
  const porOwner = new Map<string, Dueno>();
  for (const archivado of [false, true]) {
    let despues: string | undefined;
    do {
      const r = await hs.apiRequest({
        method: "GET",
        path: `/crm/v3/owners?limit=500&archived=${archivado}${despues ? `&after=${encodeURIComponent(despues)}` : ""}`,
      });
      const data = (await r.json()) as { results?: OwnerCrudo[]; paging?: { next?: { after?: string } } };
      for (const o of data.results ?? []) {
        const d = aDueno(o, archivado);
        // Un activo gana sobre su versión archivada.
        if (!porOwner.has(d.ownerId)) porOwner.set(d.ownerId, d);
      }
      despues = data.paging?.next?.after;
    } while (despues);
  }
  const porUsuario = new Map<string, Dueno>();
  for (const d of porOwner.values()) if (d.userId && !porUsuario.has(d.userId)) porUsuario.set(d.userId, d);
  return { porOwner, porUsuario };
}
