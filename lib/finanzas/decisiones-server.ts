/**
 * lib/finanzas/decisiones-server.ts — las decisiones de dirección que se toman desde el punto de equilibrio (2026-10-05).
 * Server-only.
 *
 * Hoy hay una sola: si lo que pagan los aliados cuenta para cubrir el piso. Hasta esta fecha era la constante
 * `PARTNERSHIP_CUBRE_EL_PISO` de lib/finanzas/equilibrio.ts, esperando la respuesta de dirección. La constante sigue
 * siendo el valor POR DEFECTO —el que rige mientras nadie decidió— y DECISIONS la declara; la decisión tomada en la
 * página manda sobre ella y queda firmada (quién y cuándo).
 *
 * ⚠ Sin `import "server-only"`: lo importa lib/cobranza/queries.ts, que las pruebas cargan. Como queries.ts, es código de
 * servidor por lo que importa (Prisma), no por la marca.
 */
import { prisma } from "@/lib/db/prisma";

export const CLAVE_ALIADOS = "aliados-cubren-piso";

export interface DecisionAliados {
  cuentan: boolean;
  decididoPor: string;
  /** ISO. */
  decididoEn: string;
}

/**
 * La decisión tomada, o null si todavía no se decidió.
 * ⚠ Si la tabla no existe (el SQL de 2026-10-05 sin aplicar), no tumba el reporte: lee como «sin decidir» y lo dice
 * en el log. El chequeo de esquema del deploy es el que lo frena antes.
 */
export async function leerDecisionAliados(): Promise<DecisionAliados | null> {
  try {
    const d = await prisma.decisionFinanzas.findUnique({
      where: { clave: CLAVE_ALIADOS },
      select: { valor: true, decididoPor: true, decididoEn: true },
    });
    return d ? { cuentan: d.valor === "SI", decididoPor: d.decididoPor, decididoEn: d.decididoEn.toISOString() } : null;
  } catch {
    console.error("[equilibrio] no se pudo leer la decisión sobre los aliados (¿falta el SQL de 2026-10-05?): se toma «sin decidir»");
    return null;
  }
}

/** Guarda la decisión, con quién la tomó (sale del guard) y cuándo. Cambiarla después es volver a guardarla. */
export async function guardarDecisionAliados(cuentan: boolean, actor: string, nota: string | null): Promise<void> {
  const datos = { valor: cuentan ? "SI" : "NO", decididoPor: actor, decididoEn: new Date(), nota: nota?.trim() || null };
  await prisma.decisionFinanzas.upsert({
    where: { clave: CLAVE_ALIADOS },
    create: { clave: CLAVE_ALIADOS, ...datos },
    update: datos,
  });
}
