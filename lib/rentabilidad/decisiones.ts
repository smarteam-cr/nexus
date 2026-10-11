/**
 * lib/rentabilidad/decisiones.ts — lo que dirección decidió sobre contratar (2026-10-07). SERVER-ONLY.
 *
 * Nexus PROPONE (lib/carga/contratacion.ts) y dirección confirma o descarta, con un motivo. Queda en `DecisionFinanzas`
 * con la clave `contratacion-AAAA-MM` (una por mes: decidir de nuevo el mismo mes reemplaza la anterior), firmada con
 * quién y cuándo. Sin tabla nueva. Nexus no contrata ni reasigna: la decisión es un registro para no volver a discutirla.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";

export const PREFIJO_DE_CONTRATACION = "contratacion-";

export type ValorDeContratacion = "CONFIRMADA" | "DESCARTADA";

export interface DecisionDeContratacion {
  clave: string;
  /** «2026-10». */
  mes: string;
  valor: ValorDeContratacion;
  /** Lo que proponía Nexus, en una frase. */
  propuesta: string;
  motivo: string | null;
  decididoPor: string;
  decididoEn: string;
}

export const claveDeContratacion = (hoyISO: string) => `${PREFIJO_DE_CONTRATACION}${hoyISO.slice(0, 7)}`;

/** Las decisiones tomadas, de la más nueva a la más vieja. Sin la tabla (el SQL sin correr), ninguna. */
export async function leerDecisionesDeContratacion(): Promise<DecisionDeContratacion[]> {
  try {
    const filas = await prisma.decisionFinanzas.findMany({
      where: { clave: { startsWith: PREFIJO_DE_CONTRATACION } },
      orderBy: { decididoEn: "desc" },
      take: 24,
    });
    return filas.map((f) => {
      let nota: { propuesta?: string; motivo?: string } = {};
      try {
        nota = f.nota ? (JSON.parse(f.nota) as typeof nota) : {};
      } catch {
        nota = { motivo: f.nota ?? undefined };
      }
      return {
        clave: f.clave,
        mes: f.clave.slice(PREFIJO_DE_CONTRATACION.length),
        valor: f.valor === "CONFIRMADA" ? "CONFIRMADA" : "DESCARTADA",
        propuesta: nota.propuesta ?? "",
        motivo: nota.motivo ?? null,
        decididoPor: f.decididoPor,
        decididoEn: f.decididoEn.toISOString(),
      };
    });
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    return [];
  }
}

export async function guardarDecisionDeContratacion(d: {
  valor: ValorDeContratacion;
  propuesta: string;
  motivo: string | null;
  actor: string;
  hoyISO: string;
}): Promise<void> {
  const clave = claveDeContratacion(d.hoyISO);
  const datos = {
    valor: d.valor,
    decididoPor: d.actor,
    decididoEn: new Date(),
    nota: JSON.stringify({ propuesta: d.propuesta, motivo: d.motivo?.trim() || undefined }),
  };
  await prisma.decisionFinanzas.upsert({ where: { clave }, create: { clave, ...datos }, update: datos });
}
