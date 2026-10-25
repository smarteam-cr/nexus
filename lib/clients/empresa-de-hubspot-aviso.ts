/**
 * lib/clients/empresa-de-hubspot-aviso.ts — el 409 de «esa empresa de HubSpot ya es otra ficha», para una persona
 * (R7b, 2026-10-24). SERVIDOR.
 *
 * Aparte de lib/clients/empresa-de-hubspot.ts porque depende de la sesión (a qué fichas tiene acceso quien pregunta), y
 * ese módulo lo usan también scripts que no tienen sesión.
 */
import "server-only";
import { requireAccessToClient } from "@/lib/auth/access";
import { mensajeDeEmpresaRepetida, type FichaDeLaEmpresa } from "./empresa-de-hubspot";

/** Lo que se le dice a quien no tiene acceso a la otra ficha: ni su nombre ni su id. */
export const AVISO_SIN_ACCESO = "Esa empresa de HubSpot ya es otra ficha en Nexus, a la que no tienes acceso. Pídele a la CSL que la revise.";

/**
 * El cuerpo del 409: el mensaje y la ficha que ya la tiene, para que la pantalla pueda llevar a ella. Solo con el nombre
 * si quien pregunta tiene acceso a esa ficha: si no, un CSE podría probar ids de HubSpot y enterarse de qué empresas son
 * clientes de otro.
 */
export async function cuerpoDeEmpresaRepetida(ficha: FichaDeLaEmpresa) {
  const puedeVerla = await requireAccessToClient(ficha.id).then(
    () => true,
    () => false,
  );
  return puedeVerla ? { error: mensajeDeEmpresaRepetida(ficha), clientIdExistente: ficha.id, nombreExistente: ficha.name } : { error: AVISO_SIN_ACCESO };
}
