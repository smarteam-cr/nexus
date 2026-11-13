/**
 * lib/external/estado-de-cuenta-view.ts — CHOKEPOINT del estado de cuenta que ve el cliente (pedido 17, 2026-11-13).
 * Único lugar donde el token de `/external/estado-de-cuenta/[token]` se resuelve a contenido. SERVIDOR.
 *
 * Fail-closed, en CADA render (la página es `force-dynamic`: el estado es EN VIVO y revocar surte efecto al instante):
 *   1. el token tiene la forma de uno (64 hex) y existe un `AccesoAlEstadoDeCuenta` con él, sin revocar → si no, null
 *      (el 404 neutro: no distingue un token inválido de uno revocado);
 *   2. no venció → si venció, `{ tipo: "vencido" }`, sin un solo dato de la cuenta (ni el nombre);
 *   3. las cuotas se leen por el `cuentaId` DEL ENLACE, y cada una se vuelve a comparar contra él (la suya y la de su
 *      servicio) antes de entrar: una cuota de otra cuenta no llega a la página aunque la consulta cambie mañana.
 * Lo que lee es una lista CERRADA de columnas (`select`, nunca `include`): ni notas, ni promesas de pago, ni quién
 * facturó o confirmó, ni números de depósito, ni alertas, bitácora, comisiones o costos. Lo que la página dice lo arma
 * `armarEstadoDeCuenta` (lib/cobranza/estado-de-cuenta.ts), que solo recibe `CuotaDeLaCuenta`.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { armarEstadoDeCuenta, type CuotaDeLaCuenta, type EstadoDeCuenta } from "@/lib/cobranza/estado-de-cuenta";
import { getSmarteamLogoUrl } from "./smarteam-logo";

export interface EstadoDeCuentaViewData {
  empresa: string;
  /** La razón social de la empresa (la suya, no la de Smarteam), si está cargada. */
  razonSocial: string | null;
  /** Cuándo se armó la página (ISO): es en vivo. */
  actualizadoEn: string;
  smarteamLogoUrl: string | null;
  estado: EstadoDeCuenta;
}

export type EstadoDeCuentaParaElToken = { tipo: "ok"; data: EstadoDeCuentaViewData } | { tipo: "vencido"; smarteamLogoUrl: string | null } | null;

const TOKEN = /^[0-9a-f]{64}$/;

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function estadoDeCuentaParaElToken(token: string, ahora = new Date()): Promise<EstadoDeCuentaParaElToken> {
  if (!TOKEN.test(token)) return null;
  const acceso = await prisma.accesoAlEstadoDeCuenta.findUnique({
    where: { accessToken: token },
    select: { id: true, cuentaId: true, revokedAt: true, venceEn: true },
  });
  if (!acceso || acceso.revokedAt) return null;
  const logo = await getSmarteamLogoUrl().catch(() => null);
  if (acceso.venceEn <= ahora) return { tipo: "vencido", smarteamLogoUrl: logo };

  const cuentaId = acceso.cuentaId;
  const [cuenta, cobros] = await Promise.all([
    prisma.cuentaFinanciera.findUnique({
      where: { id: cuentaId },
      select: { id: true, moneda: true, creditoDias: true, razonSocial: true, client: { select: { name: true } } },
    }),
    prisma.cobro.findMany({
      where: { cuentaId, estado: { not: "SIN_DATO" } },
      select: {
        cuentaId: true,
        estado: true,
        periodo: true,
        fechaProgramada: true,
        fechaEmision: true,
        fechaCobro: true,
        numeroFactura: true,
        monto: true,
        moneda: true,
        servicio: { select: { cuentaId: true, tipoServicio: true } },
      },
    }),
  ]);
  if (!cuenta || cuenta.id !== cuentaId) return null;

  const cuotas: CuotaDeLaCuenta[] = cobros
    .filter((c) => c.cuentaId === cuentaId && c.servicio.cuentaId === cuentaId)
    .map((c) => ({
      estado: c.estado,
      periodo: c.periodo,
      fechaProgramada: iso(c.fechaProgramada)!,
      fechaEmision: iso(c.fechaEmision),
      fechaCobro: iso(c.fechaCobro),
      numeroFactura: c.numeroFactura,
      monto: Number(c.monto),
      moneda: c.moneda,
      tipoServicio: c.servicio.tipoServicio,
    }));

  await prisma.accesoAlEstadoDeCuenta
    .update({ where: { id: acceso.id }, data: { lastUsedAt: ahora, vistas: { increment: 1 } } })
    .catch(() => {});

  return {
    tipo: "ok",
    data: {
      empresa: cuenta.client.name,
      razonSocial: cuenta.razonSocial?.trim() || null,
      actualizadoEn: ahora.toISOString(),
      smarteamLogoUrl: logo,
      estado: armarEstadoDeCuenta(cuotas, { hoy: crDateParts(ahora).dateKey, creditoDias: cuenta.creditoDias, monedaDeLaCuenta: cuenta.moneda }),
    },
  };
}
