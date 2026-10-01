/**
 * lib/exploraciones/crear.ts — abrir la exploración de una empresa del HubSpot de Smarteam. SERVIDOR.
 *
 * Una VIVA por empresa: si ya hay una, se devuelve esa (abrir dos lienzos para la misma empresa
 * partiría la historia en dos). El cliente de Nexus sale de la puerta de Ventas
 * (`clienteDeLaEmpresaDeVentas`): si no existe, nace PROSPECTO; si existe, se reusa sin tocarle el
 * `kind`.
 *
 * La industria y el perfil NO se fijan solos: la edición que sugiere la industria de HubSpot y el
 * perfil habitual de esa edición entran como PROPUESTA, para que el vendedor los confirme. La
 * escala dice que la edición se decide al arrancar, y la industria de HubSpot a veces engaña (una
 * empresa de software para bancos no se mide como un banco).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { clienteDeLaEmpresaDeVentas } from "@/lib/clients/cliente-de-la-empresa-de-ventas";
import { prisma } from "@/lib/db/prisma";
import { contenidoVacio, idDelItem, type DestinoDePropuesta, type ItemPropuesto } from "./contenido";
import { leerEmpresa } from "./hubspot";
import { industriaLegible, sugerirEdicion } from "./industria";
import { escalaParaExplorar } from "./servidor";

export type ResultadoDelAlta =
  | { ok: true; id: string; existia: boolean }
  | { ok: false; status: number; error: string };

const esUnicoViolado = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

export async function crearExploracion(companyId: string, email: string): Promise<ResultadoDelAlta> {
  const empresa = await leerEmpresa(companyId);
  if (!empresa) return { ok: false, status: 502, error: "No se pudo leer la empresa en HubSpot. Prueba de nuevo en un rato." };

  const cliente = await clienteDeLaEmpresaDeVentas({
    companyId: empresa.id,
    companyName: empresa.nombre,
    domain: empresa.dominio ?? "",
    industry: empresa.industria,
    origen: "exploracion",
  });
  if (!cliente.ok) return { ok: false, status: 409, error: cliente.mensaje };

  const viva = await prisma.exploracionDeVenta.findFirst({
    where: { clientId: cliente.clientId, archivadaEn: null },
    select: { id: true },
  });
  if (viva) return { ok: true, id: viva.id, existia: true };

  const items: ItemPropuesto[] = [];
  const escala = await escalaParaExplorar();
  if (escala.estado === "ok") {
    const slug = sugerirEdicion(empresa.industria, escala.general.ediciones.map((e) => e.slug));
    const edicion = slug ? escala.general.ediciones.find((e) => e.slug === slug) : null;
    const fuente = { id: "H0", etiqueta: `Industria en HubSpot: ${industriaLegible(empresa.industria) ?? "sin dato"}` };
    const en = new Date().toISOString();
    const item = (destino: DestinoDePropuesta, valor: unknown, razon: string): ItemPropuesto => ({
      id: idDelItem(destino, valor),
      destino,
      valor,
      razon,
      fuentes: [fuente],
      corridaId: null,
      en,
    });
    if (edicion) {
      items.push(item({ tipo: "edicion" }, { slug: edicion.slug }, `La industria de la empresa apunta a la edición «${edicion.nombre}».`));
      if (edicion.perfilHabitual) {
        items.push(item({ tipo: "perfil" }, edicion.perfilHabitual, `Es el perfil habitual de «${edicion.nombre}»: confírmalo con el prospecto.`));
      }
    }
  }

  try {
    const creada = await prisma.exploracionDeVenta.create({
      data: {
        clientId: cliente.clientId,
        creadaPor: email,
        responsableEmail: email,
        contenido: contenidoVacio() as unknown as Prisma.InputJsonValue,
        propuesta: { version: 1, items } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { ok: true, id: creada.id, existia: false };
  } catch (e) {
    // Dos altas a la vez para la misma empresa: el índice único parcial deja pasar una sola.
    if (esUnicoViolado(e)) {
      const otra = await prisma.exploracionDeVenta.findFirst({
        where: { clientId: cliente.clientId, archivadaEn: null },
        select: { id: true },
      });
      if (otra) return { ok: true, id: otra.id, existia: true };
    }
    throw e;
  }
}
