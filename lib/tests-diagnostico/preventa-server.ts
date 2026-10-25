/**
 * lib/tests-diagnostico/preventa-server.ts — EL TEST DEL DIAGNÓSTICO, EN LA PREVENTA (área O, O4, 2026-10-26). SERVIDOR.
 *
 * El resultado de un test hecho en Nexus entra directo a la preventa de su empresa, sin esperar a HubSpot: las
 * direcciones de los intentos TERMINADOS de esa empresa se suman a las que trae HubSpot, y la preventa las lee igual que
 * siempre (`testsDeLosEnlaces` se queda con el más reciente de cada área). Dos caminos:
 *   · los que se unieron a la empresa al empezar (por el dominio del correo);
 *   · los de un prospecto que hizo el test ANTES de que su empresa llegara a Nexus: sin empresa, con el correo de un
 *     dominio de la empresa que es solo suyo (con dos empresas, ninguna: no se adivina; un dominio genérico, nunca).
 * Sin el SQL o con un error, no suma nada: la preventa sigue con lo de HubSpot.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esDominioGenerico } from "@/lib/clients/personas-de-la-empresa";
import { intentosTerminadosDeLaEmpresa, intentosTerminadosSinEmpresaDeLosDominios } from "./repositorio-server";

/** Los dominios de la empresa que ninguna otra tiene registrados (los genéricos no cuentan). */
async function dominiosSoloDeLaEmpresa(clientId: string): Promise<string[]> {
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { emailDomains: true } });
  const propios = [...new Set((c?.emailDomains ?? []).map((d) => d.trim().toLowerCase()))].filter((d) => d && !esDominioGenerico(d));
  if (!propios.length) return [];
  const otras = await prisma.client.findMany({ where: { id: { not: clientId }, emailDomains: { hasSome: propios } }, select: { emailDomains: true } });
  const compartidos = new Set(otras.flatMap((o) => o.emailDomains.map((d) => d.trim().toLowerCase())));
  return propios.filter((d) => !compartidos.has(d));
}

/** Las direcciones de los tests terminados en Nexus por gente de esta empresa, con quién lo hizo. */
export async function enlacesDelTestEnNexus(clientId: string): Promise<{ contacto: string; url: string }[]> {
  const [unidos, sueltos] = await Promise.all([
    intentosTerminadosDeLaEmpresa(clientId).catch(() => []),
    dominiosSoloDeLaEmpresa(clientId)
      .then((d) => intentosTerminadosSinEmpresaDeLosDominios(d))
      .catch(() => []),
  ]);
  return [...unidos, ...sueltos].flatMap((i) => (i.url ? [{ contacto: i.nombre, url: i.url }] : []));
}
