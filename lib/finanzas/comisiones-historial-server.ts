/**
 * lib/finanzas/comisiones-historial-server.ts — leer y confirmar las cuotas de comisión de los vendedores (2026-10-06).
 * Server-only. Lo importa scripts/import-comisiones-vendedor.ts; lo muestra Finanzas › Comisiones de vendedor.
 *
 * ⚠ Remuneración: solo Super Admin o quien tenga `comisionesVendedor` por persona (lib/auth/salarios-por-persona.ts).
 * La página y la ruta lo verifican ANTES de llamar acá.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CobranzaError } from "@/lib/cobranza/mutations";
import type { CuotaComisionDTO, EstadoCuota, HistorialComisionesDTO, TipoVenta, VendedorConHistorialDTO } from "./comisiones-historial";

export type { CuotaComisionDTO, HistorialComisionesDTO, VendedorConHistorialDTO };

const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

export async function cargarHistorialComisiones(anio: number): Promise<HistorialComisionesDTO> {
  let filas;
  try {
    filas = await prisma.cuotaComisionVendedor.findMany({
      where: { periodo: { startsWith: `${anio}-` } },
      include: { teamMember: { select: { name: true } } },
      orderBy: [{ fechaIngreso: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2021") return { anio, vendedores: [], faltaSql: true };
    throw e;
  }

  // Los nombres de quien confirmó (un email del equipo → su nombre de pila).
  const emails = [...new Set(filas.map((f) => f.confirmadoPor).filter((e): e is string => !!e && e.includes("@")))];
  const equipo = emails.length
    ? await prisma.teamMember.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { email: true, name: true } })
    : [];
  const nombreDe = new Map(equipo.map((m) => [m.email.toLowerCase(), m.name.split(" ")[0] || m.email]));
  const quien = (c: string | null) => (!c ? null : c.startsWith("import:") ? "el Excel" : (nombreDe.get(c.toLowerCase()) ?? c));

  const porVendedor = new Map<string, VendedorConHistorialDTO>();
  for (const f of filas) {
    const v = porVendedor.get(f.teamMemberId) ?? { teamMemberId: f.teamMemberId, nombre: f.teamMember.name, moneda: f.moneda, ventas: [] };
    let venta = v.ventas.find((x) => x.ventaClave === f.ventaClave);
    if (!venta) {
      venta = {
        ventaClave: f.ventaClave,
        cliente: f.cliente,
        tipoVenta: f.tipoVenta as TipoVenta,
        porcentaje: Number(f.porcentaje),
        montoContrato: num(f.montoContrato),
        montoComision: num(f.montoComision),
        fechaIngreso: f.fechaIngreso ? f.fechaIngreso.toISOString().slice(0, 10) : null,
        cuotas: [],
      };
      v.ventas.push(venta);
    }
    venta.cuotas.push({
      id: f.id,
      periodo: f.periodo,
      monto: Number(f.monto),
      estado: f.estado as EstadoCuota,
      confirmadoPor: quien(f.confirmadoPor),
      confirmadoEn: f.confirmadoEn ? f.confirmadoEn.toISOString() : null,
    });
    porVendedor.set(f.teamMemberId, v);
  }
  const vendedores = [...porVendedor.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  for (const v of vendedores) for (const venta of v.ventas) venta.cuotas.sort((a, b) => a.periodo.localeCompare(b.periodo));
  return { anio, vendedores, faltaSql: false };
}

/**
 * «¿Se pagó?» (el botón de la pantalla): PAGADA o NO_PAGADA a nombre de quien responde, o de vuelta a POR_CONFIRMAR para
 * corregir. Una cuota de un mes que todavía no llega no se confirma.
 */
export async function confirmarCuotaComision(
  id: string,
  estado: EstadoCuota,
  byEmail: string,
  hoyISO: string,
): Promise<{ id: string; estado: EstadoCuota }> {
  const cuota = await prisma.cuotaComisionVendedor.findUnique({ where: { id }, select: { periodo: true } });
  if (!cuota) throw new CobranzaError("Esa cuota no existe.", 404);
  if (estado !== "POR_CONFIRMAR" && cuota.periodo > hoyISO.slice(0, 7)) {
    throw new CobranzaError("Esa cuota es de un mes que todavía no llega: se confirma cuando se pague.", 409);
  }
  const confirmada = estado !== "POR_CONFIRMAR";
  await prisma.cuotaComisionVendedor.update({
    where: { id },
    data: { estado, confirmadoPor: confirmada ? byEmail : null, confirmadoEn: confirmada ? new Date() : null },
  });
  return { id, estado };
}
