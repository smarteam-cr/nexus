/**
 * lib/exploraciones/crear.ts — abrir la exploración de una empresa del HubSpot de Smarteam. SERVIDOR.
 *
 * Una VIVA por empresa: si ya hay una, se devuelve esa (abrir dos lienzos para la misma empresa
 * partiría la historia en dos). El cliente de Nexus sale de la puerta de Ventas
 * (`clienteDeLaEmpresaDeVentas`): si no existe, nace PROSPECTO; si existe, se reusa sin tocarle el
 * `kind`.
 *
 * La industria y el perfil se eligen SOLOS (pedido de Elías, 2026-10-01): si la industria de HubSpot
 * apunta a una edición, la exploración nace con esa edición y su perfil habitual, como lo dice la
 * escala. Si no apunta a ninguna, nace con la escala general y la preparación —que lee todo lo que
 * hay de la empresa— la elige (lib/exploraciones/agente.ts). En los dos casos se ve quién la eligió
 * y por qué, y el vendedor la cambia con un clic: desde ahí, nadie más la toca.
 *
 * Una UNIDAD de una empresa (DECISIONS «Una empresa con varias unidades», 9 nov) se abre SIEMPRE por su
 * ficha (`crearExploracionDeLaUnidad`), nunca por una empresa de HubSpot: esa puerta resuelve a quien
 * tenga la empresa viva y abriría la preventa de la principal. Lo que llega por la empresa de HubSpot es
 * de la principal; la preventa de una unidad sin empresa propia no lo lee (todo lo que lee HubSpot sale
 * de `client.hubspotCompanyId` de la ficha de la preventa, que en esa unidad es null).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { clienteDeLaEmpresaDeVentas } from "@/lib/clients/cliente-de-la-empresa-de-ventas";
import { prisma } from "@/lib/db/prisma";
import { esUnicoViolado } from "@/lib/db/unico-violado";
import { contenidoVacio, propuestaVacia, type ContenidoDeExploracion } from "./contenido";
import { leerEmpresa } from "./hubspot";
import { industriaLegible, sugerirEdicion } from "./industria";
import { escalaParaExplorar } from "./servidor";
import { DE_LA_PREVENTA } from "./marco";

export type ResultadoDelAlta =
  | { ok: true; id: string; existia: boolean }
  | { ok: false; status: number; error: string };

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

  return abrirEnLaFicha({ clientId: cliente.clientId, industria: empresa.industria, deDonde: "de la empresa en HubSpot", email });
}

/**
 * Por dónde se abre una opción de «Planificar con una empresa»: una unidad (`clientId`) por su ficha, todo lo demás
 * por su empresa de HubSpot. Es la bifurcación que separa Ecuador de Costa Rica: tiene su prueba (crear-unidad.test.ts).
 */
export function abrirPreventaDeLaOpcion(o: { companyId?: string; clientId?: string }, email: string): Promise<ResultadoDelAlta> {
  if (o.clientId) return crearExploracionDeLaUnidad(o.clientId, email);
  if (o.companyId) return crearExploracion(o.companyId, email);
  return Promise.resolve({ ok: false, status: 400, error: "Elige una empresa o una unidad." });
}

/**
 * La preventa de una unidad, por su ficha, tenga o no empresa propia en HubSpot (si la suya se fusionara con la de la
 * principal, la puerta de la empresa abriría la de la principal). Solo una unidad (`comparteDominioConId`): cualquier
 * otra ficha entra por su empresa de HubSpot, que resuelve fusiones y crea el prospecto.
 */
export async function crearExploracionDeLaUnidad(clientId: string, email: string): Promise<ResultadoDelAlta> {
  const ficha = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, industry: true, comparteDominioConId: true },
  });
  if (!ficha) return { ok: false, status: 404, error: "Esa ficha no existe." };
  if (!ficha.comparteDominioConId) {
    return { ok: false, status: 400, error: "Esa ficha no es la unidad de una empresa: elígela por su empresa de HubSpot." };
  }
  return abrirEnLaFicha({ clientId: ficha.id, industria: ficha.industry, deDonde: "de la ficha", email });
}

/** Abre la preventa viva de la ficha o la crea. `industria` es la de ESA ficha; `deDonde`, para el porqué de la edición. */
async function abrirEnLaFicha(o: { clientId: string; industria: string | null; deDonde: string; email: string }): Promise<ResultadoDelAlta> {
  const { clientId, email } = o;
  const viva = await prisma.exploracionDeVenta.findFirst({
    where: { clientId, archivadaEn: null, ...DE_LA_PREVENTA },
    select: { id: true },
  });
  if (viva) return { ok: true, id: viva.id, existia: true };

  // La edición que apunta la industria, con su perfil habitual. Si no apunta a ninguna, la elige la preparación.
  const contenido: ContenidoDeExploracion = contenidoVacio();
  let edicion: { slug: string; perfil: { cierre: string; despues: string } | null } | null = null;
  const escala = await escalaParaExplorar();
  if (escala.estado === "ok") {
    const slug = sugerirEdicion(o.industria, escala.general.ediciones.map((e) => e.slug));
    const ed = slug ? escala.general.ediciones.find((e) => e.slug === slug) : null;
    if (ed) {
      edicion = { slug: ed.slug, perfil: ed.perfilHabitual };
      const razon = `La industria ${o.deDonde} es «${industriaLegible(o.industria)}».`;
      contenido.edicionElegida = {
        por: "industria",
        razon,
        sugerida: { edicion: ed.slug, cierre: ed.perfilHabitual?.cierre ?? null, despues: ed.perfilHabitual?.despues ?? null, por: "industria", razon },
      };
    }
  }

  try {
    const creada = await prisma.exploracionDeVenta.create({
      data: {
        clientId,
        creadaPor: email,
        responsableEmail: email,
        edicion: edicion?.slug ?? null,
        perfilCierre: edicion?.perfil?.cierre ?? null,
        perfilDespues: edicion?.perfil?.despues ?? null,
        contenido: contenido as unknown as Prisma.InputJsonValue,
        propuesta: propuestaVacia() as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { ok: true, id: creada.id, existia: false };
  } catch (e) {
    // Dos altas a la vez para la misma empresa: el índice único parcial deja pasar una sola.
    if (esUnicoViolado(e)) {
      const otra = await prisma.exploracionDeVenta.findFirst({
        where: { clientId, archivadaEn: null, ...DE_LA_PREVENTA },
        select: { id: true },
      });
      if (otra) return { ok: true, id: otra.id, existia: true };
    }
    throw e;
  }
}
