/**
 * scripts/aplicar-herramientas-mercury.ts — carga en Nexus los gastos de la tarjeta de herramientas de Mercury desde el
 * Excel «Gastos SMARTEAM 2026 por herramientas» (hoja «Detalle»: un cargo por fila). Pedido de Elías, 2026-10-12:
 * «aplica todos los gastos, analiza las suscripciones; ponlos de la primera fecha que aparecen hasta hoy (los que siguen
 * activos; los otros, dados de baja)».
 *
 * ── QUÉ HACE ────────────────────────────────────────────────────────────────────────────────────────────────────────
 *   · Suscripciones → RECURRENTES (Herramientas), con su historia desde el primer cargo:
 *       ALTA en el primer cargo, con lo que costó ese mes;
 *       CAMBIO_MONTO cada mes cuyo total se aleja del vigente más de 2% y de US$1 (los de uso —HubSpot, Claude, AWS,
 *       Google Workspace, Miro— cambian casi todos los meses: es lo que costaron);
 *       el mes en curso solo sube el precio si ya va por encima (octubre todavía no cierra);
 *       BAJA en el último cargo si ya no cobra (mensual: más de 45 días sin cargo; anual: más de 380); en una que se dio
 *       de baja, un último mes MÁS BAJO es el cobro prorrateado del cierre (ClickUp: US$8,58) y no cambia el precio.
 *     Los que ya existen en Nexus se actualizan (precio de hoy y, si corresponde, la baja); los que no, se crean.
 *   · Publicidad, trámites y comisiones del banco → GASTOS del mes, uno por cargo, con su etiqueta.
 *
 * ⛔ La historia es de solo agregar: no se borra ningún movimiento de antes (los del 12 de julio y del 16 de agosto
 * quedan, con su usuario). Antes de octubre el punto de equilibrio sigue leyendo el Excel de egresos de Alex
 * (`EGRESOS_DESDE_NEXUS`): esto no cuenta dos veces lo pasado. Desde octubre cuentan estos recurrentes y gastos.
 * Re-correrlo no duplica: lo ya cargado por este script (`ORIGEN`) se salta.
 *
 * DRY-RUN por default. Con `--apply` + ALLOW_PROD_WRITE=1 guarda antes una copia (JSON en backups/) de los recurrentes
 * que toca, con su historia.
 *
 * Uso (En tu PC, PowerShell):
 *   npx tsx scripts/aplicar-herramientas-mercury.ts --file="C:\Users\ideli\Downloads\Gastos_SMARTEAM_2026_por_herramientas - Mercury Bank (1).xlsx"
 *   $env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/aplicar-herramientas-mercury.ts --file="…" --apply
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

const ORIGEN = "import:herramientas-mercury-2026-10";
const NOTA = "Según los cargos de la tarjeta de herramientas de Mercury (Excel de herramientas, 12-oct-2026).";

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const FILE = opt("file");
const HOY = opt("hoy") ?? new Date().toISOString().slice(0, 10);

/** Cada herramienta del Excel → su recurrente en Nexus (el nombre como está hoy) o uno nuevo. */
const SUSCRIPCIONES: Record<string, { nexus: string; nuevo?: true; frecuencia: "MENSUAL" | "ANUAL" }> = {
  Hubspot: { nexus: "HubSpot", frecuencia: "MENSUAL" },
  Anthropic: { nexus: "Claude (licencia Elías)", frecuencia: "MENSUAL" },
  ClickUp: { nexus: "Click Up", frecuencia: "MENSUAL" },
  "Google Workspace": { nexus: "Google Gsuite", frecuencia: "MENSUAL" },
  "Amazon Web Services": { nexus: "AWS", frecuencia: "MENSUAL" },
  Miro: { nexus: "Miro", frecuencia: "MENSUAL" },
  "1Password": { nexus: "1Password", frecuencia: "MENSUAL" },
  Hostinger: { nexus: "Hostinger", frecuencia: "ANUAL" },
  Apollo: { nexus: "Apollo", frecuencia: "MENSUAL" },
  OpenAI: { nexus: "Chat GPT", frecuencia: "MENSUAL" },
  Adobe: { nexus: "Adobe", nuevo: true, frecuencia: "MENSUAL" },
  Supabase: { nexus: "SUPA BASE", frecuencia: "MENSUAL" },
  "Elegant Themes": { nexus: "DIVI", frecuencia: "ANUAL" },
  Magnific: { nexus: "Freepik I Magnific", frecuencia: "MENSUAL" },
  Atlassian: { nexus: "Atlassian", nuevo: true, frecuencia: "MENSUAL" },
  CapCut: { nexus: "Cap Cut", frecuencia: "MENSUAL" },
  Userback: { nexus: "Userback.io", frecuencia: "MENSUAL" },
  Canva: { nexus: "Canva", frecuencia: "MENSUAL" },
  Ubersuggest: { nexus: "Ubersuggest", frecuencia: "MENSUAL" },
  SendinBlue: { nexus: "SendinBlue", nuevo: true, frecuencia: "MENSUAL" },
};

/** Lo que no es suscripción: un gasto del mes por cargo, con su etiqueta. */
const GASTOS: Record<string, string> = {
  "Facebook / Meta Ads": "publicidad",
  "Google Ads": "publicidad",
  LinkedIn: "publicidad",
  "E Commerce Portal": "tramites",
  "Comisión transacción internacional": "comisiones bancarias",
};

interface Cargo {
  fecha: string;
  mes: string;
  herramienta: string;
  monto: number;
  estado: string;
}

type Mov = { tipo: "ALTA" | "CAMBIO_MONTO" | "BAJA"; fecha: string; monto: number; montoAnterior: number | null };

function salir(msg: string): never {
  console.error(`⛔ ${msg}`);
  process.exit(1);
}

async function leerDetalle(ruta: string): Promise<Cargo[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hoja = libro.getWorksheet("Detalle");
  if (!hoja) salir("El libro no tiene la hoja «Detalle».");
  const cargos: Cargo[] = [];
  hoja.eachRow((row, n) => {
    if (n === 1) return;
    const f = row.getCell(1).value;
    const fecha = f instanceof Date ? f.toISOString().slice(0, 10) : null;
    const herramienta = String(row.getCell(3).text ?? "").trim();
    const monto = Number(row.getCell(5).value);
    if (!fecha || !herramienta || !Number.isFinite(monto)) return;
    cargos.push({ fecha, mes: fecha.slice(0, 7), herramienta, monto: Math.round(monto * 100) / 100, estado: String(row.getCell(6).text ?? "") });
  });
  return cargos;
}

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** La historia de una suscripción a partir de sus cargos (ver la cabecera). */
export function historiaDe(cargos: Cargo[], frecuencia: "MENSUAL" | "ANUAL", hoy: string): { movs: Mov[]; monto: number; baja: string | null } {
  const orden = [...cargos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porMes = new Map<string, { primero: string; total: number }>();
  for (const c of orden) {
    const m = porMes.get(c.mes) ?? { primero: c.fecha, total: 0 };
    m.total = r2(m.total + c.monto);
    porMes.set(c.mes, m);
  }
  const mesHoy = hoy.slice(0, 7);
  const ultimo = orden[orden.length - 1]!.fecha;
  const sigue = dias(ultimo, hoy) <= (frecuencia === "ANUAL" ? 380 : 45);
  const movs: Mov[] = [];
  let vigente: number | null = null;
  for (const [mes, { primero, total }] of porMes) {
    if (vigente === null) {
      movs.push({ tipo: "ALTA", fecha: primero, monto: total, montoAnterior: null });
      vigente = total;
      continue;
    }
    const cambia = Math.abs(total - vigente) > Math.max(1, vigente * 0.02);
    // El mes en curso todavía no cierra: solo sube el precio si ya va por encima. Y en una que se dio de baja, el último
    // mes más bajo es el prorrateo del cierre, no un precio nuevo.
    if (!cambia || (mes === mesHoy && total < vigente) || (!sigue && mes === ultimo.slice(0, 7) && total < vigente)) continue;
    movs.push({ tipo: "CAMBIO_MONTO", fecha: primero, monto: total, montoAnterior: vigente });
    vigente = total;
  }
  const baja = sigue ? null : ultimo;
  if (baja) movs.push({ tipo: "BAJA", fecha: baja, monto: vigente!, montoAnterior: null });
  return { movs, monto: vigente!, baja };
}

const usd = (n: number) => `US$${n.toFixed(2)}`;

async function main() {
  if (!FILE) salir("Falta --file=<ruta del Excel de herramientas>.");
  const ruta = path.resolve(FILE);
  if (!fs.existsSync(ruta)) salir(`No existe ${ruta}.`);
  const cargos = await leerDetalle(ruta);
  const total = r2(cargos.reduce((n, c) => n + c.monto, 0));
  console.log(`Archivo: ${path.basename(ruta)} · ${cargos.length} cargos · ${usd(total)} · hoy ${HOY}`);

  const sinDestino = [...new Set(cargos.map((c) => c.herramienta))].filter((h) => !SUSCRIPCIONES[h] && !GASTOS[h]);
  if (sinDestino.length) salir(`Herramientas del Excel sin destino en este script: ${sinDestino.join(", ")}. Agrégalas arriba.`);

  const APPLY = resolverApply({ tablas: ["CostoRecurrente", "CostoMovimiento", "GastoPuntual"] });
  const { prisma, close } = createScriptDb();
  try {
    const nombres = Object.values(SUSCRIPCIONES).map((s) => s.nexus);
    const existentes = await prisma.costoRecurrente.findMany({
      where: { nombre: { in: nombres } },
      include: { movimientos: { orderBy: { createdAt: "asc" } } },
    });
    const porNombre = new Map(existentes.map((c) => [c.nombre, c]));

    // ── Plan de recurrentes ──
    console.log("\nRECURRENTES (Herramientas)");
    const plan: Array<{ excel: string; destino: (typeof SUSCRIPCIONES)[string]; movs: Mov[]; monto: number; baja: string | null; ya: boolean }> = [];
    for (const [excel, destino] of Object.entries(SUSCRIPCIONES)) {
      const suyos = cargos.filter((c) => c.herramienta === excel);
      if (suyos.length === 0) continue;
      const { movs, monto, baja } = historiaDe(suyos, destino.frecuencia, HOY);
      const fila = porNombre.get(destino.nexus);
      if (!fila && !destino.nuevo) salir(`No encontré el recurrente «${destino.nexus}» en Nexus.`);
      const ya = !!fila?.movimientos.some((m) => m.usuarioEmail === ORIGEN);
      plan.push({ excel, destino, movs, monto, baja, ya });
      const antes = fila ? `hoy en Nexus ${usd(Number(fila.monto))}${fila.finalizadoEl ? " (de baja)" : ""}` : "NUEVO";
      console.log(
        `  ${destino.nexus.padEnd(24)} ${antes.padEnd(28)} → ${baja ? `de BAJA el ${baja}` : `activo, ${usd(monto)} ${destino.frecuencia === "ANUAL" ? "al año" : "al mes"}`}` +
          `${ya ? "  (ya cargado: se salta)" : ""}`,
      );
      console.log(`      ${movs.map((m) => `${m.tipo === "ALTA" ? "alta" : m.tipo === "BAJA" ? "baja" : "cambio"} ${m.fecha} ${usd(m.monto)}`).join(" · ")}`);
    }

    // ── Plan de gastos ──
    const gastos = cargos.filter((c) => GASTOS[c.herramienta]);
    const previos = await prisma.gastoPuntual.findMany({ where: { registradoPor: ORIGEN }, select: { nombre: true, fecha: true, monto: true } });
    const yaEsta = new Set(previos.map((g) => `${g.nombre}|${g.fecha.toISOString().slice(0, 10)}|${Number(g.monto).toFixed(2)}`));
    console.log(`\nGASTOS DEL MES (${gastos.length})`);
    for (const g of gastos) {
      const k = `${g.herramienta}|${g.fecha}|${g.monto.toFixed(2)}`;
      console.log(`  ${g.fecha} ${g.herramienta.padEnd(36)} ${usd(g.monto).padStart(10)}  #${GASTOS[g.herramienta]}${yaEsta.has(k) ? "  (ya cargado)" : ""}`);
    }

    if (!APPLY) {
      console.log("\nEn seco: no se escribió nada. Para aplicarlo, agrega --apply (con ALLOW_PROD_WRITE=1).");
      return;
    }

    // Copia de lo que se toca, antes de escribir.
    const dir = path.join("backups", `${HOY}-aplicar-herramientas-mercury`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "recurrentes-antes.json"), JSON.stringify(existentes, null, 2));
    console.log(`\nCopia de los recurrentes de antes: ${path.join(dir, "recurrentes-antes.json")}`);

    let movsEscritos = 0;
    let creados = 0;
    let actualizados = 0;
    for (const p of plan) {
      if (p.ya) continue;
      const fila = porNombre.get(p.destino.nexus);
      await prisma.$transaction(async (tx) => {
        const costo = fila
          ? await tx.costoRecurrente.update({
              where: { id: fila.id },
              data: {
                monto: p.monto,
                frecuencia: p.destino.frecuencia,
                finalizadoEl: p.baja ? new Date(`${p.baja}T00:00:00Z`) : null,
              },
            })
          : await tx.costoRecurrente.create({
              data: {
                categoria: "HERRAMIENTA",
                nombre: p.destino.nexus,
                monto: p.monto,
                moneda: "USD",
                frecuencia: p.destino.frecuencia,
                activo: true,
                notas: NOTA,
                finalizadoEl: p.baja ? new Date(`${p.baja}T00:00:00Z`) : null,
              },
            });
        if (fila) actualizados++;
        else creados++;
        for (const m of p.movs) {
          await tx.costoMovimiento.create({
            data: {
              costoId: costo.id,
              tipo: m.tipo,
              nombre: costo.nombre,
              categoria: costo.categoria,
              moneda: costo.moneda,
              frecuencia: p.destino.frecuencia,
              monto: m.monto,
              montoAnterior: m.montoAnterior,
              fechaEfectiva: new Date(`${m.fecha}T00:00:00Z`),
              usuarioEmail: ORIGEN,
              notas: NOTA,
            },
          });
          movsEscritos++;
        }
      });
    }

    let gastosCreados = 0;
    for (const g of gastos) {
      if (yaEsta.has(`${g.herramienta}|${g.fecha}|${g.monto.toFixed(2)}`)) continue;
      await prisma.gastoPuntual.create({
        data: {
          nombre: g.herramienta,
          monto: g.monto,
          moneda: "USD",
          fecha: new Date(`${g.fecha}T00:00:00Z`),
          tags: [GASTOS[g.herramienta]!],
          notas: `Cargo de la tarjeta de Mercury${g.estado && g.estado !== "Pagado" ? ` (${g.estado.toLowerCase()})` : ""}. ${NOTA}`,
          registradoPor: ORIGEN,
        },
      });
      gastosCreados++;
    }
    console.log(`\nEscrito: ${actualizados} recurrentes actualizados · ${creados} nuevos · ${movsEscritos} movimientos · ${gastosCreados} gastos.`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
