/**
 * scripts/import-egresos-xlsx.ts
 *
 * Reconcilia los costos de Nexus contra el Excel de egresos de Alex
 * ("Copia de Egresos y Costos de Smarteam para Nexus.xlsx").
 *
 * DRY-RUN por defecto: sin `--apply` no escribe absolutamente nada. Imprime, fila
 * por fila, qué cambiaría — y las preguntas que el archivo NO contesta, para que
 * Elías las conteste ANTES de que nada toque la base.
 *
 * Decisión de Elías: **el Excel manda**. Con un matiz que este script aplica igual:
 * lo que está en Nexus y NO en el Excel **no se borra, se da de BAJA**
 * (`finalizadoEl` + movimiento BAJA). Es reversible y deja huella; el hard delete
 * perdería justamente la historia que `CostoMovimiento` existe para guardar.
 *
 * ⚠ DOS GATES, no uno:
 *   1. `--apply`   → el guard anti-prod (INV12) imprime el destino y exige ALLOW_PROD_WRITE=1.
 *   2. `--anio=YYYY` → el archivo NO dice de qué año es, en ninguna hoja ni en la
 *      metadata. Sin que una persona lo escriba, no se siembra nada.
 *
 * Uso:
 *   npx tsx scripts/import-egresos-xlsx.ts --file="C:/ruta/al.xlsx"
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/import-egresos-xlsx.ts --file=... --anio=2026 --apply
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import {
  filasDelBloque,
  leerCostosFijos,
  leerHerramientas,
  leerHistorialSalarios,
  leerSalarios,
  motivoParaNoCargar,
  type CeldaCruda,
  type FilaCruda,
  type Herramienta,
  type Moneda,
  type Salario,
} from "../lib/cobranza/egresos-sheet";

const argv = process.argv.slice(2);
const opt = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;

const FILE = opt("file") ?? "C:/Users/ideli/Downloads/Copia de Egresos y Costos de Smarteam para Nexus.xlsx";
const ANIO = opt("anio");
const APPLY = resolverApply();
const ESCRIBIR_MAPA = argv.includes("--escribir-mapa");
const POR = "import:egresos-2026";

/**
 * Resolución HUMANA de los nombres dudosos, versionada en el repo — mismo ciclo que
 * `scripts/data/facturaciones-clientes.json`: dry-run → `--escribir-mapa` → una
 * persona decide → commit del JSON → `--apply`.
 */
const MAPA_PATH = "scripts/data/egresos-costos.json";
type Resolucion = {
  accion: "crear" | "renombrar";
  costoId?: string;
  /**
   * Con qué nombre queda la fila tras el rename. Sin esto el rename escribe
   * SIEMPRE el nombre del Excel — y a veces el Excel es el que tiene el typo
   * ("Hostiger" contra el "Hostinger" correcto que ya está en Nexus). Quién
   * gana lo decide la persona que resuelve el dudoso, no el archivo.
   */
  nombreFinal?: string;
  nota?: string;
};
const mapa: Record<string, Resolucion> = existsSync(MAPA_PATH)
  ? (JSON.parse(readFileSync(MAPA_PATH, "utf8")) as Record<string, Resolucion>)
  : {};

const HOJA_FIJOS = "Costos Fijos";
const HOJA_TOOLS = "Costo de Herramientas";
const HOJA_SALARIOS = "Salarios Actuales";
const HOJA_HISTORIAL = "Pretensión de Aguinaldos";

/**
 * Las preguntas que el archivo NO contesta. Se imprimen SIEMPRE, aplique o no.
 *
 * Resueltas por Elías el 2026-08-15 (por eso ya NO están acá): la hoja completa
 * de Costos Fijos está en dólares (incluida la Póliza de 51); Patente es un
 * mensual con recargo trimestral de bienes inmuebles (no un trimestral mal
 * modelado); las comisiones de Randall se dejaron de pagar en febrero (por eso
 * se excluyen de la carga, no importa qué signifique el 13%).
 */
const PREGUNTAS_ABIERTAS = [
  "¿De qué AÑO es este archivo? No consta en ninguna hoja ni en la metadata (por eso --anio es obligatorio).",
  "Contabilidad SV: ¿qué es el componente 969,73 del bloque vivo? En marzo (bloque oculto) el mismo concepto valía 344,65.",
  "Claude: no tiene importe en ninguna de las dos fuentes de la hoja de herramientas.",
];

// ── Lectura (la única parte que conoce exceljs) ─────────────────────────────────

/**
 * Convierte una fila de exceljs a celdas planas, RESOLVIENDO las fórmulas
 * compartidas.
 *
 * ⚠ Sin esto el decodificador ve `{sharedFormula:"K8"}` —una referencia a otra
 * celda— y descarta ocho de cada nueve meses SIN UN SOLO ERROR. En esta hoja casi
 * todo está compartido a lo ancho del bloque (`ref:"K8:S8"`), así que el bug se
 * llevaría casi todos los costos fijos.
 */
function celdasDe(ws: ExcelJS.Worksheet, row: ExcelJS.Row, ancho: number): CeldaCruda[] {
  const out: CeldaCruda[] = [];
  for (let i = 1; i <= ancho; i++) {
    const cell = row.getCell(i);
    let valor = cell.value;
    const v = valor as { sharedFormula?: string; formula?: string; result?: unknown } | null;
    if (v && typeof v === "object" && typeof v.sharedFormula === "string" && !v.formula) {
      const ancla = ws.getCell(v.sharedFormula).value as { formula?: string } | null;
      const texto = ancla && typeof ancla === "object" ? ancla.formula : undefined;
      if (typeof texto === "string") valor = { formula: texto, result: v.result } as ExcelJS.CellValue;
    }
    out.push({ valor, numFmt: cell.numFmt });
  }
  return out;
}

function filasDe(ws: ExcelJS.Worksheet, ancho: number): FilaCruda[] {
  const out: FilaCruda[] = [];
  ws.eachRow({ includeEmpty: false }, (row, fila) => out.push({ fila, celdas: celdasDe(ws, row, ancho) }));
  return out;
}

/** Columnas VISIBLES de un rango. El bloque viejo de la hoja está OCULTO a propósito. */
function columnasVisibles(ws: ExcelJS.Worksheet, desde: number, hasta: number): number[] {
  const out: number[] = [];
  for (let c = desde; c <= hasta; c++) if (!ws.getColumn(c).hidden) out.push(c);
  return out;
}

// ── Normalización de nombres (el matcheo Excel ↔ Nexus) ─────────────────────────

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Los salarios en Nexus se llaman "Nombre · Puesto"; el Excel trae solo el nombre. */
const clavePersona = (nombre: string) => norm(nombre.split("·")[0] ?? nombre);

/**
 * ¿Dos claves normalizadas son plausiblemente LA MISMA COSA? Deliberadamente
 * laxa, porque los dos usos que tiene fallan del lado seguro: marcar un DUDOSO
 * de más obliga a que una persona decida (nunca duplica solo), y proteger de más
 * deja una fila viva (nunca la da de baja por error). El Excel escribe
 * "Hostiger" donde Nexus tiene "Hostinger", y "Claude" donde tiene
 * "Claude (licencia Elías)". Una sola definición para los dos usos: si divergen,
 * una fila puede ser dudosa para un lado y no para el otro.
 */
const seParecen = (a0: string, b0: string): boolean => {
  const a = a0.replace(/[^a-z0-9]/g, "");
  const b = b0.replace(/[^a-z0-9]/g, "");
  if (a === b) return true;
  const corto = a.length <= b.length ? a : b;
  const largo = a.length <= b.length ? b : a;
  if (corto.length < 5) return false;
  return largo.startsWith(corto) || largo.includes(corto) || corto.slice(0, 5) === largo.slice(0, 5);
};

const fmt = (m: number, moneda: Moneda) =>
  `${moneda === "CRC" ? "₡" : "$"}${m.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;

// ── Reporte ─────────────────────────────────────────────────────────────────────

type Deseado = {
  clave: string;
  nombre: string;
  categoria: "SALARIO" | "HERRAMIENTA" | "FIJO_OPERACION";
  monto: number;
  moneda: Moneda;
  frecuencia: "MENSUAL" | "ANUAL";
  notas: string;
};

type Existente = {
  id: string;
  clave: string;
  nombre: string;
  categoria: string;
  monto: number;
  moneda: string;
  frecuencia: string;
  activo: boolean;
  finalizadoEl: Date | null;
};

function seccion(t: string) {
  console.log(`\n${"─".repeat(76)}\n${t}\n${"─".repeat(76)}`);
}

function reportarDescartes(titulo: string, filas: Array<{ nombre: string; motivo: string }>) {
  if (filas.length === 0) return;
  console.log(`\n  ${titulo}`);
  for (const f of filas) console.log(`    · ${f.nombre.padEnd(36)} ${f.motivo}`);
}

// ── Main ────────────────────────────────────────────────────────────────────────

(async () => {
  const { prisma, close } = createScriptDb();
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(FILE);

    // ── 1. Costos fijos ────────────────────────────────────────────────────────
    const wsFijos = wb.getWorksheet(HOJA_FIJOS);
    if (!wsFijos) throw new Error(`No encuentro la pestaña "${HOJA_FIJOS}"`);
    const colsFijos = columnasVisibles(wsFijos, 2, 19);
    const filasFijos = filasDe(wsFijos, 22);
    // ⚠ El ancla es "Gastos Fijos" y NO "Mes": la hoja tiene DOS bloques y los dos
    // abren con una fila "Mes". Anclar en "Mes" agarraba el bloque de TARJETAS
    // (arriba) y devolvía cero costos fijos, en silencio.
    const bloqueFijos = filasDelBloque(filasFijos, /^Gastos Fijos$/i, /^TOTAL/i).filter(
      (f) => !/^Mes$/i.test(String((f.celdas[0]?.valor ?? "")).trim()),
    );
    const conceptos = leerCostosFijos(bloqueFijos, colsFijos);

    // El bloque de arriba es la TARJETA de crédito: no es un costo fijo suelto —
    // es alimento de F1. Cargarlo acá duplicaría lo que ya cobran las herramientas.
    const bloqueTarjetas = filasDelBloque(filasFijos, /^Mes$/i, /^TOTAL/i);
    const tarjetas = leerCostosFijos(bloqueTarjetas, colsFijos);

    seccion(`1. COSTOS FIJOS — hoja "${HOJA_FIJOS}"`);
    console.log(`  Columnas visibles del bloque vivo: ${colsFijos.length}`);
    console.log(`  Columnas OCULTAS descartadas: ${18 - colsFijos.length} (bloque viejo, totales en #REF!)`);

    const fijosCargables: Deseado[] = [];
    const fijosDescartados: Array<{ nombre: string; motivo: string }> = [];
    /**
     * Claves que el Excel NOMBRA pero cuyo monto no se pudo leer. NO son bajas:
     * una celda vacía dice "no sé cuánto", no "ya no se paga" — y darle de baja
     * a la licencia de Claude porque Alex no llenó su importe sería inventar un
     * hecho que el archivo nunca afirmó. Lo que SÍ justifica una baja es que el
     * concepto no aparezca en la hoja, o que la hoja lo muestre terminado (cae
     * en ceros), que es una afirmación de verdad.
     */
    const clavesProtegidas = new Set<string>();
    for (const c of conceptos) {
      const clave = norm(c.nombre);

      // Comisión de vendedor disfrazada de costo fijo: la fórmula sigue viva en
      // la hoja pero Elías confirmó que se dejó de pagar en febrero — antes de
      // que arranque el bloque vivo (abril en adelante). Por diseño va a F3
      // (comisiones de vendedor), nunca a costos fijos.
      if (clave.includes("randall")) {
        fijosDescartados.push({
          nombre: c.nombre,
          motivo: "comisión de vendedor, dejó de pagarse en febrero (confirmado) — va a F3, no a costos fijos",
        });
        continue;
      }

      // Patente: la hoja cobra un mensual estable y lo TRIPLICA cada trimestre.
      // Elías confirmó que son dos conceptos fiscales distintos (bienes
      // inmuebles trimestral, encima de la patente mensual) — el enum solo
      // tiene MENSUAL|ANUAL, así que se parte en dos costos en vez de
      // descartar el renglón entero.
      if (clave.includes("patente") && c.estable && c.variantes.length > 0) {
        const base = c.estable.monto;
        const recargo = c.variantes[0]!.monto - base;
        fijosCargables.push({
          clave,
          nombre: c.nombre,
          categoria: "FIJO_OPERACION",
          monto: base,
          moneda: c.estable.moneda,
          frecuencia: "MENSUAL",
          notas: `Del Excel de egresos, hoja "${HOJA_FIJOS}" fila ${c.fila}. Base mensual, sin el recargo trimestral de bienes inmuebles (va aparte).`,
        });
        // ⚠ La clave SIEMPRE se deriva del nombre. Derivarla aparte hizo que en la
        // segunda corrida el concepto no se reconociera a sí mismo: aparecía como
        // alta Y como baja a la vez, o sea que se habría duplicado.
        const nombreBienesInmuebles = "Impuesto de Bienes Inmuebles CR Smarteam S.A";
        fijosCargables.push({
          clave: norm(nombreBienesInmuebles),
          nombre: nombreBienesInmuebles,
          categoria: "FIJO_OPERACION",
          monto: recargo * 4,
          moneda: c.estable.moneda,
          frecuencia: "ANUAL",
          notas: `Del Excel de egresos, hoja "${HOJA_FIJOS}" fila ${c.fila}: recargo trimestral de ${fmt(recargo, c.estable.moneda)} sobre la Patente (observado en algunos meses del bloque vivo; el 4º trimestre se extrapola — marzo cae en el bloque oculto y no tiene dato). Confirmado: "cada 3 meses se cobran los bienes inmuebles con cargo extra".`,
        });
        continue;
      }

      const motivo = motivoParaNoCargar(c);
      if (motivo || !c.estable) {
        fijosDescartados.push({ nombre: c.nombre, motivo: motivo ?? "sin monto" });
        if (!c.terminado) clavesProtegidas.add(`FIJO_OPERACION:${clave}`);
        continue;
      }
      fijosCargables.push({
        clave,
        nombre: c.nombre,
        categoria: "FIJO_OPERACION",
        monto: c.estable.monto,
        moneda: c.estable.moneda,
        frecuencia: "MENSUAL",
        notas: `Del Excel de egresos, hoja "${HOJA_FIJOS}" fila ${c.fila}. ${c.mesesEstables} meses con este monto.${
          c.estable.monedaInferida ? " ⚠ Moneda deducida: el archivo no la declara." : ""
        }`,
      });
    }
    console.log(`\n  A cargar (${fijosCargables.length}):`);
    for (const d of fijosCargables) {
      console.log(`    · ${d.nombre.padEnd(44)} ${fmt(d.monto, d.moneda)} ${d.frecuencia}`);
    }
    reportarDescartes(`Fuera (${fijosDescartados.length}):`, fijosDescartados);

    const mensuales = fijosCargables.filter((d) => d.frecuencia === "MENSUAL");
    const anuales = fijosCargables.filter((d) => d.frecuencia === "ANUAL");
    const sumaFijos = mensuales.reduce((a, d) => a + (d.moneda === "CRC" ? d.monto / 500 : d.monto), 0);
    console.log(
      `\n  Control informativo (NO validación): los ${mensuales.length} MENSUALES cargables suman ≈ $${sumaFijos.toFixed(2)}` +
        (anuales.length > 0
          ? ` (+ ${anuales.length} ANUAL: ${anuales.map((d) => `${d.nombre} ${fmt(d.monto, d.moneda)}/año`).join(", ")})`
          : ""),
    );
    console.log(
      `  El documento cierra sus meses planos en $2.147,83 (10 fijos $2.061,33 + Randall $56,50 + Patente $30)` +
        ` — YA NO es el control de esta carga: Randall se excluye (F3) y el recargo de Patente se separó en un concepto ANUAL aparte.`,
    );

    console.log(`\n  Tarjetas de crédito detectadas (${tarjetas.length}) — NO se cargan acá, alimentan F1:`);
    for (const t of tarjetas) {
      const cargado = t.estable ? `${fmt(t.estable.monto, t.estable.moneda)}/mes` : "sin monto legible";
      console.log(`    · ${t.nombre.padEnd(36)} ${cargado}`);
    }

    // ── Informativo: el bloque OCULTO (ene-sep), NUNCA se aplica ───────────────
    // Elías: "Todo lo oculto debe usarse, si el campo está vacío quiere decir
    // que es el mismo [monto]". Pero acá la MONEDA no se puede leer del
    // archivo: el numFmt está aplicado en bloque a TODA la hoja (ni siquiera
    // distingue texto de números — no es señal acá) y el propio bloque MEZCLA
    // colones (Alquiler, CCSS) con dólares (Juan Tijerino, Contabilidad SV)
    // sin ninguna marca legible. Confirmado a mano, celda por celda. Y aunque
    // se supiera: comparar esto contra el bloque vivo (confirmado en dólares)
    // sería registrar un CAMBIO DE MONEDA como si fuera un cambio de precio —
    // CostoMovimiento no está diseñado para decir eso con honestidad. Por eso
    // esto se IMPRIME nada más; nunca se aplica ni se backfillea.
    const colsOcultas = Array.from({ length: 18 }, (_, i) => i + 2).filter((c) => !colsFijos.includes(c));
    const MONEDA_OCULTA: Record<string, Moneda> = {
      alquiler: "CRC",
      ccss: "CRC",
      tijerino: "USD",
      contabil: "USD", // el nombre real en la hoja trae un typo ("Contabillidad")
    };
    const ocultos = leerCostosFijos(bloqueFijos, colsOcultas).filter((c) => c.estable !== null);
    if (ocultos.length > 0) {
      seccion(`1b. INFORMATIVO — bloque OCULTO de "${HOJA_FIJOS}" (ene-sep) — NO SE CARGA`);
      for (const c of ocultos) {
        const claveMoneda = Object.keys(MONEDA_OCULTA).find((k) => norm(c.nombre).includes(k));
        const moneda = claveMoneda ? MONEDA_OCULTA[claveMoneda]! : c.estable!.moneda;
        console.log(
          `    · ${c.nombre.padEnd(28)} ${fmt(c.estable!.monto, moneda)} × ${c.mesesEstables} meses` +
            (claveMoneda ? "" : "  ⚠ moneda sin confirmar a mano"),
        );
      }
      console.log(`    No se backfillea: sería comparar un cambio de moneda contra el bloque vivo en dólares.`);
    }

    // ── 2. Herramientas ────────────────────────────────────────────────────────
    const wsTools = wb.getWorksheet(HOJA_TOOLS);
    if (!wsTools) throw new Error(`No encuentro la pestaña "${HOJA_TOOLS}"`);
    const filasTools = filasDe(wsTools, 13);
    const bloqueTools = filasDelBloque(filasTools, /^Mes$/i, /^TOTAL/i).filter((f) => f.fila > 29);
    const tools: Herramienta[] = leerHerramientas(bloqueTools, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

    seccion(`2. HERRAMIENTAS — hoja "${HOJA_TOOLS}" (fuente: la GRILLA mensual)`);
    console.log(`  ⚠ La lista de arriba NO se usa: sus dos totales cortan el rango y pierden una herramienta.`);
    const toolsCargables: Deseado[] = [];
    const toolsDescartadas: Array<{ nombre: string; motivo: string }> = [];
    for (const t of tools) {
      if (t.monto <= 0) {
        toolsDescartadas.push({ nombre: t.nombre, motivo: "sin importe en ningún mes — se conserva lo que ya está en Nexus" });
        // La grilla la LISTA: existe, solo que sin precio legible. No es una baja.
        clavesProtegidas.add(`HERRAMIENTA:${norm(t.nombre)}`);
        continue;
      }
      toolsCargables.push({
        clave: norm(t.nombre),
        nombre: t.nombre,
        categoria: "HERRAMIENTA",
        monto: t.monto,
        moneda: t.moneda,
        frecuencia: t.frecuencia,
        notas: `Del Excel de egresos, grilla de "${HOJA_TOOLS}" fila ${t.fila}. ${t.mesesConCargo.length} meses con cargo.`,
      });
    }
    console.log(`\n  A cargar (${toolsCargables.length}):`);
    for (const d of toolsCargables) {
      console.log(`    · ${d.nombre.padEnd(28)} ${fmt(d.monto, d.moneda).padStart(12)}  ${d.frecuencia}`);
    }
    reportarDescartes(`Fuera (${toolsDescartadas.length}):`, toolsDescartadas);

    // ── 3. Salarios ────────────────────────────────────────────────────────────
    const wsSal = wb.getWorksheet(HOJA_SALARIOS);
    if (!wsSal) throw new Error(`No encuentro la pestaña "${HOJA_SALARIOS}"`);
    const salarios: Salario[] = leerSalarios(filasDe(wsSal, 4).slice(1), {
      pais: 1,
      nombre: 2,
      puesto: 3,
      monto: 4,
    });

    seccion(`3. SALARIOS — hoja "${HOJA_SALARIOS}"`);
    console.log(`  ⚠ El total del documento arranca en D14 y se come a un colaborador — no se usa.`);
    const salCargables: Deseado[] = salarios.map((s) => ({
      clave: clavePersona(s.nombre),
      nombre: `${s.nombre} · ${s.puesto}`,
      categoria: "SALARIO" as const,
      monto: s.monto,
      moneda: s.moneda,
      frecuencia: "MENSUAL" as const,
      notas: `Del Excel de egresos, hoja "${HOJA_SALARIOS}" fila ${s.fila}. País: ${s.pais || "sin declarar"}.`,
    }));
    console.log(`\n  A cargar (${salCargables.length}):`);
    for (const d of salCargables) console.log(`    · ${d.nombre.padEnd(44)} ${fmt(d.monto, d.moneda)}`);

    // ── 4. Historial mensual (insumo del libro de planilla y del aguinaldo) ─────
    const wsHist = wb.getWorksheet(HOJA_HISTORIAL);
    const historial = wsHist
      ? leerHistorialSalarios(
          filasDe(wsHist, 16).filter((f) => f.fila >= 6),
          [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
        )
      : [];
    seccion(`4. HISTORIAL MENSUAL — hoja "${HOJA_HISTORIAL}"`);
    console.log(`  ${historial.length} personas con su salario mes a mes (dic→nov).`);
    console.log(`  Es el insumo del LIBRO DE PLANILLA (F2) y del aguinaldo (F4) — este script NO lo carga.`);
    for (const h of historial) {
      console.log(`    · ${h.nombre.padEnd(24)} ${String(h.mesesConSalario).padStart(2)}/12 meses con salario`);
    }

    // ── 5. Diferencias contra lo que ya está en Nexus ──────────────────────────
    const deseados = [...fijosCargables, ...toolsCargables, ...salCargables];
    const filasDb = await prisma.costoRecurrente.findMany({
      select: {
        id: true,
        nombre: true,
        categoria: true,
        monto: true,
        moneda: true,
        frecuencia: true,
        activo: true,
        finalizadoEl: true,
      },
    });
    const existentes: Existente[] = filasDb.map((c) => ({
      id: c.id,
      clave: c.categoria === "SALARIO" ? clavePersona(c.nombre) : norm(c.nombre),
      nombre: c.nombre,
      categoria: c.categoria,
      monto: Number(c.monto),
      moneda: c.moneda,
      frecuencia: c.frecuencia,
      activo: c.activo,
      finalizadoEl: c.finalizadoEl,
    }));
    const porClave = new Map(existentes.map((e) => [`${e.categoria}:${e.clave}`, e]));

    seccion("5. DIFERENCIAS CONTRA NEXUS");
    const nuevos: Deseado[] = [];
    const cambios: Array<{ d: Deseado; e: Existente }> = [];
    const iguales: Deseado[] = [];
    for (const d of deseados) {
      const e = porClave.get(`${d.categoria}:${d.clave}`);
      if (!e) nuevos.push(d);
      else if (e.monto !== d.monto || e.moneda !== d.moneda || e.frecuencia !== d.frecuencia) cambios.push({ d, e });
      else iguales.push(d);
    }
    // ── Dudosos: el riesgo real de esta carga es el DUPLICADO ──────────────────
    // El Excel escribe "Hostiger" donde Nexus tiene "Hostinger", y "Freepik I
    // Magnific" donde tiene "Freepik". Tratarlos como altas crea la fila dos veces
    // Y da de baja la vieja: la misma herramienta partida en dos, con el burn
    // contándola una vez de más. Igual que en la carga de facturaciones, un dudoso
    // JAMÁS se resuelve solo — lo resuelve una persona en el mapa versionado.
    const parecidos = (d: Deseado): Existente[] =>
      existentes.filter(
        (e) =>
          e.categoria === d.categoria &&
          e.finalizadoEl === null &&
          e.clave !== d.clave && // un match exacto no es un dudoso: es un acierto
          seParecen(d.clave, e.clave),
      );

    const dudosos = nuevos
      .map((d) => ({ d, candidatos: parecidos(d) }))
      .filter((x) => x.candidatos.length > 0 && !mapa[`${x.d.categoria}:${x.d.clave}`]);
    const clavesDudosas = new Set(dudosos.map((x) => `${x.d.categoria}:${x.d.clave}`));

    // Lo que el mapa resolvió como "es el mismo, se renombró" deja de ser alta y
    // pasa a ser cambio: se actualiza la fila que ya existe y NO se da de baja.
    const renombres: Array<{ d: Deseado; e: Existente }> = [];
    const clavesRenombradas = new Set<string>();
    for (const d of nuevos) {
      const r = mapa[`${d.categoria}:${d.clave}`];
      if (!r || r.accion !== "renombrar" || !r.costoId) continue;
      const e = existentes.find((x) => x.id === r.costoId);
      if (!e) continue;
      clavesRenombradas.add(`${d.categoria}:${d.clave}`);
      renombres.push({ d: r.nombreFinal ? { ...d, nombre: r.nombreFinal } : d, e });
    }
    const idsRenombrados = new Set(renombres.map((r) => r.e.id));
    const altasReales = nuevos.filter(
      (d) =>
        !clavesDudosas.has(`${d.categoria}:${d.clave}`) &&
        !clavesRenombradas.has(`${d.categoria}:${d.clave}`),
    );

    // ── Una BAJA de salario NO se aplica sola ──────────────────────────────────
    // Decisión de Elías (2026-08-15) al ver que el Excel bajaba un salario que
    // "no debería haber bajado": una SUBIDA es un aumento y se carga sin más; una
    // BAJA es casi siempre un error de la hoja, y aplicarla en silencio le recorta
    // el sueldo a alguien en el sistema que la dirección mira todos los días.
    // Es regla, no un `if` con un nombre adentro — hoy toca a una sola fila.
    const esBajaDeSalario = (d: Deseado, e: Existente) =>
      d.categoria === "SALARIO" && d.moneda === e.moneda && d.monto < e.monto;
    const retenidos = cambios.filter(({ d, e }) => esBajaDeSalario(d, e));
    const cambiosAplicables = cambios.filter(({ d, e }) => !esBajaDeSalario(d, e));

    const clavesDeseadas = new Set(deseados.map((d) => `${d.categoria}:${d.clave}`));
    // La protección matchea con el MISMO criterio laxo que los dudosos: el Excel
    // dice "Claude" y Nexus "Claude (licencia Elías)" — es la misma licencia.
    const estaProtegida = (e: Existente) =>
      [...clavesProtegidas].some((p) => {
        const [cat, clave] = [p.slice(0, p.indexOf(":")), p.slice(p.indexOf(":") + 1)];
        return cat === e.categoria && seParecen(clave, e.clave);
      });
    const sobran = existentes.filter(
      (e) =>
        !clavesDeseadas.has(`${e.categoria}:${e.clave}`) &&
        !estaProtegida(e) &&
        e.finalizadoEl === null &&
        !idsRenombrados.has(e.id),
    );
    const protegidas = existentes.filter(
      (e) =>
        !clavesDeseadas.has(`${e.categoria}:${e.clave}`) && estaProtegida(e) && e.finalizadoEl === null,
    );

    console.log(`\n  ALTAS (${altasReales.length}) — están en el Excel y no en Nexus:`);
    for (const d of altasReales) {
      console.log(`    + ${d.nombre.padEnd(44)} ${fmt(d.monto, d.moneda)} [${d.categoria}]`);
    }

    if (renombres.length > 0) {
      console.log(`\n  RENOMBRES resueltos en el mapa (${renombres.length}):`);
      for (const { d, e } of renombres) console.log(`    ↻ "${e.nombre}" → "${d.nombre}"`);
    }

    if (dudosos.length > 0) {
      console.log(`\n  ⚠ DUDOSOS SIN RESOLVER (${dudosos.length}) — frenan el --apply:`);
      for (const { d, candidatos } of dudosos) {
        console.log(`    ? "${d.nombre}" [${d.categoria}] se parece a: ${candidatos.map((c) => `"${c.nombre}"`).join(", ")}`);
      }
      console.log(`\n    Resolvelos en ${MAPA_PATH} con una entrada por clave:`);
      console.log(`      "HERRAMIENTA:hostiger": { "accion": "renombrar", "costoId": "<id>", "nota": "typo del Excel" }`);
      console.log(`      "HERRAMIENTA:otra":     { "accion": "crear", "nota": "es una herramienta distinta" }`);
      console.log(`    Corré con --escribir-mapa para dejar el esqueleto con los candidatos y sus ids.`);
    }

    console.log(`\n  CAMBIOS DE MONTO (${cambiosAplicables.length}):`);
    for (const { d, e } of cambiosAplicables) {
      console.log(
        `    ~ ${d.nombre.padEnd(44)} ${fmt(e.monto, e.moneda as Moneda)} → ${fmt(d.monto, d.moneda)}${
          e.frecuencia !== d.frecuencia ? `  (${e.frecuencia} → ${d.frecuencia})` : ""
        }`,
      );
    }

    if (retenidos.length > 0) {
      console.log(`\n  ⚠ RETENIDOS (${retenidos.length}) — el Excel BAJA un salario y eso NO se aplica solo:`);
      for (const { d, e } of retenidos) {
        console.log(`    ‖ ${d.nombre.padEnd(44)} ${fmt(e.monto, e.moneda as Moneda)} → ${fmt(d.monto, d.moneda)}`);
      }
      console.log(`    Si la baja es real, corregila a mano en la hoja de Planillas.`);
    }

    console.log(`\n  BAJAS (${sobran.length}) — están en Nexus y NO en el Excel:`);
    console.log(`    (no se borran: se marcan finalizadas con movimiento BAJA, que es reversible)`);
    for (const e of sobran) {
      console.log(`    − ${e.nombre.padEnd(44)} ${fmt(e.monto, e.moneda as Moneda)} [${e.categoria}]`);
    }

    if (protegidas.length > 0) {
      console.log(`\n  INTACTAS (${protegidas.length}) — el Excel las NOMBRA pero sin monto legible:`);
      console.log(`    (una celda vacía dice "no sé cuánto", no "ya no se paga" — no son bajas)`);
      for (const e of protegidas) {
        console.log(`    = ${e.nombre.padEnd(44)} ${fmt(e.monto, e.moneda as Moneda)} [${e.categoria}]`);
      }
    }

    console.log(`\n  SIN CAMBIO: ${iguales.length}`);

    // ── 6. Preguntas ───────────────────────────────────────────────────────────
    seccion("6. PREGUNTAS QUE EL ARCHIVO NO CONTESTA (no se adivinan)");
    for (const p of PREGUNTAS_ABIERTAS) console.log(`  ? ${p}`);

    // ── 7. Gates ───────────────────────────────────────────────────────────────
    if (ESCRIBIR_MAPA) {
      const esqueleto: Record<string, Resolucion> = { ...mapa };
      for (const { d, candidatos } of dudosos) {
        esqueleto[`${d.categoria}:${d.clave}`] = {
          accion: "crear",
          nota: `⚠ RESOLVER A MANO. "${d.nombre}" se parece a: ${candidatos
            .map((c) => `${c.nombre} (id ${c.id})`)
            .join(" · ")}. Si es el mismo, poné accion:"renombrar" y su costoId.`,
        };
      }
      writeFileSync(MAPA_PATH, `${JSON.stringify(esqueleto, null, 2)}\n`, "utf8");
      console.log(`\n  Mapa escrito en ${MAPA_PATH} (${Object.keys(esqueleto).length} entradas).`);
    }

    if (!APPLY) {
      console.log(`\n(dry-run — no se escribió nada. Agregá --apply y --anio=YYYY para cargar.)`);
      return;
    }
    if (!ANIO || !/^\d{4}$/.test(ANIO)) {
      console.error(
        `\n✗ Falta --anio=YYYY. El archivo NO dice de qué año es; sin que una persona lo escriba, no se siembra.`,
      );
      process.exitCode = 1;
      return;
    }
    if (dudosos.length > 0) {
      console.error(
        `\n✗ Hay ${dudosos.length} nombres dudosos sin resolver. Crear un costo que ya existe lo parte en dos y` +
          ` el burn lo cuenta de más. Corré --escribir-mapa, resolvelos en ${MAPA_PATH} y volvé a aplicar.`,
      );
      process.exitCode = 1;
      return;
    }

    seccion(`7. APLICANDO (año declarado: ${ANIO})`);
    const hoy = new Date();
    let altas = 0;
    let updates = 0;
    let bajas = 0;

    for (const d of altasReales) {
      await prisma.$transaction(async (tx) => {
        const costo = await tx.costoRecurrente.create({
          data: {
            categoria: d.categoria,
            nombre: d.nombre,
            monto: new Prisma.Decimal(d.monto),
            moneda: d.moneda,
            frecuencia: d.frecuencia,
            notas: d.notas,
          },
        });
        await tx.costoMovimiento.create({
          data: {
            costoId: costo.id,
            tipo: "ALTA",
            nombre: costo.nombre,
            categoria: costo.categoria,
            moneda: costo.moneda,
            frecuencia: costo.frecuencia,
            monto: costo.monto,
            fechaEfectiva: hoy,
            usuarioEmail: POR,
            notas: `Alta desde el Excel de egresos ${ANIO}.`,
          },
        });
      });
      altas++;
    }

    // Los renombres resueltos a mano se aplican por el MISMO camino que un cambio de
    // monto: se actualiza la fila que ya existe (y de paso su nombre), en vez de
    // crear una nueva y jubilar la vieja — que es como se parte un costo en dos.
    for (const { d, e } of [...cambiosAplicables, ...renombres]) {
      await prisma.$transaction(async (tx) => {
        const costo = await tx.costoRecurrente.update({
          where: { id: e.id },
          data: {
            nombre: d.nombre,
            monto: new Prisma.Decimal(d.monto),
            moneda: d.moneda,
            frecuencia: d.frecuencia,
            notas: d.notas,
          },
        });
        await tx.costoMovimiento.create({
          data: {
            costoId: costo.id,
            tipo: "CAMBIO_MONTO",
            nombre: costo.nombre,
            categoria: costo.categoria,
            moneda: costo.moneda,
            frecuencia: costo.frecuencia,
            monto: costo.monto,
            montoAnterior: new Prisma.Decimal(e.monto),
            fechaEfectiva: hoy,
            usuarioEmail: POR,
            notas: `El Excel de egresos ${ANIO} manda: ${fmt(e.monto, e.moneda as Moneda)} → ${fmt(d.monto, d.moneda)}.`,
          },
        });
      });
      updates++;
    }

    for (const e of sobran) {
      await prisma.$transaction(async (tx) => {
        const costo = await tx.costoRecurrente.update({
          where: { id: e.id },
          data: { finalizadoEl: hoy },
        });
        await tx.costoMovimiento.create({
          data: {
            costoId: costo.id,
            tipo: "BAJA",
            nombre: costo.nombre,
            categoria: costo.categoria,
            moneda: costo.moneda,
            frecuencia: costo.frecuencia,
            monto: costo.monto,
            fechaEfectiva: hoy,
            usuarioEmail: POR,
            notas: `No aparece en el Excel de egresos ${ANIO}. Baja reversible: limpiá finalizadoEl para reactivarlo.`,
          },
        });
      });
      bajas++;
    }

    console.log(`  ✓ ${altas} altas · ${updates} cambios de monto · ${bajas} bajas.`);
    console.log(`  Recordá: reiniciar el dev server no hace falta (no cambió el schema), pero sí recargar la hoja.`);
  } finally {
    await close();
  }
})().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
