/**
 * lib/tareas/permisos-de-vinculo.ts — qué destinos de un vínculo puede abrir quien pide (una propuesta pide
 * `ventas.read`; una preventa, `preventa.read`). Lo usan las rutas de vínculos para escribir y para leer. SERVIDOR.
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { can } from "@/lib/auth/permissions/engine";
import type { PermisosDeVinculo } from "./tipos";

export async function permisosDeVinculo(tm: TeamMember): Promise<PermisosDeVinculo> {
  const [veVentas, vePreventa] = await Promise.all([can(tm, "ventas", "read"), can(tm, "preventa", "read")]);
  return { veVentas, vePreventa };
}
