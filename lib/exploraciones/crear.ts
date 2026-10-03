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
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { clienteDeLaEmpresaDeVentas } from "@/lib/clients/cliente-de-la-empresa-de-ventas";
import { prisma } from "@/lib/db/prisma";
import { contenidoVacio, propuestaVacia, type ContenidoDeExploracion } from "./contenido";
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

  // La edición que apunta la industria de HubSpot, con su perfil habitual. Si no apunta a ninguna, la elige la preparación.
  const contenido: ContenidoDeExploracion = contenidoVacio();
  let edicion: { slug: string; perfil: { cierre: string; despues: string } | null } | null = null;
  const escala = await escalaParaExplorar();
  if (escala.estado === "ok") {
    const slug = sugerirEdicion(empresa.industria, escala.general.ediciones.map((e) => e.slug));
    const ed = slug ? escala.general.ediciones.find((e) => e.slug === slug) : null;
    if (ed) {
      edicion = { slug: ed.slug, perfil: ed.perfilHabitual };
      const razon = `La industria de la empresa en HubSpot es «${industriaLegible(empresa.industria)}».`;
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
        clientId: cliente.clientId,
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
        where: { clientId: cliente.clientId, archivadaEn: null },
        select: { id: true },
      });
      if (otra) return { ok: true, id: otra.id, existia: true };
    }
    throw e;
  }
}
