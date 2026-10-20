/**
 * lib/cs/adopcion-del-cse-server.ts — ¿esta persona es CSE de la cuenta? (2026-10-07). SERVIDOR.
 *
 * El que abre la pestaña Adopción de Éxito del cliente sin ser la CSL ni dirección: quien lleva la cuenta, con la regla
 * única (lib/cuentas/encargado.ts): el encargado o quien lleva algún proyecto de CS ACTIVO de ella. Hasta el
 * 2026-10-19 también lo era quien llevó un proyecto ya cerrado. Lo que ve está en ./adopcion-del-cse.ts.
 */
import "server-only";
import { llevaLaCuentaDe } from "@/lib/cuentas/encargado-server";

export async function esCseDeLaCuenta(clientId: string, email: string | null | undefined): Promise<boolean> {
  return llevaLaCuentaDe(clientId, email);
}
