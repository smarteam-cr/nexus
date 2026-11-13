/**
 * lib/sociedades/copia.ts — lee los libros de Odoo que tocan a las sociedades de Smarteam y los copia a
 * `MovimientoEntreSociedades` (2026-11-13). ⛔ Solo lectura hacia Odoo.
 *
 * La corre la copia de Odoo (`sincronizarOdoo`, lib/cobranza/odoo/sync.ts) al final de cada corrida buena, con el mismo
 * transporte, como el banco. También el botón «Actualizar» de Finanzas › Sociedades y el script
 * `scripts/sociedades-copia.ts`.
 *
 * ⚠ NUNCA lanza: un fallo de esto no puede tumbar la copia de las facturas. El resultado queda en `CronJobState`
 * «odoo-entre-sociedades».
 *
 * Sin `server-only`, por lo mismo que sync.ts: la corre el scheduler y un script.
 */
import { prisma } from "@/lib/db/prisma";
import type { OdooTransport } from "@/lib/cobranza/odoo/transporte";
import { clasificarCuenta, mapearCuentaOdoo, ODOO_CAMPOS_CUENTA, type CuentaClasificada } from "./catalogo";
import { mapearCompania, ODOO_CAMPOS_COMPANIA, type CompaniaOdoo } from "./ajustes-contables";
import {
  clasificarLinea,
  cuentasQueMiranAOtra,
  dominioDeLineas,
  dominioDePartnersDeSociedades,
  emparejarTraslados,
  mapearLineaContable,
  ODOO_CAMPOS_LINEA,
  partnersDeSociedades,
  type ContextoDeLosLibros,
  type MovimientoCalculado,
} from "./entre-sociedades";
import type { PlataformaSociedad, SociedadPropiaDTO } from "./sociedades";

export const CLAVE_COPIA_ENTRE_SOCIEDADES = "odoo-entre-sociedades";

/** Más de esto por lectura y algo cambió en Odoo (o en el dominio): se corta y se avisa en vez de traer el libro entero. */
const TOPE_DE_LINEAS = 5_000;

/** Las sociedades, como las usa el resto del código. */
export async function cargarSociedades(): Promise<SociedadPropiaDTO[]> {
  const filas = await prisma.sociedadPropia.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
  return filas.map((s) => ({
    id: s.id,
    clave: s.clave,
    nombre: s.nombre,
    razonSocial: s.razonSocial,
    pais: s.pais,
    plataforma: (["ODOO", "MERCURY"].includes(s.plataforma) ? s.plataforma : "NINGUNA") as PlataformaSociedad,
    odooCompanyId: s.odooCompanyId,
    alias: s.alias,
    principal: s.principal,
    activa: s.activa,
    orden: s.orden,
  }));
}

export interface LibrosDeOdoo {
  companias: CompaniaOdoo[];
  cuentas: CuentaClasificada[];
  contexto: ContextoDeLosLibros;
  /** Lo que no encajó: compañías sin sociedad, cuentas que nombran a una sociedad y no son de balance. */
  avisos: string[];
}

/** Las compañías, el catálogo y los contactos que son sociedades: lo que hace falta para leer los libros. */
export async function leerLibrosDeOdoo(t: OdooTransport, sociedades: readonly SociedadPropiaDTO[]): Promise<LibrosDeOdoo> {
  const avisos: string[] = [];
  const companias = (await t.buscarYLeer("res.company", [], ODOO_CAMPOS_COMPANIA, {}))
    .map(mapearCompania)
    .filter((c): c is CompaniaOdoo => c !== null);
  for (const c of companias) {
    if (!sociedades.some((s) => s.odooCompanyId === c.id)) {
      avisos.push(`Odoo tiene la compañía ${c.id} «${c.nombre}» y ninguna sociedad de Nexus la lleva: sus líneas no se leen.`);
    }
  }
  /* ⚠ Con las deprecadas: una cuenta que se fusionó puede seguir teniendo líneas viejas. */
  const cuentas = (await t.buscarYLeer("account.account", [["deprecated", "in", [true, false]]], ODOO_CAMPOS_CUENTA, { order: "code asc" }))
    .map(mapearCuentaOdoo)
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map(clasificarCuenta);
  const dominio = dominioDePartnersDeSociedades(sociedades);
  const partners = dominio
    ? (await t.buscarYLeer("res.partner", ["&", ["active", "in", [true, false]], ...dominio], ["id", "name"], { limit: 200 }))
        .map((p) => ({ id: Number(p.id), nombre: typeof p.name === "string" ? p.name : "" }))
        .filter((p) => p.id > 0)
    : [];
  const { porCuenta, avisos: avisosDeCuentas } = cuentasQueMiranAOtra(cuentas, sociedades);
  avisos.push(...avisosDeCuentas);
  return {
    companias,
    cuentas,
    avisos,
    contexto: {
      sociedades,
      cuentas: new Map(cuentas.map((c) => [c.id, c])),
      cuentaDeSociedad: porCuenta,
      cuentasDeTraslado: new Set(companias.map((c) => c.cuentaDeTraslado).filter((n): n is number => n !== null)),
      partnerDeSociedad: partnersDeSociedades(partners, sociedades),
      monedaDeCompania: new Map(companias.filter((c) => c.moneda).map((c) => [c.id, c.moneda!])),
    },
  };
}

/** Los movimientos entre sociedades que dicen hoy los libros de Odoo. */
export async function leerMovimientosDeOdoo(
  t: OdooTransport,
  libros: LibrosDeOdoo,
): Promise<{ movimientos: MovimientoCalculado[]; rechazadas: string[]; avisos: string[] }> {
  const ctx = libros.contexto;
  const cuentaIds = [...new Set([...ctx.cuentaDeSociedad.keys(), ...ctx.cuentasDeTraslado])];
  const partnerIds = [...ctx.partnerDeSociedad.keys()];
  if (cuentaIds.length === 0 && partnerIds.length === 0) return { movimientos: [], rechazadas: [], avisos: [] };
  const crudas = await t.buscarYLeer("account.move.line", dominioDeLineas(cuentaIds, partnerIds), ODOO_CAMPOS_LINEA, {
    order: "date asc, id asc",
    limit: TOPE_DE_LINEAS + 1,
  });
  if (crudas.length > TOPE_DE_LINEAS) {
    throw new Error(`Odoo devolvió más de ${TOPE_DE_LINEAS} líneas entre sociedades: no se copió nada (¿cambió el catálogo?).`);
  }
  const rechazadas: string[] = [];
  const avisos = new Set<string>();
  const movs: MovimientoCalculado[] = [];
  for (const c of crudas) {
    const r = mapearLineaContable(c);
    if ("rechazo" in r) {
      rechazadas.push(r.rechazo);
      continue;
    }
    const m = clasificarLinea(r.linea, ctx);
    if ("aviso" in m) avisos.add(m.aviso);
    else if ("movimiento" in m) movs.push(m.movimiento);
  }
  return { movimientos: emparejarTraslados(movs), rechazadas, avisos: [...avisos] };
}

export interface ResultadoEntreSociedades {
  ok: boolean;
  at: string;
  ultimaBuena: string | null;
  vistas: number;
  nuevas: number;
  cambiadas: number;
  desaparecidas: number;
  rechazadas: string[];
  avisos: string[];
  error: string | null;
}

/** Los campos que se comparan: si no cambió ninguno, la fila no se reescribe. */
function huella(m: {
  fecha: Date | string; sociedadId: string; contraparteId: string | null; monto: unknown; moneda: string; tipo: string; respaldo: string;
  concepto: string | null; asiento: string | null; cuentaContable: string | null; diario: string | null; factura: string | null; odooCompanyId: number | null;
}): string {
  const f = typeof m.fecha === "string" ? m.fecha : m.fecha.toISOString().slice(0, 10);
  return [f, m.sociedadId, m.contraparteId ?? "", Number(m.monto).toFixed(2), m.moneda, m.tipo, m.respaldo, m.concepto ?? "", m.asiento ?? "",
    m.cuentaContable ?? "", m.diario ?? "", m.factura ?? "", m.odooCompanyId ?? ""].join("|");
}

/** Copia los movimientos entre sociedades de Odoo. Nunca lanza. */
export async function copiarEntreSociedades(t: OdooTransport, ahora: Date): Promise<ResultadoEntreSociedades> {
  const previo = await prisma.cronJobState
    .findUnique({ where: { id: CLAVE_COPIA_ENTRE_SOCIEDADES }, select: { lastResult: true } })
    .catch(() => null);
  const ultimaPrevia = (previo?.lastResult as Partial<ResultadoEntreSociedades> | null)?.ultimaBuena ?? null;
  const res: ResultadoEntreSociedades = {
    ok: false,
    at: ahora.toISOString(),
    ultimaBuena: ultimaPrevia,
    vistas: 0,
    nuevas: 0,
    cambiadas: 0,
    desaparecidas: 0,
    rechazadas: [],
    avisos: [],
    error: null,
  };
  try {
    const sociedades = await cargarSociedades();
    const libros = await leerLibrosDeOdoo(t, sociedades);
    const { movimientos, rechazadas, avisos } = await leerMovimientosDeOdoo(t, libros);
    res.vistas = movimientos.length;
    res.rechazadas = rechazadas.slice(0, 20);
    res.avisos = [...libros.avisos, ...avisos].slice(0, 20);

    const previas = new Map(
      (await prisma.movimientoEntreSociedades.findMany({ where: { origen: "ODOO" } })).map((p) => [p.odooLineId!, p]),
    );
    const nuevas: Array<Record<string, unknown>> = [];
    const sinCambio: string[] = [];
    for (const m of movimientos) {
      const datos = {
        odooCompanyId: m.odooCompanyId,
        fecha: new Date(`${m.fecha}T00:00:00Z`),
        sociedadId: m.sociedadId,
        contraparteId: m.contraparteId,
        monto: m.monto,
        moneda: m.moneda,
        tipo: m.tipo,
        respaldo: m.respaldo,
        concepto: m.concepto,
        asiento: m.asiento,
        cuentaContable: m.cuentaContable,
        diario: m.diario,
        factura: m.factura,
        sincronizadoEn: ahora,
      };
      const previa = previas.get(m.odooLineId);
      if (!previa) {
        nuevas.push({ origen: "ODOO", odooLineId: m.odooLineId, estado: "VIGENTE", ...datos });
        continue;
      }
      if (previa.estado === "VIGENTE" && huella(previa) === huella(m)) {
        sinCambio.push(previa.id);
        continue;
      }
      /* Cambió algo (o volvió de desaparecida). La aceptación de una persona se conserva: se aceptó esa línea. */
      await prisma.movimientoEntreSociedades.update({ where: { id: previa.id }, data: { ...datos, estado: "VIGENTE" } });
      res.cambiadas++;
    }
    if (nuevas.length) {
      res.nuevas = (await prisma.movimientoEntreSociedades.createMany({ data: nuevas as never, skipDuplicates: true })).count;
    }
    if (sinCambio.length) {
      await prisma.movimientoEntreSociedades.updateMany({ where: { id: { in: sinCambio } }, data: { sincronizadoEn: ahora } });
    }
    /* Las que Odoo ya no devuelve (se anularon, o dejaron de estar en una cuenta que mira a otra sociedad). Con el freno
       de las otras copias: si de golpe se va más de la mitad, no se marca ninguna. */
    const vistas = new Set(movimientos.map((m) => m.odooLineId));
    const seFueron = [...previas.values()].filter((p) => p.estado === "VIGENTE" && !vistas.has(p.odooLineId!));
    const vigentes = [...previas.values()].filter((p) => p.estado === "VIGENTE").length;
    if (seFueron.length > 0 && seFueron.length * 2 > vigentes && vigentes >= 10) {
      throw new Error(`${seFueron.length} de ${vigentes} movimientos entre sociedades dejaron de venir de golpe: no se marcó ninguno como desaparecido.`);
    }
    if (seFueron.length) {
      res.desaparecidas = (
        await prisma.movimientoEntreSociedades.updateMany({
          where: { id: { in: seFueron.map((p) => p.id) } },
          data: { estado: "DESAPARECIDA", sincronizadoEn: ahora },
        })
      ).count;
    }
    res.ok = true;
    res.ultimaBuena = res.at;
  } catch (e) {
    res.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("[sociedades] la copia entre sociedades falló:", res.error);
  }
  await prisma.cronJobState
    .upsert({
      where: { id: CLAVE_COPIA_ENTRE_SOCIEDADES },
      create: { id: CLAVE_COPIA_ENTRE_SOCIEDADES, lastResult: { ...res } },
      update: { lastResult: { ...res } },
    })
    .catch((e) => console.error("[sociedades] no se pudo guardar el resultado:", e instanceof Error ? e.message : e));
  return res;
}
