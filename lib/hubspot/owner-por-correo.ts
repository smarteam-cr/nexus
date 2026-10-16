/**
 * lib/hubspot/owner-por-correo.ts — el usuario de HubSpot (owner) de una persona de Nexus, por su correo. SERVIDOR.
 *
 * Lo usan los que escriben en HubSpot a nombre de alguien: el siguiente paso de cada equipo (su responsable) y las notas
 * de la cuenta (su autor). La tabla de dueños se guarda 10 minutos en memoria; los archivados no cuentan (no se le
 * asigna nada a quien ya no está).
 */
import "server-only";
import { getSystemHubspotClient } from "./client";
import { leerDuenos } from "./duenos";

let duenos: { at: number; porCorreo: Map<string, string> } | null = null;
const VIDA_DE_LOS_DUENOS_MS = 10 * 60 * 1000;

/** El owner de HubSpot de una persona, por su correo. null = no está en HubSpot (o HubSpot no respondió). */
export async function ownerIdPorCorreo(email: string | null): Promise<string | null> {
  if (!email) return null;
  if (!duenos || Date.now() - duenos.at > VIDA_DE_LOS_DUENOS_MS) {
    try {
      const { porOwner } = await leerDuenos(await getSystemHubspotClient());
      const porCorreo = new Map<string, string>();
      for (const d of porOwner.values()) if (d.email && !d.archivado && !porCorreo.has(d.email)) porCorreo.set(d.email, d.ownerId);
      duenos = { at: Date.now(), porCorreo };
    } catch {
      return null;
    }
  }
  return duenos.porCorreo.get(email.toLowerCase()) ?? null;
}
