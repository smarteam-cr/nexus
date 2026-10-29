/**
 * lib/smarteam/perfil-server.ts — guardar el perfil de la empresa que usa Nexus (R13, 2026-10-25). SERVIDOR. El único
 * escritor de `PerfilDeLaEmpresa`.
 *
 * Solo se guarda en la ficha que ES la empresa que usa Nexus (lib/smarteam/contexto.ts › empresaQueUsaNexus): el perfil
 * de un cliente sería otra cosa, y para eso están los datos de la empresa. Los clientes de referencia tienen que ser
 * clientes de la cartera (un prospecto no es referencia de nada).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { esLaEmpresaQueUsaNexus } from "./contexto";
import { sinReferenciasRepetidas, type PerfilEdicion } from "./perfil";
import type { Posicionamiento } from "./posicionamiento";

export class ErrorDelPerfil extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export async function guardarPerfil(clientId: string, p: PerfilEdicion, email: string): Promise<void> {
  if (!(await esLaEmpresaQueUsaNexus(clientId))) throw new ErrorDelPerfil("Esta ficha no es la de la empresa que usa Nexus.", 409);
  const referencias = sinReferenciasRepetidas(p.clientesDeReferencia);
  if (referencias.length) {
    const ids = [...new Set(referencias.map((r) => r.clientId))];
    const deLaCartera = await prisma.client.count({ where: { id: { in: ids }, ...CS_CLIENT_WHERE } });
    if (deLaCartera !== ids.length) throw new ErrorDelPerfil("Un cliente de referencia tiene que ser un cliente de la cartera.");
  }
  const datos = {
    propuestaDeValor: p.propuestaDeValor,
    tono: p.tono,
    servicios: p.servicios as Prisma.InputJsonValue,
    clientesDeReferencia: referencias as unknown as Prisma.InputJsonValue,
    actualizadoPorEmail: email.toLowerCase(),
  };
  await prisma.perfilDeLaEmpresa.upsert({ where: { clientId }, create: { clientId, ...datos }, update: datos });
}

/**
 * El position statement (K3, 2026-10-28): la frase y sus frentes. Lo edita Marketing › Audiencia; no toca lo demás del
 * perfil. Si la empresa todavía no tiene perfil, lo crea con solo esto.
 */
export async function guardarPosicionamiento(clientId: string, p: Posicionamiento, email: string): Promise<void> {
  if (!(await esLaEmpresaQueUsaNexus(clientId))) throw new ErrorDelPerfil("Esta ficha no es la de la empresa que usa Nexus.", 409);
  const datos = { positionStatement: p.frase, frentes: p.frentes as unknown as Prisma.InputJsonValue, actualizadoPorEmail: email.toLowerCase() };
  await prisma.perfilDeLaEmpresa.upsert({ where: { clientId }, create: { clientId, ...datos }, update: datos });
}
