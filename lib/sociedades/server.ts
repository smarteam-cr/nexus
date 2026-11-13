/**
 * lib/sociedades/server.ts — lo que leen y escriben las pantallas de las sociedades de Smarteam (2026-11-13).
 * Server-only. Las reglas viven en los módulos puros (sociedades.ts, catalogo.ts, entre-sociedades.ts,
 * ajustes-contables.ts); la copia desde Odoo, en copia.ts.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { crDateParts } from "@/lib/jobs/time";
import { crearTransporteXmlRpc, configDesdeEntorno } from "@/lib/cobranza/odoo/transporte-xmlrpc";
import type { OdooTransport } from "@/lib/cobranza/odoo/transporte";
import { sociedadDeLaCuenta, type SociedadDeLaCuentaDTO, type SociedadPropiaDTO } from "./sociedades";
import { resumenDelCatalogo, type CuentaClasificada, type ResumenDelCatalogo } from "./catalogo";
import { necesitaRevision, saldosEntreSociedades, type SaldoEntreSociedades } from "./entre-sociedades";
import { rangoDelMes, senalesDelMes, type MarcaDeAjustes, type SenalContable } from "./ajustes-contables";
import {
  cargarSociedades,
  copiarEntreSociedades,
  leerLibrosDeOdoo,
  CLAVE_COPIA_ENTRE_SOCIEDADES,
  type ResultadoEntreSociedades,
} from "./copia";

export { cargarSociedades };

/** Una lectura de Odoo pedida por una persona: corta antes que la del cron. */
const ESPERA_ODOO_MS = 25_000;

function transporte(): OdooTransport {
  return crearTransporteXmlRpc({ ...configDesdeEntorno(), timeoutMs: ESPERA_ODOO_MS });
}

const dia = (d: Date | null | undefined) => (d ? crDateParts(d).dateKey : null);

/* ── Las cuentas de cobranza ─────────────────────────────────────────────────────── */

/**
 * La sociedad de cada cuenta de cobranza (por su clave), para el filtro de Cobranza y de cualquier pantalla que liste
 * cuentas. Una lectura liviana: id, vía y la sociedad puesta.
 */
export async function cargarSociedadesDeCuentas(): Promise<{ sociedades: SociedadPropiaDTO[]; claveDeCuenta: Record<string, string> }> {
  const [sociedades, cuentas] = await Promise.all([
    cargarSociedades(),
    prisma.cuentaFinanciera.findMany({ select: { id: true, viaCobro: true, sociedadPropiaId: true } }),
  ]);
  const claveDeCuenta: Record<string, string> = {};
  for (const c of cuentas) {
    const s = sociedadDeLaCuenta(c, sociedades);
    if (s) claveDeCuenta[c.id] = s.clave;
  }
  return { sociedades, claveDeCuenta };
}

export async function leerSociedadDeLaCuenta(cuentaId: string): Promise<SociedadDeLaCuentaDTO> {
  const [sociedades, cuenta] = await Promise.all([
    cargarSociedades(),
    prisma.cuentaFinanciera.findUnique({ where: { id: cuentaId }, select: { viaCobro: true, sociedadPropiaId: true } }),
  ]);
  if (!cuenta) throw new CobranzaError("La cuenta no existe.", 404);
  return {
    sociedades: sociedades.map(({ id, clave, nombre, plataforma, activa }) => ({ id, clave, nombre, plataforma, activa })),
    puesta: cuenta.sociedadPropiaId,
    efectiva: sociedadDeLaCuenta(cuenta, sociedades)?.id ?? null,
    porSuVia: sociedadDeLaCuenta({ ...cuenta, sociedadPropiaId: null }, sociedades)?.id ?? null,
    viaCobro: cuenta.viaCobro,
  };
}

/**
 * Pone (o quita) la sociedad de Smarteam que le cobra a una cuenta. Si la elegida es la de su vía, se guarda null: la
 * cuenta sigue la regla y un cambio de vía después la sigue moviendo. Queda en la bitácora de la cuenta.
 */
export async function ponerSociedadALaCuenta(cuentaId: string, sociedadId: string | null, actor: string): Promise<void> {
  const actual = await leerSociedadDeLaCuenta(cuentaId);
  if (sociedadId && !actual.sociedades.some((s) => s.id === sociedadId && s.activa)) {
    throw new CobranzaError("Esa sociedad no existe o no está activa.", 400);
  }
  const guardar = sociedadId && sociedadId !== actual.porSuVia ? sociedadId : null;
  if (guardar === actual.puesta) return;
  const nombre = (id: string | null) => actual.sociedades.find((s) => s.id === id)?.nombre ?? "—";
  const nueva = guardar ?? actual.porSuVia;
  await prisma.$transaction([
    prisma.cuentaFinanciera.update({ where: { id: cuentaId }, data: { sociedadPropiaId: guardar } }),
    prisma.bitacoraCobro.create({
      data: {
        cuentaId,
        tipo: "NOTA",
        contenido: `Cobra ${nombre(nueva)} (antes ${nombre(actual.efectiva)}).`,
        usuarioEmail: actor,
      },
    }),
  ]);
}

/* ── Entre sociedades ────────────────────────────────────────────────────────────── */

export interface MovimientoDTO {
  id: string;
  origen: "ODOO" | "MANUAL";
  /** AAAA-MM-DD. */
  fecha: string;
  sociedadId: string;
  contraparteId: string | null;
  monto: number;
  moneda: string;
  tipo: string;
  respaldo: string;
  concepto: string | null;
  asiento: string | null;
  cuentaContable: string | null;
  diario: string | null;
  factura: string | null;
  aceptado: { por: string; en: string | null; nota: string | null } | null;
  anotadoPor: string | null;
}

export interface PaginaDeSociedades {
  sociedades: Array<SociedadPropiaDTO & { cuentasDeCobranza: number }>;
  saldos: SaldoEntreSociedades[];
  /** Entre sociedades, sin factura y sin aceptar. */
  sinFactura: MovimientoDTO[];
  /** Traslados entre cuentas propias sin su otra mitad, sin aceptar. */
  trasladosSueltos: MovimientoDTO[];
  /** Todo lo que cruza entre sociedades, lo más nuevo primero. */
  movimientos: MovimientoDTO[];
  copia: Pick<ResultadoEntreSociedades, "ok" | "at" | "ultimaBuena" | "avisos" | "error"> | null;
}

function aDTO(m: Awaited<ReturnType<typeof prisma.movimientoEntreSociedades.findMany>>[number]): MovimientoDTO {
  return {
    id: m.id,
    origen: m.origen === "MANUAL" ? "MANUAL" : "ODOO",
    fecha: m.fecha.toISOString().slice(0, 10),
    sociedadId: m.sociedadId,
    contraparteId: m.contraparteId,
    monto: Number(m.monto),
    moneda: m.moneda,
    tipo: m.tipo,
    respaldo: m.respaldo,
    concepto: m.concepto,
    asiento: m.asiento,
    cuentaContable: m.cuentaContable,
    diario: m.diario,
    factura: m.factura,
    aceptado: m.aceptadoPor ? { por: m.aceptadoPor, en: dia(m.aceptadoEn), nota: m.aceptadoNota } : null,
    anotadoPor: m.anotadoPor,
  };
}

export async function cargarPaginaDeSociedades(): Promise<PaginaDeSociedades> {
  const [sociedades, cuentas, filas, copia] = await Promise.all([
    cargarSociedades(),
    prisma.cuentaFinanciera.findMany({ select: { id: true, viaCobro: true, sociedadPropiaId: true } }),
    prisma.movimientoEntreSociedades.findMany({ where: { estado: "VIGENTE" }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }] }),
    prisma.cronJobState.findUnique({ where: { id: CLAVE_COPIA_ENTRE_SOCIEDADES }, select: { lastResult: true } }),
  ]);
  const porSociedad = new Map<string, number>();
  for (const c of cuentas) {
    const s = sociedadDeLaCuenta(c, sociedades);
    if (s) porSociedad.set(s.id, (porSociedad.get(s.id) ?? 0) + 1);
  }
  const movs = filas.map(aDTO);
  const r = copia?.lastResult as Partial<ResultadoEntreSociedades> | null;
  return {
    sociedades: sociedades.map((s) => ({ ...s, cuentasDeCobranza: porSociedad.get(s.id) ?? 0 })),
    saldos: saldosEntreSociedades(movs.map((m) => ({ ...m, estado: "VIGENTE" }))),
    sinFactura: filas.filter((m) => m.contraparteId && necesitaRevision(m)).map(aDTO),
    trasladosSueltos: filas.filter((m) => !m.contraparteId && necesitaRevision(m)).map(aDTO),
    movimientos: movs.filter((m) => m.contraparteId).slice(0, 400),
    copia: r?.at
      ? { ok: !!r.ok, at: r.at, ultimaBuena: r.ultimaBuena ?? null, avisos: r.avisos ?? [], error: r.error ?? null }
      : null,
  };
}

/** «Actualizar»: vuelve a copiar de Odoo lo que se deben las sociedades. */
export async function actualizarEntreSociedades(): Promise<ResultadoEntreSociedades> {
  return copiarEntreSociedades(transporte(), new Date());
}

export interface MovimientoAnotado {
  acreedoraId: string;
  deudoraId: string;
  fecha: string;
  monto: number;
  moneda: "CRC" | "USD";
  concepto: string;
  factura: string | null;
}

/**
 * Anotar lo que no está en Odoo («Smart Agro le debe a Flywheel 1.000 dólares»). Se guarda en los libros de la que
 * cobra, en positivo. Con factura, tiene respaldo; sin ella, va a la lista de lo que no tiene factura.
 */
export async function anotarMovimiento(m: MovimientoAnotado, actor: string): Promise<void> {
  if (m.acreedoraId === m.deudoraId) throw new CobranzaError("Una sociedad no se debe a sí misma.", 400);
  const ids = new Set((await cargarSociedades()).filter((s) => s.activa).map((s) => s.id));
  if (!ids.has(m.acreedoraId) || !ids.has(m.deudoraId)) throw new CobranzaError("Esa sociedad no existe o no está activa.", 400);
  await prisma.movimientoEntreSociedades.create({
    data: {
      origen: "MANUAL",
      fecha: new Date(`${m.fecha}T00:00:00Z`),
      sociedadId: m.acreedoraId,
      contraparteId: m.deudoraId,
      monto: m.monto,
      moneda: m.moneda,
      tipo: m.factura ? "FACTURA" : "MOVIMIENTO",
      respaldo: m.factura ? "FACTURA" : "SIN_RESPALDO",
      concepto: m.concepto.trim(),
      factura: m.factura?.trim() || null,
      anotadoPor: actor,
    },
  });
}

/** «Está bien así» (con por qué), quitar esa marca, o anular algo anotado a mano. Lo de Odoo no se anula desde acá. */
export async function cambiarMovimiento(
  id: string,
  accion: { tipo: "ACEPTAR"; nota: string } | { tipo: "QUITAR_ACEPTACION" } | { tipo: "ANULAR" },
  actor: string,
): Promise<void> {
  const m = await prisma.movimientoEntreSociedades.findUnique({ where: { id }, select: { origen: true, estado: true } });
  if (!m) throw new CobranzaError("Ese movimiento no existe.", 404);
  if (accion.tipo === "ANULAR") {
    if (m.origen !== "MANUAL") throw new CobranzaError("Lo que viene de Odoo se corrige en Odoo.", 409);
    await prisma.movimientoEntreSociedades.update({ where: { id }, data: { estado: "ANULADA" } });
    return;
  }
  if (accion.tipo === "ACEPTAR") {
    await prisma.movimientoEntreSociedades.update({
      where: { id },
      data: { aceptadoPor: actor, aceptadoEn: new Date(), aceptadoNota: accion.nota.trim() },
    });
    return;
  }
  await prisma.movimientoEntreSociedades.update({ where: { id }, data: { aceptadoPor: null, aceptadoEn: null, aceptadoNota: null } });
}

/* ── El catálogo de Odoo ─────────────────────────────────────────────────────────── */

export interface CatalogoDTO {
  resumen: ResumenDelCatalogo;
  cuentas: CuentaClasificada[];
  /** Cuenta contable → la sociedad que nombra (las cuentas entre sociedades que Nexus reconoce). */
  entreSociedades: Array<{ codigo: string; nombre: string; sociedad: string }>;
  avisos: string[];
}

/** El catálogo, leído de Odoo en el momento (lo pide una persona). */
export async function leerCatalogo(): Promise<CatalogoDTO> {
  const sociedades = await cargarSociedades();
  const libros = await leerLibrosDeOdoo(transporte(), sociedades);
  const nombre = new Map(sociedades.map((s) => [s.id, s.nombre]));
  return {
    resumen: resumenDelCatalogo(libros.cuentas),
    cuentas: libros.cuentas,
    entreSociedades: [...libros.contexto.cuentaDeSociedad].map(([cuentaId, socId]) => {
      const c = libros.contexto.cuentas.get(cuentaId)!;
      return { codigo: c.codigo, nombre: c.nombre, sociedad: nombre.get(socId) ?? socId };
    }),
    avisos: libros.avisos,
  };
}

/* ── Los ajustes contables del mes ───────────────────────────────────────────────── */

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface AjustesDelMesDTO {
  periodo: string;
  marca: MarcaDeAjustes;
  /** Los indicios de Odoo. null = no se pudo leer Odoo (`errorOdoo` dice por qué). */
  senales: SenalContable[] | null;
  errorOdoo: string | null;
}

async function nombreDe(email: string | null): Promise<string | null> {
  if (!email) return null;
  const m = await prisma.teamMember.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { name: true } });
  return m?.name.split(" ")[0] || email;
}

/** La marca de un mes y, si se pide, los indicios de Odoo (una lectura en el momento, que puede fallar sin romper). */
export async function leerAjustesDelMes(periodo: string, conOdoo: boolean): Promise<AjustesDelMesDTO> {
  if (!MES_RE.test(periodo)) throw new CobranzaError("El mes no es válido.", 400);
  const c = await prisma.cierreMes.findUnique({
    where: { periodo },
    select: { ajustesContablesPendientes: true, ajustesContablesNota: true, ajustesContablesPor: true, ajustesContablesEn: true },
  });
  const marca: MarcaDeAjustes = {
    pendientes: !!c?.ajustesContablesPendientes,
    nota: c?.ajustesContablesNota ?? null,
    por: await nombreDe(c?.ajustesContablesPor ?? null),
    en: dia(c?.ajustesContablesEn),
  };
  if (!conOdoo) return { periodo, marca, senales: null, errorOdoo: null };
  try {
    return { periodo, marca, senales: await senalesDeOdoo(periodo), errorOdoo: null };
  } catch (e) {
    console.error("[sociedades/ajustes] no se pudo leer Odoo:", e instanceof Error ? e.message : e);
    return { periodo, marca, senales: null, errorOdoo: "No se pudo leer Odoo ahora. La marca se puede poner igual." };
  }
}

async function senalesDeOdoo(periodo: string): Promise<SenalContable[]> {
  const t = transporte();
  const sociedades = await cargarSociedades();
  const libros = await leerLibrosDeOdoo(t, sociedades);
  const { desde, hasta } = rangoDelMes(periodo);
  const delMes: unknown[] = [["date", ">=", desde], ["date", "<", hasta]];
  const puentes = [...new Set(libros.companias.flatMap((c) => c.cuentasPuente))];
  const cruzadas = libros.cuentas.filter((c) => c.avisos.includes("CLASE_DISTINTA")).map((c) => c.id);
  const etiqueta = (id: unknown) => {
    const c = libros.contexto.cuentas.get(Number(Array.isArray(id) ? id[0] : id));
    return c ? `${c.codigo} ${c.nombre}` : "(cuenta)";
  };
  const [borradores, enPuente, malClasificadas, sueltos] = await Promise.all([
    t.buscarYLeer("account.move", [["state", "=", "draft"], ...delMes], ["name", "move_type"], { limit: 100 }),
    puentes.length
      ? t.agrupar("account.move.line", [["parent_state", "=", "posted"], ["reconciled", "=", false], ["account_id", "in", puentes], ...delMes], ["balance:sum"], ["account_id"])
      : Promise.resolve([]),
    cruzadas.length
      ? t.agrupar("account.move.line", [["parent_state", "=", "posted"], ["account_id", "in", cruzadas], ...delMes], ["balance:sum"], ["account_id"])
      : Promise.resolve([]),
    prisma.movimientoEntreSociedades.count({
      where: {
        estado: "VIGENTE",
        contraparteId: null,
        respaldo: "SIN_RESPALDO",
        aceptadoEn: null,
        fecha: { gte: new Date(`${desde}T00:00:00Z`), lt: new Date(`${hasta}T00:00:00Z`) },
      },
    }),
  ]);
  return senalesDelMes({
    borradores: borradores.map((b) => ({
      nombre: typeof b.name === "string" && b.name !== "/" ? b.name : "(sin número)",
      tipo: typeof b.move_type === "string" ? b.move_type : "entry",
    })),
    enPuente: enPuente.map((g) => ({ cuenta: etiqueta(g.account_id), n: Number(g.__count) || 0 })).filter((g) => g.n > 0),
    malClasificadas: malClasificadas.map((g) => ({ cuenta: etiqueta(g.account_id), n: Number(g.__count) || 0 })).filter((g) => g.n > 0),
    trasladosSueltos: sueltos,
  });
}

/** Marca (o desmarca) el mes con ajustes contables pendientes. Vale con el mes abierto o cerrado; no lo reabre. */
export async function marcarAjustes(periodo: string, pendientes: boolean, nota: string | null, actor: string): Promise<void> {
  if (!MES_RE.test(periodo)) throw new CobranzaError("El mes no es válido.", 400);
  const datos = pendientes
    ? { ajustesContablesPendientes: true, ajustesContablesNota: nota?.trim() || null, ajustesContablesPor: actor, ajustesContablesEn: new Date() }
    : { ajustesContablesPendientes: false, ajustesContablesNota: null, ajustesContablesPor: actor, ajustesContablesEn: new Date() };
  await prisma.cierreMes.upsert({ where: { periodo }, create: { periodo, ...datos }, update: datos });
}

/** Los meses marcados entre estos, con su nota: para el punto de equilibrio y cualquier lectura del resultado. */
export async function mesesConAjustesPendientes(periodos: readonly string[]): Promise<Array<{ periodo: string; nota: string | null }>> {
  if (periodos.length === 0) return [];
  const filas = await prisma.cierreMes.findMany({
    where: { periodo: { in: [...periodos] }, ajustesContablesPendientes: true },
    select: { periodo: true, ajustesContablesNota: true },
  });
  return filas.map((f) => ({ periodo: f.periodo, nota: f.ajustesContablesNota }));
}
