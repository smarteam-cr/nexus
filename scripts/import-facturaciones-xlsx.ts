/**
 * scripts/import-facturaciones-xlsx.ts
 *
 * Carga el histórico de facturación 2026 de Smarteam (el Excel de Alex) al módulo
 * de cobranza. DRY-RUN por defecto: sin `--apply` no escribe absolutamente nada.
 *
 * Por qué un script y no el wizard CSV del panel:
 *  - el ESTADO del cobro vive en el COLOR de la celda (verde/amarillo/blanco) y solo
 *    exceljs expone el relleno; un CSV lo pierde;
 *  - la carga es HISTÓRICA y `clampInicioCicloCorriente` impide por diseño que el
 *    engine materialice cobros hacia atrás.
 * La decodificación pura vive en lib/cobranza/facturaciones-sheet.ts (con tests).
 *
 * Uso:
 *   npx tsx scripts/import-facturaciones-xlsx.ts                    # dry-run + reporte
 *   npx tsx scripts/import-facturaciones-xlsx.ts --escribir-mapa    # deja el mapa de clientes para revisar
 *   npx tsx scripts/import-facturaciones-xlsx.ts --apply            # escribe (exige mapa sin dudosos)
 *   ... --file=<ruta.xlsx> --hoja="Sitios Web CR" --solo=Corrugando
 *
 * ⚠ Requiere que la migración scripts/sql/2026-07-23-cobranza-conector-importacion.sql
 *   ya esté aplicada (enums CONECTOR e IMPORTACION).
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  ANIO_FACTURACION,
  HOJAS_FACTURACION,
  claveServicio,
  columnasDeQuincena,
  extraerServicio,
  huellaServicio,
  type CeldaCruda,
  type ServicioExtraido,
} from "../lib/cobranza/facturaciones-sheet";

const CONFIRMADO_POR = "import:facturaciones-2026";
const FUENTE = "sheet";
const MAPA_DEFAULT = "scripts/data/facturaciones-clientes.json";
const XLSX_DEFAULT = "C:/Users/ideli/Downloads/Copia de Facturaciones 2026 para Nexus.xlsx";

// ── CLI ─────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;

const APPLY = flag("apply");
const ESCRIBIR_MAPA = flag("escribir-mapa");
const FILE = opt("file") ?? XLSX_DEFAULT;
const MAPA_PATH = resolve(opt("mapa") ?? MAPA_DEFAULT);
const SOLO_HOJA = opt("hoja");
const SOLO_CLIENTE = opt("solo")?.toLowerCase() ?? null;

// ── Utilidades de reporte ───────────────────────────────────────────────────────

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ── 1. Lectura del documento ────────────────────────────────────────────────────

type LecturaHoja = {
  hoja: string;
  servicios: ServicioExtraido[];
  /** Total de la fila "$" del propio Excel — control cruzado contra lo extraído. */
  totalDocumento: number | null;
};

async function leerDocumento(): Promise<LecturaHoja[]> {
  if (!existsSync(FILE)) throw new Error(`No encuentro el archivo: ${FILE}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const out: LecturaHoja[] = [];
  for (const cfg of HOJAS_FACTURACION) {
    if (SOLO_HOJA && cfg.hoja.trim() !== SOLO_HOJA.trim()) continue;
    const ws = wb.getWorksheet(cfg.hoja);
    if (!ws) {
      console.warn(`⚠ La pestaña "${cfg.hoja}" no está en el archivo — se omite.`);
      continue;
    }
    const columnas = columnasDeQuincena(celdasDe(ws.getRow(1)));
    const servicios: ServicioExtraido[] = [];
    let totalDocumento: number | null = null;

    ws.eachRow({ includeEmpty: false }, (row, ri) => {
      if (ri === 1) return;
      const celdas = celdasDe(row);
      const nombre = String(celdas[0]?.valor ?? "").trim();
      // Fila de totales del propio documento ("$" en las hojas de CR, "Total" en las
      // internacionales): control cruzado, no un servicio.
      if (/^(\$|total(es)?)$/i.test(nombre)) {
        totalDocumento = columnas.reduce((acc, c) => acc + (numeroDe(celdas[c.col - 1]?.valor) ?? 0), 0);
        return;
      }
      const s = extraerServicio({ fila: ri, celdas }, columnas, cfg, ANIO_FACTURACION);
      if (s) servicios.push(s);
    });

    out.push({ hoja: cfg.hoja, servicios, totalDocumento });
  }
  return out;
}

/** Celdas de una fila como array 0-indexado (índice 0 = columna 1 de Excel). */
function celdasDe(row: ExcelJS.Row): CeldaCruda[] {
  const out: CeldaCruda[] = [];
  const ancho = Math.max(row.cellCount, 42);
  for (let i = 1; i <= ancho; i++) {
    const cell = row.getCell(i);
    const fill = cell.fill as ExcelJS.FillPattern | undefined;
    const argb =
      fill && fill.type === "pattern" && fill.pattern !== "none" && fill.fgColor?.argb ? fill.fgColor.argb : null;
    out.push({ valor: cell.value, fillArgb: argb });
  }
  return out;
}

/** Número plano o el resultado cacheado de una fórmula (para la fila de totales). */
function numeroDe(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "result" in v) {
    const r = (v as { result?: unknown }).result;
    if (typeof r === "number" && Number.isFinite(r)) return r;
  }
  return null;
}

// ── 2. Deduplicación de servicios repetidos entre hojas ─────────────────────────

/**
 * "Honda Soporte I 6 Meses" está IDÉNTICO en "Continuidad CRM" y "Soportes CR".
 * Misma huella (nombre + montos + fechas + colores) = el mismo servicio anotado dos
 * veces, no dos contratos: se carga una sola vez y se reporta cuál se descartó.
 */
function dedupPorHuella(hojas: LecturaHoja[]): { servicios: ServicioExtraido[]; duplicados: string[] } {
  const vistos = new Map<string, ServicioExtraido>();
  const duplicados: string[] = [];
  for (const h of hojas) {
    for (const s of h.servicios) {
      const k = huellaServicio(s);
      const prev = vistos.get(k);
      if (prev) {
        duplicados.push(`"${s.nombreCrudo}" — en "${s.hoja}" y "${prev.hoja}"; se carga solo la de "${prev.hoja}"`);
        continue;
      }
      vistos.set(k, s);
    }
  }
  return { servicios: [...vistos.values()], duplicados };
}

// ── 3. Resolución de clientes ───────────────────────────────────────────────────

type Via = "exacto" | "prefijo" | "dudoso" | "crear";
type Resolucion = { cliente: string; via: Via; clientId: string | null; clienteNexus: string | null; nota?: string };
type Mapa = Record<string, Resolucion>;

type ClienteRef = { id: string; name: string; n: string };

/** Iniciales de un nombre ya normalizado, salteando conectores ("club de amantes del vino" → "cav"). */
const ACRONIMO_STOP = new Set(["de", "del", "la", "las", "los", "el", "y", "s", "a", "sa", "srl"]);
function acronimo(nNormalizado: string): string {
  return nNormalizado
    .split(" ")
    .filter((w) => w && !ACRONIMO_STOP.has(w))
    .map((w) => w[0])
    .join("");
}

/**
 * Resuelve cada cliente del documento contra Nexus en tres niveles de confianza.
 *
 * La asimetría es a propósito: el peor error posible NO es dejar algo sin resolver,
 * es CREAR un cliente que ya existe (queda la cartera partida en dos fichas del mismo
 * cliente). Por eso la detección de "dudoso" es generosa —basta compartir un token—
 * y "dudoso" JAMÁS se aplica solo: hay que confirmarlo en el mapa.
 */
async function resolverClientes(servicios: ServicioExtraido[], nombres: string[]): Promise<Mapa> {
  const rows = await prisma.client.findMany({ select: { id: true, name: true } });
  const refs: ClienteRef[] = rows.map((r) => ({ id: r.id, name: r.name, n: norm(r.name) }));
  const sinEspacios = (s: string) => s.replace(/ /g, "");

  // Detalles del separador " I " por cliente: en "… I Teamnet" el que identifica al
  // cliente de Nexus es el DETALLE, no el nombre de la razón social de la izquierda.
  const detallesPorCliente = new Map<string, string[]>();
  for (const s of servicios) {
    if (s.detalle) detallesPorCliente.set(s.cliente, [...(detallesPorCliente.get(s.cliente) ?? []), s.detalle]);
  }

  const mapa: Mapa = {};
  const dudar = (cliente: string, ref: ClienteRef, porque: string) => {
    mapa[cliente] = {
      cliente,
      via: "dudoso",
      clientId: null,
      clienteNexus: ref.name,
      nota: `¿es "${ref.name}"? (${porque}) — poné clientId y via:"exacto", o via:"crear" si es otro.`,
    };
  };

  for (const cliente of nombres) {
    const t = norm(cliente);

    const exacto = refs.find((r) => r.n === t || sinEspacios(r.n) === sinEspacios(t));
    if (exacto) {
      mapa[cliente] = { cliente, via: "exacto", clientId: exacto.id, clienteNexus: exacto.name };
      continue;
    }

    // Prefijo: uno arranca con el otro y el más corto es específico (≥5 caracteres).
    // Cubre "Acccsa Internacional" → "ACCCSA", "Bluesat Welcome kit" → "BLUESAT".
    const prefijo = refs.find(
      (r) => (r.n.startsWith(t) || t.startsWith(r.n)) && Math.min(r.n.length, t.length) >= 5,
    );
    if (prefijo) {
      mapa[cliente] = { cliente, via: "prefijo", clientId: prefijo.id, clienteNexus: prefijo.name };
      continue;
    }

    // Dudoso 1 — el DETALLE del " I " nombra un cliente de Nexus. Caso real: las dos
    // razones sociales de Teamnet ("Tecnología Especializada… I Teamnet").
    const porDetalle = (detallesPorCliente.get(cliente) ?? [])
      .map((d) => refs.find((r) => r.n === norm(d)))
      .find(Boolean);
    if (porDetalle) {
      dudar(cliente, porDetalle, `el documento lo anota como "… I ${porDetalle.name}"`);
      continue;
    }

    // Dudoso 2 — comparten algún token. Deliberadamente laxo (≥3 caracteres, cualquier
    // posición): así "AE", "AMC" y "Alfa" salen a revisión en vez de crear un duplicado
    // de "TEC- AE", "AMC - Atlas Mining" y "ALFA+ (LISJ)". Y es justo donde el
    // automático se equivoca ("Transportes Juanva" ≠ "Transportes Refrigerados HL").
    const tokens = t.split(" ").filter((x) => x.length >= 3);
    const porToken = refs.find((r) => {
      const rt = r.n.split(" ");
      return tokens.some((tk) => rt.includes(tk));
    });
    if (porToken) {
      dudar(cliente, porToken, "comparten una palabra del nombre");
      continue;
    }

    // Dudoso 3 — el nombre del documento es el ACRÓNIMO del de Nexus. Sin esto, "CAV"
    // se creaba como cliente nuevo teniendo ya "Club de Amantes del Vino" en Nexus
    // (con cuenta y todo): la cartera del cliente quedaba partida en dos fichas.
    const porAcronimo = t.length >= 3 && !t.includes(" ") ? refs.find((r) => acronimo(r.n) === t) : undefined;
    if (porAcronimo) {
      dudar(cliente, porAcronimo, `"${cliente}" son las iniciales de "${porAcronimo.name}"`);
      continue;
    }

    mapa[cliente] = { cliente, via: "crear", clientId: null, clienteNexus: null };
  }
  return mapa;
}

function cargarMapa(): Mapa | null {
  if (!existsSync(MAPA_PATH)) return null;
  return JSON.parse(readFileSync(MAPA_PATH, "utf8")) as Mapa;
}

function guardarMapa(mapa: Mapa) {
  mkdirSync(dirname(MAPA_PATH), { recursive: true });
  writeFileSync(MAPA_PATH, `${JSON.stringify(mapa, null, 2)}\n`, "utf8");
}

// ── 4. Reporte ──────────────────────────────────────────────────────────────────

function reportar(hojas: LecturaHoja[], servicios: ServicioExtraido[], duplicados: string[], mapa: Mapa) {
  console.log(`\n══ Documento: ${FILE}`);
  console.log(`   Año forzado: ${ANIO_FACTURACION} (los encabezados traen años de plantilla)\n`);

  for (const h of hojas) {
    const cobros = h.servicios.reduce((a, s) => a + s.cobros.length, 0);
    const total = h.servicios.reduce((a, s) => a + s.montoTotal, 0);
    // El control cruzado es INFORMATIVO, no una validación: las filas de totales del
    // documento tienen rangos SUM incompletos (ej. `SUM(H3:H4)` sobre 6 clientes,
    // `SUM(O2:O8)` arrancando en el encabezado, columnas enteras sin fórmula), así que
    // SUB-SUMAN. Lo leído celda por celda es lo correcto; la diferencia se reporta para
    // que se vea cuánta plata no estaba saliendo en los totales de la hoja.
    const delta = h.totalDocumento === null ? null : total - h.totalDocumento;
    const cuadra =
      delta === null
        ? "(la hoja no tiene fila de totales)"
        : Math.abs(delta) < 0.5
          ? "✓ igual al total de la hoja"
          : delta > 0
            ? `⚠ la fila de totales de la hoja sub-suma ${usd(delta)}`
            : `⚠ la fila de totales de la hoja sobre-suma ${usd(-delta)}`;
    console.log(
      `── ${h.hoja.trim().padEnd(32)} ${String(h.servicios.length).padStart(2)} servicios · ${String(cobros).padStart(3)} cobros · ${usd(total).padStart(12)}   ${cuadra}`,
    );
  }

  if (duplicados.length) {
    console.log(`\n── Duplicados entre hojas (se carga uno solo):`);
    duplicados.forEach((d) => console.log(`   • ${d}`));
  }

  const advertencias = servicios.filter((s) => s.advertencias.length);
  if (advertencias.length) {
    console.log(`\n── Advertencias por fila:`);
    advertencias.forEach((s) => s.advertencias.forEach((a) => console.log(`   • ${s.nombreCrudo}: ${a}`)));
  }

  const porVia = (v: Via) => Object.values(mapa).filter((r) => r.via === v);
  console.log(`\n══ Clientes (${Object.keys(mapa).length} distintos en el documento)`);
  console.log(`   ${String(porVia("exacto").length).padStart(3)} match exacto`);
  console.log(`   ${String(porVia("prefijo").length).padStart(3)} match por prefijo:`);
  porVia("prefijo").forEach((r) => console.log(`        "${r.cliente}" → ${r.clienteNexus}`));
  console.log(`   ${String(porVia("crear").length).padStart(3)} se CREAN en Nexus:`);
  porVia("crear").forEach((r) => console.log(`        + ${r.cliente}`));
  const dudosos = porVia("dudoso");
  if (dudosos.length) {
    console.log(`   ${String(dudosos.length).padStart(3)} DUDOSOS — hay que resolverlos a mano:`);
    dudosos.forEach((r) => console.log(`        ? "${r.cliente}" ${r.nota ?? ""}`));
  }

  const cobros = servicios.flatMap((s) => s.cobros);
  const cuenta = (e: string) => cobros.filter((c) => c.estado === e).length;
  console.log(`\n══ A cargar`);
  console.log(`   ${servicios.length} servicios · ${cobros.length} cobros · ${usd(cobros.reduce((a, c) => a + c.monto, 0))} USD`);
  console.log(`   ${cuenta("COBRADO")} cobrados (verde) · ${cuenta("POR_COBRAR")} por cobrar (amarillo) · ${cuenta("PROGRAMADO")} pendientes de facturar (blanco)`);
  const mora = cobros.filter((c) => c.estado === "POR_COBRAR").reduce((a, c) => a + c.monto, 0);
  console.log(`   Facturado sin cobrar: ${usd(mora)}`);
}

// ── 5. Escritura ────────────────────────────────────────────────────────────────

async function aplicar(servicios: ServicioExtraido[], mapa: Mapa) {
  // Una cuenta es INTERNACIONAL si el cliente aparece en alguna hoja internacional
  // (Conectores SAAS mezcla ambos y no alcanza con el default de la hoja).
  const internacional = new Set(
    servicios.filter((s) => s.tipoCuenta === "INTERNACIONAL").map((s) => norm(s.cliente)),
  );

  const porCliente = new Map<string, ServicioExtraido[]>();
  for (const s of servicios) {
    const k = s.cliente;
    porCliente.set(k, [...(porCliente.get(k) ?? []), s]);
  }

  let nClientes = 0;
  let nCuentas = 0;
  let nServicios = 0;
  let nCobros = 0;

  for (const [cliente, lista] of porCliente) {
    const res = mapa[cliente];
    if (!res) throw new Error(`Falta la resolución de "${cliente}" en el mapa.`);

    await prisma.$transaction(async (tx) => {
      const idExternoCliente = `facturaciones-2026:${norm(cliente).replace(/ /g, "-")}`;
      let clientId = res.clientId;
      if (!clientId) {
        // Upsert por procedencia, no create: el mapa es un archivo estático que sigue
        // diciendo "crear" después de la primera corrida, así que un create pelado
        // reventaba contra el unique (source, sourceExternalId) al re-importar.
        const creado = await tx.client.upsert({
          where: { source_sourceExternalId: { source: FUENTE, sourceExternalId: idExternoCliente } },
          create: { name: cliente, source: FUENTE, sourceExternalId: idExternoCliente },
          update: {}, // el nombre puede haberse corregido a mano en Nexus — no se pisa
          select: { id: true },
        });
        clientId = creado.id;
        nClientes++;
      }

      const tipo = internacional.has(norm(cliente)) ? ("INTERNACIONAL" as const) : ("NACIONAL" as const);

      const datosCuenta = {
        tipo,
        moneda: "USD" as const,
        estadoCuenta: "ACTIVA" as const,
        diaCobroAncla: lista[0].diaAncla,
        fuente: FUENTE,
        fuenteIdExterno: idExternoCliente,
        notas: `Cargada del histórico de facturación ${ANIO_FACTURACION} (hoja de Alex).`,
      };

      // 11 clientes ya tenían cuenta, pero VACÍA y en el default de fábrica (CRC,
      // PENDIENTE_DATOS, sin procedencia, 0 cobros): nunca se configuraron. A esas se
      // les completan los datos —si no, quedarían en colones con cobros en dólares—.
      // A cualquier otra NO se le toca nada: puede tener créditoDías, correo de cobro
      // o un estado curado a mano en el panel, y la re-corrida no debe pisarlos.
      const previa = await tx.cuentaFinanciera.findUnique({
        where: { clientId },
        select: { id: true, estadoCuenta: true, fuente: true, _count: { select: { cobros: true } } },
      });
      const sinConfigurar = previa && previa.estadoCuenta === "PENDIENTE_DATOS" && !previa.fuente && previa._count.cobros === 0;
      const cuenta = await tx.cuentaFinanciera.upsert({
        where: { clientId },
        create: { clientId, ...datosCuenta },
        update: sinConfigurar ? datosCuenta : {},
        select: { id: true },
      });
      nCuentas++;

      for (const s of lista) {
        const idExterno = claveServicio(s);
        // `descripcion` guarda el nombre COMPLETO de la fila (con el detalle que el
        // separador " I " mezclaba con el cliente) — es la trazabilidad al documento.
        const existente = await tx.servicioContratado.findFirst({
          where: { cuentaId: cuenta.id, descripcion: { startsWith: `${idExterno} · ` } },
          select: { id: true },
        });
        const datos = {
          cuentaId: cuenta.id,
          tipoServicio: s.tipoServicio,
          modalidad: s.modalidad,
          // Contrato del schema: para lo RECURRENTE el montoTotal es el MENSUAL.
          montoTotal: new Prisma.Decimal(
            s.modalidad === "RECURRENTE" ? (s.montoUniforme ?? s.cobros[0].monto) : s.montoTotal,
          ),
          moneda: "USD" as const,
          fechaInicioFacturacion: s.cobros[0].fecha,
          // Las recurrentes son abiertas (sin fin): duración null, por contrato del schema.
          duracionMeses: s.modalidad === "RECURRENTE" ? null : s.cobros.length,
          estado: "ACTIVO" as const,
          descripcion: `${idExterno} · ${s.nombreCrudo}`,
        };
        const servicio = existente
          ? await tx.servicioContratado.update({ where: { id: existente.id }, data: datos, select: { id: true } })
          : await tx.servicioContratado.create({ data: datos, select: { id: true } });
        nServicios++;

        for (const c of s.cobros) {
          const cobrado = c.estado === "COBRADO";
          const facturado = cobrado || c.estado === "POR_COBRAR";
          const base = {
            cuentaId: cuenta.id,
            periodo: c.periodo,
            fechaProgramada: c.fecha,
            monto: new Prisma.Decimal(c.monto),
            moneda: "USD" as const,
            estado: c.estado,
            origen: "IMPORTACION" as const,
            // El documento NO trae la fecha real de factura ni de pago: se usa la
            // quincena programada. Queda dicho en `notas` — no se disfraza de dato bancario.
            fechaEmision: facturado ? c.fecha : null,
            facturadoPor: facturado ? CONFIRMADO_POR : null,
            facturadoEn: facturado ? c.fecha : null,
            fechaCobro: cobrado ? c.fecha : null,
            confirmadoPor: cobrado ? CONFIRMADO_POR : null, // INV3
            confirmadoEn: cobrado ? c.fecha : null,
            notas: `Histórico ${ANIO_FACTURACION} · hoja "${s.hoja.trim()}" fila ${s.fila}. Fecha tomada de la quincena del documento, no del banco.`,
          };
          // numCuota = orden cronológico → el @@unique([servicioId, numCuota]) hace
          // que re-correr el import actualice en vez de duplicar.
          await tx.cobro.upsert({
            where: { servicioId_numCuota: { servicioId: servicio.id, numCuota: c.orden } },
            create: { servicioId: servicio.id, numCuota: c.orden, ...base },
            update: base,
          });
          nCobros++;
        }
      }
    });
  }

  console.log(`\n✓ Aplicado: ${nClientes} clientes creados · ${nCuentas} cuentas · ${nServicios} servicios · ${nCobros} cobros`);
}

// ── Main ────────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const hojas = await leerDocumento();
    const { servicios: todos, duplicados } = dedupPorHuella(hojas);
    const servicios = SOLO_CLIENTE
      ? todos.filter((s) => s.cliente.toLowerCase().includes(SOLO_CLIENTE))
      : todos;

    const nombres = [...new Set(servicios.map((s) => s.cliente))].sort();
    const guardado = cargarMapa();
    const mapa = guardado ?? (await resolverClientes(servicios, nombres));
    // Un mapa guardado puede quedar corto si el documento suma clientes nuevos.
    const faltantes = nombres.filter((n) => !mapa[n]);
    if (faltantes.length) Object.assign(mapa, await resolverClientes(servicios, faltantes));

    reportar(hojas, servicios, duplicados, mapa);

    if (ESCRIBIR_MAPA) {
      guardarMapa(mapa);
      console.log(`\n✓ Mapa de clientes escrito en ${MAPA_PATH}`);
      console.log(`  Revisá los "dudoso": poné el clientId correcto y via:"exacto", o via:"crear" si es un cliente nuevo.`);
    }

    if (!APPLY) {
      console.log(`\n(dry-run — no se escribió nada. Agregá --apply para cargar.)`);
      return;
    }

    const dudosos = Object.values(mapa).filter((r) => r.via === "dudoso");
    if (dudosos.length) {
      console.error(
        `\n✗ Hay ${dudosos.length} clientes sin resolver. Corré --escribir-mapa, resolvelos en ${MAPA_PATH} y volvé a aplicar.`,
      );
      process.exitCode = 1;
      return;
    }
    await aplicar(servicios, mapa);
  } finally {
    await prisma.$disconnect();
  }
})();
