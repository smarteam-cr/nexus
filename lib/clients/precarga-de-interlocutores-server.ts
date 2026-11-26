/**
 * lib/clients/precarga-de-interlocutores-server.ts — lo que escribe el --apply de la precarga desde un mapa
 * (scripts/interlocutores-precargar.ts): el cambio de las fichas y las personas, sin dejar nada a medias (revisión del
 * 26 nov). Las personas van SOLO por `guardarInterlocutor` (el único escritor).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { CambioDeInterlocutor } from "./interlocutores";
import { fotoDeLaPersona, guardarInterlocutor, restaurarPersona } from "./personas-de-la-empresa-server";
import { ajustarConLosCambios, fichasQueCambian, type CambiosDeFichas } from "./precarga-de-interlocutores";

/** Escribir falló y lo escrito se devolvió como estaba: no se movió ninguna reunión. */
export class PrecargaNoEscrita extends Error {}

/**
 * Escribe el cambio de las fichas (una transacción) y después cada persona. Si algo falla, devuelve las fichas y las
 * personas EXACTAMENTE como estaban (las fichas que el cambio toca y la foto de cada persona en `tocables`) y lanza
 * `PrecargaNoEscrita`; si tampoco puede devolverlas, lanza un Error que lo dice (queda el respaldo JSON del script).
 * ⚠ Un corte del proceso (Ctrl+C, la red) no corre esta vuelta atrás: para eso está el respaldo.
 */
export async function escribirFichasYPersonas(o: {
  cambios: CambiosDeFichas;
  personas: readonly CambioDeInterlocutor[];
  tocables: readonly string[];
  porEmail: string;
}): Promise<{ fichas: number; personas: number }> {
  const ajustar = ajustarConLosCambios(o.cambios);
  const hayCambios = o.cambios.siglas.length > 0 || o.cambios.dominios.length > 0;
  const antes = hayCambios ? fichasQueCambian(await prisma.client.findMany({ select: { id: true, siglas: true, emailDomains: true } }), ajustar) : [];
  const fotos = new Map<string, Awaited<ReturnType<typeof fotoDeLaPersona>>>();
  for (const p of o.personas) fotos.set(p.correo, await fotoDeLaPersona(p.correo, o.tocables));
  let fichas = 0;
  let personas = 0;
  try {
    if (hayCambios) {
      await prisma.$transaction(async (tx) => {
        const actuales = await tx.client.findMany({ select: { id: true, siglas: true, emailDomains: true } });
        for (const c of fichasQueCambian(actuales, ajustar)) {
          const d = ajustar([c])[0]!;
          await tx.client.update({ where: { id: c.id }, data: { siglas: d.siglas, emailDomains: d.emailDomains } });
          fichas++;
        }
      });
    }
    for (const cambio of o.personas) {
      await guardarInterlocutor({ tocables: o.tocables, cambio, porEmail: o.porEmail });
      personas++;
    }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    try {
      for (const p of o.personas) await restaurarPersona(fotos.get(p.correo)!, p.correo, o.tocables);
      if (antes.length) {
        await prisma.$transaction(antes.map((f) => prisma.client.update({ where: { id: f.id }, data: { siglas: f.siglas, emailDomains: f.emailDomains } })));
      }
    } catch (e2) {
      throw new Error(`No se pudo escribir (${motivo}) ni devolver lo escrito (${e2 instanceof Error ? e2.message : e2}).`);
    }
    throw new PrecargaNoEscrita(`No se pudo escribir: ${motivo}. Se devolvió lo escrito (las fichas y las personas quedan como estaban).`);
  }
  return { fichas, personas };
}
