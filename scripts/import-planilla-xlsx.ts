/**
 * scripts/import-planilla-xlsx.ts
 *
 * Siembra el HISTÓRICO del libro de planilla desde la hoja "Pretensión de
 * Aguinaldos" del Excel de egresos, que es la única fuente del archivo que tiene
 * la HISTORIA y no solo la foto de hoy: 12 personas con su salario mes a mes,
 * de diciembre del año anterior a noviembre del año en curso.
 *
 * DRY-RUN por defecto: sin `--apply` no escribe absolutamente nada.
 *
 * ⚠ DOS GATES, no uno:
 *   1. `--apply`   → el guard anti-prod (INV12) imprime el destino y exige ALLOW_PROD_WRITE=1.
 *   2. `--anio=YYYY` → el archivo NO dice de qué año es. Sin que una persona lo
 *      escriba, no se siembra nada. La hoja arranca en DICIEMBRE del año ANTERIOR.
 *
 * ⚠ TRES REGLAS DE HONESTIDAD, que son la razón de que este script exista en vez
 * de un INSERT a mano:
 *
 *  1. **Solo se siembra lo que YA PASÓ.** La hoja llega hasta noviembre; marcar
 *     PAGADO un mes que no ocurrió sería fabricar. Las quincenas futuras no se
 *     crean — las genera el flujo normal cuando toque.
 *  2. **La fecha es la QUINCENA, no dato bancario.** El archivo no trae la fecha
 *     real en que salió la plata. Decisión de Elías (mismo precedente que la
 *     carga de facturaciones): se usa la quincena y cada fila lo DICE en sus
 *     notas. `confirmadoPor = "import:planilla-<anio>"` — un identificador de
 *     import auditable, no un humano falso (INV18 exige no-null).
 *  3. **Una persona que no matchea NO se adivina.** Se reporta y se deja afuera.
 *     El `@@unique` del libro lleva la persona; sembrar sin ella crearía filas
 *     repetidas en cada corrida.
 *
 * Uso:
 *   npx tsx scripts/import-planilla-xlsx.ts --file="C:/ruta/al.xlsx"
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/import-planilla-xlsx.ts --anio=2026 --apply
 */
import ExcelJS from "exceljs";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import { leerHistorialSalarios, type CeldaCruda, type FilaCruda } from "../lib/cobranza/egresos-sheet";
import { montoQuincena } from "../lib/cobranza/engine";
import { quincenasDelPeriodo } from "../lib/cobranza/planilla";
import { crDateParts } from "../lib/jobs/time";

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;

const FILE = opt("file") ?? "C:/Users/ideli/Downloads/Copia de Egresos y Costos de Smarteam para Nexus.xlsx";
const ANIO = opt("anio");
const APPLY = resolverApply();

const HOJA = "Pretensión de Aguinaldos";
/**
 * Columnas 3..14 de la hoja, verificado leyendo la fila 4 de encabezados:
 * C = DICIEMBRE (del año ANTERIOR), D = ENERO … N = NOVIEMBRE.
 */
const COLUMNAS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Los salarios en Nexus se llaman "Nombre · Puesto"; la hoja trae solo el nombre. */
const clavePersona = (nombre: string) => norm(nombre.split("·")[0] ?? nombre);

const fmt = (m: number, moneda: string) =>
  `${moneda === "CRC" ? "₡" : "$"}${m.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;

function celdasDe(row: ExcelJS.Row, ancho: number): CeldaCruda[] {
  const out: CeldaCruda[] = [];
  for (let i = 1; i <= ancho; i++) {
    const cell = row.getCell(i);
    out.push({ valor: cell.value, numFmt: cell.numFmt });
  }
  return out;
}

function seccion(t: string) {
  console.log(`\n${"─".repeat(76)}\n${t}\n${"─".repeat(76)}`);
}

/** La columna N de la hoja → el período "YYYY-MM". C = diciembre del año ANTERIOR. */
function periodoDeColumna(col: number, anio: number): string {
  const i = COLUMNAS.indexOf(col); // 0 = diciembre del año anterior
  if (i < 0) return "";
  if (i === 0) return `${anio - 1}-12`;
  return `${anio}-${String(i).padStart(2, "0")}`;
}

(async () => {
  const { prisma, close } = createScriptDb();
  try {
    if (!ANIO || !/^\d{4}$/.test(ANIO)) {
      console.error(
        `\n✗ Falta --anio=YYYY. El archivo NO dice de qué año es, y la hoja arranca en DICIEMBRE del año ANTERIOR: sin que una persona lo escriba, no se siembra.`,
      );
      process.exitCode = 1;
      return;
    }
    const anio = Number(ANIO);
    const hoyISO = crDateParts(new Date()).dateKey;

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(FILE);
    const ws = wb.getWorksheet(HOJA);
    if (!ws) throw new Error(`No encuentro la pestaña "${HOJA}"`);

    const filas: FilaCruda[] = [];
    ws.eachRow({ includeEmpty: false }, (row, fila) => {
      if (fila >= 6) filas.push({ fila, celdas: celdasDe(row, 16) });
    });
    const historial = leerHistorialSalarios(filas, COLUMNAS);

    seccion(`1. LA HOJA "${HOJA}" (año declarado: ${anio})`);
    console.log(`  ${historial.length} personas con salario mes a mes (dic ${anio - 1} → nov ${anio}).`);
    console.log(`  Hoy es ${hoyISO}: solo se siembran las quincenas que YA PASARON.`);

    // ── 2. Matcheo persona ↔ TeamMember ────────────────────────────────────────
    const equipo = await prisma.teamMember.findMany({ select: { id: true, name: true } });
    const porClave = new Map(equipo.map((t) => [clavePersona(t.name), t]));

    // La moneda del salario que ya está en Nexus sirve de CONTRASTE: si la hoja
    // y el costo no coinciden, algo se está leyendo mal y hay que mirarlo.
    const salarios = await prisma.costoRecurrente.findMany({
      where: { categoria: "SALARIO", teamMemberId: { not: null } },
      select: { teamMemberId: true, moneda: true },
    });
    const monedaDelCosto = new Map(salarios.map((s) => [s.teamMemberId!, s.moneda]));

    type Deseada = {
      teamMemberId: string;
      nombre: string;
      periodo: string;
      quincena: 1 | 2;
      fechaProgramada: string;
      monto: number;
      moneda: string;
    };

    const deseadas: Deseada[] = [];
    const sinPersona: string[] = [];
    const desacuerdoMoneda: string[] = [];
    const sospechosos: string[] = [];
    const futuras: string[] = [];

    for (const h of historial) {
      const persona = porClave.get(clavePersona(h.nombre));
      if (!persona) {
        sinPersona.push(h.nombre);
        continue;
      }

      const monedaCosto = monedaDelCosto.get(persona.id);
      if (monedaCosto && monedaCosto !== h.moneda) {
        desacuerdoMoneda.push(`${h.nombre}: la hoja dice ${h.moneda} y su salario en Nexus ${monedaCosto}`);
        continue;
      }
      const moneda = monedaCosto ?? h.moneda;

      // Un mes en CERO es dato: la persona no estaba. Un monto ABSURDAMENTE chico
      // no es ninguna de las dos cosas — es un dedazo (Alejandro Salas tiene un
      // "1" en diciembre donde van ₡900.000). Se reporta y se salta ese mes:
      // sembrarlo crearía dos quincenas de medio colón.
      const maximo = Math.max(...h.meses.map((m) => m.monto), 0);

      for (const mes of h.meses) {
        if (mes.monto <= 0) continue;
        if (maximo > 0 && mes.monto < maximo * 0.01) {
          sospechosos.push(
            `${h.nombre} · ${periodoDeColumna(mes.col, anio)}: ${fmt(mes.monto, moneda)} contra un máximo de ${fmt(maximo, moneda)}`,
          );
          continue;
        }
        const periodo = periodoDeColumna(mes.col, anio);
        if (!periodo) continue;

        for (const q of quincenasDelPeriodo(periodo)) {
          if (q.fechaProgramada > hoyISO) {
            futuras.push(`${h.nombre} · ${periodo} Q${q.quincena}`);
            continue;
          }
          deseadas.push({
            teamMemberId: persona.id,
            nombre: persona.name,
            periodo,
            quincena: q.quincena,
            fechaProgramada: q.fechaProgramada,
            monto: montoQuincena(mes.monto, q.quincena),
            moneda,
          });
        }
      }
    }

    seccion("2. LO QUE SE SEMBRARÍA");
    const porPersona = new Map<string, Deseada[]>();
    for (const d of deseadas) {
      const l = porPersona.get(d.nombre);
      if (l) l.push(d);
      else porPersona.set(d.nombre, [d]);
    }
    for (const [nombre, lista] of [...porPersona].sort((a, b) => a[0].localeCompare(b[0]))) {
      const total = lista.reduce((a, d) => a + d.monto, 0);
      console.log(
        `    · ${nombre.padEnd(26)} ${String(lista.length).padStart(2)} quincenas · ${fmt(total, lista[0]!.moneda)} en total`,
      );
    }
    console.log(`\n  TOTAL: ${deseadas.length} quincenas de ${porPersona.size} personas.`);

    if (futuras.length > 0) {
      console.log(`\n  NO se siembran (${futuras.length}) — su fecha todavía no llegó:`);
      console.log(`    ${[...new Set(futuras.map((f) => f.split(" · ")[1]))].join(", ")}`);
      console.log(`    Marcar PAGADO un mes que no ocurrió sería fabricar. Las genera el flujo normal.`);
    }
    if (sospechosos.length > 0) {
      console.log(`\n  ⚠ MESES SALTEADOS (${sospechosos.length}) — el monto no parece un salario:`);
      for (const s of sospechosos) console.log(`    ? ${s}`);
      console.log(`    Si el dato es real, corregí la hoja y volvé a correr.`);
    }
    if (desacuerdoMoneda.length > 0) {
      console.log(`\n  ⚠ MONEDA EN DESACUERDO (${desacuerdoMoneda.length}) — se dejan AFUERA enteras:`);
      for (const d of desacuerdoMoneda) console.log(`    ? ${d}`);
    }
    if (sinPersona.length > 0) {
      console.log(`\n  ⚠ SIN PERSONA EN NEXUS (${sinPersona.length}) — no se adivinan:`);
      for (const s of sinPersona) console.log(`    ? ${s}`);
      console.log(`    El libro lleva la persona en su clave única; sin ella se duplicarían en cada corrida.`);
    }

    // ── 3. Qué hay ya en el libro ──────────────────────────────────────────────
    const yaEnLibro = await prisma.pagoPlanilla.count();
    console.log(`\n  El libro tiene hoy ${yaEnLibro} quincena(s). La siembra es CREATE-ONLY: lo que ya está no se toca.`);

    if (!APPLY) {
      console.log(`\n(dry-run — no se escribió nada. Agregá --apply para sembrar.)`);
      return;
    }

    seccion(`3. SEMBRANDO`);
    const CONFIRMADO_POR = `import:planilla-${anio}`;
    const res = await prisma.pagoPlanilla.createMany({
      data: deseadas.map((d) => ({
        sujetoTeamMemberId: d.teamMemberId,
        sujetoNombre: d.nombre,
        periodo: d.periodo,
        quincena: d.quincena,
        fechaProgramada: new Date(`${d.fechaProgramada}T00:00:00.000Z`),
        monto: d.monto,
        moneda: d.moneda as "CRC" | "USD",
        estado: "PAGADO" as const,
        // La fecha de la QUINCENA, no dato bancario. Queda dicho en las notas.
        fechaPago: new Date(`${d.fechaProgramada}T00:00:00.000Z`),
        confirmadoPor: CONFIRMADO_POR,
        confirmadoEn: new Date(`${d.fechaProgramada}T00:00:00.000Z`),
        notas: `Histórico ${anio} · hoja "${HOJA}". La fecha es la quincena del documento, no la fecha real en que salió la plata.`,
      })),
      skipDuplicates: true,
    });

    console.log(`  ✓ ${res.count} quincenas sembradas · ${deseadas.length - res.count} ya existían.`);
    console.log(`  Recordá recargar la hoja del libro (no cambió el schema, no hace falta reiniciar el dev).`);
  } finally {
    await close();
  }
})().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
