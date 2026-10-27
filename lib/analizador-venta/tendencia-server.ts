/**
 * lib/analizador-venta/tendencia-server.ts — la tendencia de cada vendedor (S7, 2026-10-27). SERVIDOR. Solo lectura, sin IA.
 *
 * Las reuniones de venta del periodo, de todas las empresas, con quién habló y su análisis (reuniones-de-venta-server.ts
 * con `completo`), atribuidas por el calendario y por quién habló; la cuenta, en tendencia.ts. No arma contexto para
 * ningún agente: cuenta. Solo la ven los super admin (`veLaTendenciaDelEquipo`) en Ventas › Preventa › «Análisis de la venta».
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { reunionesDeVenta } from "./reuniones-de-venta-server";
import { tendenciaPorVendedor, type TendenciaDelVendedor } from "./tendencia";

export interface TendenciaDelEquipo {
  dias: number;
  vendedores: (TendenciaDelVendedor & { nombre: string })[];
  /** Las reuniones de venta del periodo, de todos. */
  reuniones: number;
}

export async function tendenciaDelEquipo(o: { dias: number; ahora?: Date }): Promise<TendenciaDelEquipo> {
  const [empresas, equipo] = await Promise.all([
    reunionesDeVenta({ dias: o.dias, ahora: o.ahora, completo: true }),
    prisma.teamMember.findMany({ select: { email: true, name: true } }),
  ]);
  const nombreDe = new Map(equipo.map((m) => [m.email.toLowerCase(), m.name]));
  const reuniones = empresas.flatMap((e) => e.reuniones);
  const vendedores = tendenciaPorVendedor(
    reuniones.map((r) => ({
      fecha: r.fecha,
      vendedores: r.correos ?? [],
      conTranscripcion: r.texto === "transcripcion",
      quienHablo: r.quienHablo ?? null,
      analisis: r.detalle ? { resultado: r.detalle.resultado, confirmado: !!r.detalle.confirmado } : null,
    })),
  ).map((v) => ({ ...v, nombre: nombreDe.get(v.correo) ?? v.correo }));
  return { dias: o.dias, vendedores, reuniones: reuniones.length };
}
