/**
 * lib/clients/cliente-de-la-empresa-de-ventas.ts — el cliente de Nexus para una empresa del HubSpot
 * de Smarteam, creándolo como PROSPECTO si no existe. SERVIDOR.
 *
 * Es la puerta de VENTAS: la usan las dos altas que empiezan por una empresa que puede no ser
 * cliente todavía —la propuesta (`/api/business-cases/create-from-company`) y la exploración de
 * venta (`lib/exploraciones/crear.ts`)—. Antes vivía escrita dentro de la ruta de la propuesta; con
 * dos usos, una copia habría empezado a divergir justo en lo delicado:
 *
 *   - Se resuelve con `resolverClienteDeLaEmpresa`, nunca con un `findFirst` por el id de la
 *     empresa: el buscador entrega la ficha VIVA, y un cliente guardado bajo una empresa fusionada
 *     no aparecería, y nacería un segundo cliente para la misma cuenta.
 *   - Si la empresa se fusionó, se re-apunta (`reapuntarEnTx`) y se deja anotado.
 *   - ⚠ Reusar NO cambia el `kind`: degradar un CLIENTE a PROSPECTO por abrirle una propuesta o una
 *     exploración lo sacaría de la cartera de CS y de cobranza.
 *   - Un cliente NUEVO puede matchear reuniones que ya están: se dispara la atribución
 *     (`resolveAllSessions`). El censo de puertas vive en lib/sessions/puertas-que-crean-cliente.test.ts.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { anotarReapunte, reapuntarEnTx, resolverClienteDeLaEmpresa } from "@/lib/hubspot/cliente-de-la-empresa";

export interface EmpresaDeVentas {
  /** Id de la empresa en el HubSpot de Smarteam. */
  companyId: string;
  companyName: string;
  /** Dominio, en minúsculas; vacío si no tiene. */
  domain: string;
  /** La industria de HubSpot, si se sabe: un prospecto nuevo nace con ella. */
  industry?: string | null;
  /** Quién hace el alta, para el log. */
  origen: string;
}

export type ClienteDeLaEmpresa =
  | { ok: true; clientId: string; creado: boolean }
  /** Dos clientes para la misma cuenta: hay que decidir a mano cuál es (409). */
  | { ok: false; ambiguo: true; mensaje: string };

export async function clienteDeLaEmpresaDeVentas(empresa: EmpresaDeVentas): Promise<ClienteDeLaEmpresa> {
  const resolucion = await resolverClienteDeLaEmpresa(await getSystemHubspotClient(), empresa.companyId);
  if (resolucion.estado === "ambiguo") return { ok: false, ambiguo: true, mensaje: resolucion.mensaje };

  if (resolucion.estado === "ninguno") {
    const clientId = (
      await prisma.client.create({
        data: {
          name: empresa.companyName,
          company: empresa.companyName,
          hubspotCompanyId: empresa.companyId,
          emailDomains: empresa.domain ? [empresa.domain] : [],
          industry: empresa.industry || null,
          kind: "PROSPECTO",
        },
        select: { id: true },
      })
    ).id;
    /* `void` a propósito: nada de acá depende del orden, y la pasada recorre todas las sesiones. */
    void import("@/lib/sessions/resolve-client")
      .then((m) => m.resolveAllSessions())
      .catch((e) => console.error(`[${empresa.origen}] la atribución del cliente nuevo falló`, e));
    return { ok: true, clientId, creado: true };
  }

  if (resolucion.estado === "encontrado-fusionado") {
    const { businessCases } = await prisma.$transaction((tx) => reapuntarEnTx(tx, resolucion.reapunte));
    console.warn(anotarReapunte(resolucion.reapunte, resolucion.nombre, businessCases));
  }
  return { ok: true, clientId: resolucion.clientId, creado: false };
}
