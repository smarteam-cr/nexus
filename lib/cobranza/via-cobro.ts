/**
 * lib/cobranza/via-cobro.ts
 *
 * El ÚNICO camino que cambia `CuentaFinanciera.viaCobro` de una cuenta que ya existe (2026-09-25). Lo usan
 * los tres que la cambian: la ficha de la cuenta (`updateCuenta`), «Cuadrar cronograma»
 * (`liberarYRegenerar`, los dos en mutations.ts) y el botón «Está en Mercury» de Cobranza › Odoo ›
 * Emparejar (`marcarViaDesdeEmparejado`, odoo/servicio.ts).
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────────
 * Elías decidió que «Está en Mercury» ES la vía de cobro de la cuenta: una sola verdad en todo Cobranza.
 * Con tres caminos escribiéndola cada uno a su manera, la ficha la pisaba sin firma en CADA guardado
 * (CuentaDrawer la manda siempre) y la marca perdía su autor sin que nadie la hubiera tocado.
 *
 * ⭐ Solo escribe si la vía cambia DE VERDAD: firma (`viaCobroPor/En`) y deja una línea en la bitácora de
 * la cuenta. Si ya decía eso, no toca nada: guardar la ficha por otra cosa no borra quién la marcó.
 *
 * ⚠ Módulo aparte y chico a propósito: odoo/servicio.ts lo necesita, y traer mutations.ts entero al módulo
 * de Odoo le metería el chokepoint de los cobros por la puerta de atrás (guardas.test.ts, INV25).
 * ⚠ Recibe la transacción: la vía y su firma se escriben junto con lo que la causó, o nada.
 */
import type { Prisma } from "@prisma/client";
import { NOMBRE_DE_PLATAFORMA, type PlataformaDeCobro } from "./sociedades";

export async function cambiarViaCobroTx(
  tx: Prisma.TransactionClient,
  input: {
    cuentaId: string;
    nueva: PlataformaDeCobro;
    /** El correo del guard: queda en `viaCobroPor` y en la bitácora. */
    actor: string;
    /** Cómo y por qué, en una frase que sigue a «Vía de cobro cambiada de X a Y por quien: ». */
    motivo: string;
  },
): Promise<{ anterior: PlataformaDeCobro; cambio: boolean }> {
  const cuenta = await tx.cuentaFinanciera.findUnique({ where: { id: input.cuentaId }, select: { viaCobro: true } });
  if (!cuenta) throw new Error("La cuenta no existe");
  const anterior = cuenta.viaCobro;
  if (anterior === input.nueva) return { anterior, cambio: false };
  await tx.cuentaFinanciera.update({
    where: { id: input.cuentaId },
    data: { viaCobro: input.nueva, viaCobroPor: input.actor, viaCobroEn: new Date() },
    select: { id: true },
  });
  /* ⚠ `ACTUALIZACION_IA` («Sistema» en la ficha), como la corrección que ya hacía «Cuadrar cronograma»:
     esas entradas no entran al contexto de los agentes, que es lo que corresponde a un dato de configuración. */
  await tx.bitacoraCobro.create({
    data: {
      cuentaId: input.cuentaId,
      tipo: "ACTUALIZACION_IA",
      contenido: `Vía de cobro cambiada de ${NOMBRE_DE_PLATAFORMA[anterior]} a ${NOMBRE_DE_PLATAFORMA[input.nueva]} por ${input.actor}: ${input.motivo}`,
      usuarioEmail: input.actor,
    },
  });
  return { anterior, cambio: true };
}
