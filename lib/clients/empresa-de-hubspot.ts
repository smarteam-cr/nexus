/**
 * lib/clients/empresa-de-hubspot.ts — una empresa de HubSpot es UNA sola ficha de Nexus (R7b, 2026-10-24). SERVIDOR.
 *
 * `Client.hubspotCompanyId` es único desde `scripts/sql/2026-10-25-datos-de-la-empresa.sql`. Antes nada lo impedía, y
 * siete caminos podían repetirlo (la copia de Partner, el import del sistema, elegir la empresa a mano, la copia de
 * proyectos por nombre, la ficha de HubSpot, el alta por OAuth y la conexión de un portal): dos fichas para la misma
 * empresa parten sus reuniones, sus proyectos y su cobranza en dos (Areyas y Areyá, fusionadas el 24 oct). Con el índice,
 * esos caminos darían un 500; por eso cada uno pasa por acá: busca primero la ficha que ya tiene el id y la reusa, o
 * dice cuál es para responder 409. Y si dos pedidos llegan a la vez, el segundo choca con el índice (P2002) y se
 * resuelve releyendo, nunca adivinando qué índice chocó (lib/db/unico-violado.ts).
 *
 * ⚠ Dentro de una transacción interactiva un P2002 la deja abortada: no se puede releer adentro. Por eso
 * `crearOReusarFicha` y `asignarEmpresaDeHubspot` reciben el cliente de base y releen con `prisma`, afuera.
 *
 * Sin `server-only` a propósito: lo usan también la copia de proyectos y la de Partner, que corren en scripts. El 409
 * para una persona (que depende de a qué fichas tiene acceso) vive aparte, en `empresa-de-hubspot-aviso.ts`.
 *
 * Decisión: DECISIONS › «Las llaves de la empresa» (punto 3, R7b).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esUnicoViolado } from "@/lib/db/unico-violado";

export interface FichaDeLaEmpresa {
  id: string;
  name: string;
  kind: string;
}

type Lector = Pick<Prisma.TransactionClient, "client">;

/** La ficha que ya tiene esta empresa de HubSpot, o null. */
export async function fichaConLaEmpresa(companyId: string, db: Lector = prisma): Promise<FichaDeLaEmpresa | null> {
  return db.client.findUnique({ where: { hubspotCompanyId: companyId }, select: { id: true, name: true, kind: true } });
}

/** Lo que se le dice a quien intentó ponerle a una ficha una empresa que ya es de otra. */
export function mensajeDeEmpresaRepetida(ficha: Pick<FichaDeLaEmpresa, "name">): string {
  return `Esa empresa de HubSpot ya es la ficha «${ficha.name}» en Nexus. Ábrela a ella, o fusiona las dos fichas.`;
}

export type ResultadoDeAsignar = { ok: true } | { ok: false; ficha: FichaDeLaEmpresa };

/**
 * Le pone (o le quita, con null) la empresa de HubSpot a una ficha. Si otra ficha ya la tiene, no escribe nada y dice
 * cuál es.
 */
export async function asignarEmpresaDeHubspot(clientId: string, companyId: string | null): Promise<ResultadoDeAsignar> {
  if (companyId) {
    const otra = await fichaConLaEmpresa(companyId);
    if (otra && otra.id !== clientId) return { ok: false, ficha: otra };
  }
  try {
    await prisma.client.update({ where: { id: clientId }, data: { hubspotCompanyId: companyId } });
    return { ok: true };
  } catch (e) {
    if (!companyId || !esUnicoViolado(e)) throw e;
    const otra = await fichaConLaEmpresa(companyId);
    if (otra && otra.id !== clientId) return { ok: false, ficha: otra };
    throw e;
  }
}

/**
 * La ficha de esta empresa: la que ya existe, o la que crea `crear`. Si otro pedido la creó entre la lectura y el
 * `create`, el índice frena el segundo y se devuelve la que ganó (`creado: false`).
 */
export async function crearOReusarFicha(
  companyId: string,
  crear: () => Promise<{ id: string }>,
): Promise<{ clientId: string; creado: true } | { clientId: string; creado: false; ficha: FichaDeLaEmpresa }> {
  const ya = await fichaConLaEmpresa(companyId);
  if (ya) return { clientId: ya.id, creado: false, ficha: ya };
  try {
    return { clientId: (await crear()).id, creado: true };
  } catch (e) {
    if (!esUnicoViolado(e)) throw e;
    const gano = await fichaConLaEmpresa(companyId);
    if (gano) return { clientId: gano.id, creado: false, ficha: gano };
    throw e;
  }
}

/** Después de un P2002 de una transacción que creaba o movía una ficha: ¿fue por esta empresa? Devuelve quién la tiene. */
export async function quienTieneLaEmpresaTrasChocar(e: unknown, companyId: string | null | undefined): Promise<FichaDeLaEmpresa | null> {
  if (!companyId || !esUnicoViolado(e)) return null;
  return fichaConLaEmpresa(companyId);
}
