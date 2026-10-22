/**
 * lib/cobranza/libro/ordenar-server.ts — escribe lo que Nexus ordena solo, lo lista y lo deshace (2026-10-22).
 *
 * Las reglas son de ordenar.ts (PURO). Acá:
 *  · `ordenarLoSeguro` decide con la base de AHORA y escribe cada orden (una factura) en su propia transacción: bloquea
 *    sus cuotas, las relee y, si alguna cambió entre la lectura y la escritura, salta la orden entera. Cada cuota pasa
 *    por el chokepoint (`cambiarEstadoCobroTx`) con la firma del sistema de su fuente —la misma del cobro solo, que INV34
 *    acepta—, y el monto por `alinearMontoConFacturaTx`. Lo que había antes queda en `OrdenDelSistema`.
 *  · `deshacerOrden` devuelve las cuotas de una orden a su foto de antes (`deshacerOrdenDelSistemaTx`) y la marca
 *    deshecha: Nexus no la vuelve a ordenar.
 *  · `cargarLoOrdenado` es lo que muestra Conciliación › «Lo que no cuadra».
 *
 * Corre en el mismo turno que el cobro de lo pagado (servicio.ts › `correrElCobroDelDia`), antes de cobrar: cada hora y
 * con «Actualizar». Sin `server-only`, como aplicar.ts: lo corre también un script.
 */
import { randomUUID } from "node:crypto";
import type { CobranzaViaCobro, Prisma, ReglaDeOrden } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { FIRMA_DEL_SISTEMA } from "@/lib/cobranza/firma-del-sistema";
import {
  alinearMontoConFacturaTx,
  cambiarEstadoCobroTx,
  CobranzaError,
  deshacerOrdenDelSistemaTx,
  fotoDeLaCuota,
  type FotoDeLaCuota,
} from "@/lib/cobranza/mutations";
import { cargarEntradaDelLibro } from "./aplicar";
import type { Fuente } from "./hechos";
import { claveDeshecha, decidirOrden, type DecisionDeOrden, type Dudosa, type Orden } from "./ordenar";

/** Cuántos días se muestran en «Nexus ordenó solo». */
export const DIAS_A_LA_VISTA = 30;

export interface ResultadoDelOrden {
  aplicado: boolean;
  ordenes: Orden[];
  dudosas: Dudosa[];
  escritas: number;
  saltadas: Array<{ cuenta: string; numero: string; motivo: string }>;
}

const nombreDeFuente = (f: Fuente) => (f === "ODOO" ? "Odoo" : "Mercury");
const motivoDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Lo que Nexus ordenaría hoy, sin escribir: las órdenes y las dudosas. */
export async function decidirElOrdenDeHoy(hoy: string, fuentes?: readonly Fuente[]): Promise<DecisionDeOrden> {
  const [entrada, deshechas] = await Promise.all([
    cargarEntradaDelLibro(hoy),
    prisma.ordenDelSistema.findMany({ where: { deshechoEn: { not: null } }, select: { cobroId: true, numero: true } }),
  ]);
  const d = decidirOrden(entrada, new Set(deshechas.map((x) => claveDeshecha(x.cobroId, x.numero))));
  if (!fuentes) return d;
  return { ordenes: d.ordenes.filter((o) => fuentes.includes(o.fuente)), dudosas: d.dudosas };
}

/** Escribe UNA orden en su transacción. Devuelve null si escribió, o el porqué si la saltó. */
async function escribirUnaOrden(o: Orden): Promise<string | null> {
  const firma = FIRMA_DEL_SISTEMA[o.fuente];
  const grupo = randomUUID();
  return prisma.$transaction(async (tx) => {
    const ids = o.cuotas.map((c) => c.cobroId);
    await tx.$queryRaw`SELECT id FROM "Cobro" WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
    const filas = await tx.cobro.findMany({ where: { id: { in: ids } } });
    const porId = new Map(filas.map((f) => [f.id, f]));
    for (const q of o.cuotas) {
      const c = porId.get(q.cobroId);
      if (!c) return "una cuota ya no existe";
      if ((c.numeroFactura ?? null) !== q.numeroAntes || Math.round(Number(c.monto) * 100) !== Math.round(q.montoAntes * 100)) {
        return "alguien tocó una cuota entretanto";
      }
    }
    const fotos: Array<{ cobroId: string; antes: FotoDeLaCuota }> = o.cuotas.map((q) => ({ cobroId: q.cobroId, antes: fotoDeLaCuota(porId.get(q.cobroId)!) }));
    for (const q of o.cuotas) {
      await cambiarEstadoCobroTx(tx, q.cobroId, { numeroFactura: o.numero, ...(q.fechaEmision ? { fechaEmision: q.fechaEmision } : {}) }, firma);
      if (q.montoDespues !== undefined) {
        await alinearMontoConFacturaTx(tx, q.cobroId, { numero: o.numero, montoNeto: q.montoDespues }, firma, nombreDeFuente(o.fuente));
      }
    }
    const despues = new Map((await tx.cobro.findMany({ where: { id: { in: ids } } })).map((f) => [f.id, fotoDeLaCuota(f)]));
    for (const f of fotos) {
      await tx.ordenDelSistema.create({
        data: {
          cobroId: f.cobroId,
          cuentaId: o.cuentaId,
          grupo,
          regla: o.regla as ReglaDeOrden,
          fuente: o.fuente as CobranzaViaCobro,
          numero: o.numero,
          texto: o.texto,
          antes: f.antes as unknown as Prisma.InputJsonValue,
          despues: despues.get(f.cobroId)! as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.bitacoraCobro.create({
        data: {
          cuentaId: o.cuentaId,
          cobroId: f.cobroId,
          tipo: "NOTA",
          contenido: `Lo ordenó Nexus solo, con lo que dice ${nombreDeFuente(o.fuente)}: ${o.texto} No mueve plata. Se deshace en Conciliación › «Lo que no cuadra» › «Nexus ordenó solo».`,
          usuarioEmail: firma,
        },
      });
    }
    return null;
  });
}

/**
 * Ordena lo seguro de hoy. `fuentes` = las copias que corrieron bien hoy: lo de una copia atrasada no se ordena (sus
 * datos son de ayer). Sin `aplicar`, el simulacro.
 */
export async function ordenarLoSeguro(opts: { aplicar: boolean; hoy: string; fuentes?: readonly Fuente[] }): Promise<ResultadoDelOrden> {
  const d = await decidirElOrdenDeHoy(opts.hoy, opts.fuentes);
  const r: ResultadoDelOrden = { aplicado: opts.aplicar, ordenes: d.ordenes, dudosas: d.dudosas, escritas: 0, saltadas: [] };
  if (!opts.aplicar) return r;
  for (const o of d.ordenes) {
    try {
      const salto = await escribirUnaOrden(o);
      if (salto) r.saltadas.push({ cuenta: o.cuenta, numero: o.numero, motivo: salto });
      else r.escritas++;
    } catch (e) {
      r.saltadas.push({ cuenta: o.cuenta, numero: o.numero, motivo: motivoDe(e) });
    }
  }
  return r;
}

/* ── Lo que ve la pantalla ─────────────────────────────────────────────────────────────────────────────────── */

export interface OrdenALaVista {
  grupo: string;
  regla: ReglaDeOrden;
  fuente: Fuente;
  cuentaId: string;
  cuenta: string;
  numero: string;
  texto: string;
  cuotas: number;
  /** true = en alguna cuota cambió el monto (centavos). */
  conMonto: boolean;
  creadoEn: string;
}

export interface LoOrdenado {
  ordenes: OrdenALaVista[];
  dudosas: Dudosa[];
}

/** Lo ordenado en los últimos días que nadie deshizo, por factura, y las dudosas de hoy. */
export async function cargarLoOrdenado(hoy: string): Promise<LoOrdenado> {
  const desde = new Date(Date.now() - DIAS_A_LA_VISTA * 86_400_000);
  const [filas, d] = await Promise.all([
    prisma.ordenDelSistema.findMany({
      where: { deshechoEn: null, creadoEn: { gte: desde } },
      select: {
        grupo: true, regla: true, fuente: true, cuentaId: true, numero: true, texto: true, antes: true, despues: true, creadoEn: true,
        cuenta: { select: { client: { select: { name: true } } } },
      },
      orderBy: [{ creadoEn: "desc" }, { id: "asc" }],
    }),
    decidirElOrdenDeHoy(hoy),
  ]);
  const porGrupo = new Map<string, OrdenALaVista>();
  for (const f of filas) {
    const antes = f.antes as unknown as FotoDeLaCuota;
    const despues = f.despues as unknown as FotoDeLaCuota;
    const conMonto = Math.round(antes.monto * 100) !== Math.round(despues.monto * 100);
    const ya = porGrupo.get(f.grupo);
    if (ya) {
      ya.cuotas++;
      ya.conMonto ||= conMonto;
      continue;
    }
    porGrupo.set(f.grupo, {
      grupo: f.grupo,
      regla: f.regla,
      fuente: f.fuente === "MERCURY" ? "MERCURY" : "ODOO",
      cuentaId: f.cuentaId,
      cuenta: f.cuenta.client.name,
      numero: f.numero,
      texto: f.texto,
      cuotas: 1,
      conMonto,
      creadoEn: f.creadoEn.toISOString(),
    });
  }
  return { ordenes: [...porGrupo.values()], dudosas: d.dudosas };
}

/** Deshace una orden entera (todas sus cuotas) en una transacción. 409 si alguna cuota cambió desde entonces. */
export async function deshacerOrden(grupo: string, actor: string): Promise<{ cuotas: number }> {
  return prisma.$transaction(async (tx) => {
    const filas = await tx.ordenDelSistema.findMany({ where: { grupo, deshechoEn: null } });
    if (!filas.length) throw new CobranzaError("Eso ya se había deshecho, o no existe: recarga la lista.", 409);
    const ids = filas.map((f) => f.cobroId);
    await tx.$queryRaw`SELECT id FROM "Cobro" WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
    for (const f of filas) {
      await deshacerOrdenDelSistemaTx(
        tx,
        f.cobroId,
        { antes: f.antes as unknown as FotoDeLaCuota, despues: f.despues as unknown as FotoDeLaCuota },
        f.texto,
        actor,
      );
    }
    await tx.ordenDelSistema.updateMany({ where: { grupo, deshechoEn: null }, data: { deshechoEn: new Date(), deshechoPor: actor } });
    return { cuotas: filas.length };
  });
}
