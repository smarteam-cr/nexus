/**
 * lib/cobranza/egresos-sheet.ts
 *
 * Decodificador PURO del archivo de egresos de Smarteam ("Egresos y Costos"):
 * cero exceljs/Prisma/red — recibe celdas ya leídas y devuelve conceptos.
 * El lector real (exceljs) vive en scripts/import-egresos-xlsx.ts. Hermano de
 * `facturaciones-sheet.ts`, del que reusa `CeldaCruda` y la heurística de fórmulas.
 *
 * ⚠ LO QUE ESTE ARCHIVO SABE Y NINGÚN OTRO LADO SABE (medido celda por celda):
 *
 *  1. La hoja "Costos Fijos" tiene DOS bloques de meses y el izquierdo (columnas
 *     B..J, rotuladas Enero..septiembre) está **OCULTO**, con sus dos filas TOTAL en
 *     `#REF!` y con la moneda MEZCLADA (alquiler en colones, Juan Tijerino en
 *     dólares). El bloque vivo es K..S (Abril..Diciembre). NO son dos años: es un
 *     mismo ciclo partido en abril — "Pretensión de Aguinaldos" lo confirma (dos
 *     personas arrancan justo en ABRIL). Por eso el lector le pasa a este módulo
 *     SOLO las columnas visibles y acá no se adivina cuál bloque es cuál.
 *  2. El año NO consta en ninguna hoja ni en la metadata del archivo. Este módulo
 *     nunca lo infiere: lo recibe.
 *  3. La ÚNICA señal de moneda en "Costos Fijos" es la fórmula `/$U$2` (el tipo de
 *     cambio que teclearon en U2). El formato de número está aplicado en bloque a
 *     toda la hoja —hasta a celdas de texto— así que NO sirve. En "Salarios
 *     Actuales" y "Pretensión de Aguinaldos" es al revés: ahí el formato SÍ varía
 *     por fila y es la señal buena.
 *  4. Los totales del propio documento SUB-SUMAN (otra vez, como en las
 *     facturaciones): "Salarios Actuales" arranca en D14 y se come a un
 *     colaborador; la lista de herramientas corta el rango antes de la última fila
 *     y pierde Supabase. **Lo leído celda por celda es la verdad; el total del
 *     documento es control informativo, jamás validación.**
 *
 * Regla de la casa que gobierna todo lo de abajo: lo que no se puede leer NO se
 * aproxima — se devuelve con su advertencia y el loader lo deja afuera.
 */
/**
 * Una celda ya leída. Prima de `CeldaCruda` de `facturaciones-sheet` pero con
 * `numFmt` en vez de `fillArgb`: en la hoja de facturación el dato que importa es
 * el COLOR (ahí vive el estado del cobro) y acá es el FORMATO (ahí vive la moneda
 * de un salario). Son dos señales distintas de dos documentos distintos; unificar
 * el tipo obligaría a que cada lector cargue el campo que no usa.
 */
export type CeldaCruda = { valor: unknown; numFmt?: string | null };

/** Una fila ya leída. `celdas[0]` = columna 1 de Excel (la del nombre). */
export type FilaCruda = { fila: number; celdas: CeldaCruda[] };

/** Moneda tal como la modela Cobranza (sin importar el enum de Prisma: esto es puro). */
export type Moneda = "CRC" | "USD";

// ── Fórmulas y moneda ───────────────────────────────────────────────────────────

/** Fórmula de Excel tal como la entrega exceljs (con el resultado cacheado). */
type CeldaFormula = { formula?: string; sharedFormula?: string; result?: unknown };

/**
 * El TEXTO de la fórmula. Solo `formula` — nunca `sharedFormula`.
 *
 * ⚠ exceljs entrega las fórmulas COMPARTIDAS como `{result, sharedFormula: "K8"}`,
 * sin el texto: la única celda que lo trae es el ancla del rango. En esta hoja casi
 * todo está compartido a lo ancho de los nueve meses (`ref: "K8:S8"`), así que leer
 * `sharedFormula` como si fuera la expresión haría que ocho de cada nueve meses se
 * vieran como "referencia a otra celda" y desaparecieran EN SILENCIO. Resolverlas
 * es trabajo del LECTOR, que es el único que tiene la hoja entera; acá se detecta
 * la que llegó sin resolver y se avisa fuerte.
 */
const expresionDe = (valor: unknown): string | null => {
  if (!valor || typeof valor !== "object") return null;
  const e = (valor as CeldaFormula).formula;
  return typeof e === "string" ? e : null;
};

/** Fórmula compartida que el lector NO resolvió: su monto es ilegible acá. */
export function esCompartidaSinResolver(celda: CeldaCruda | undefined): boolean {
  const v = celda?.valor;
  if (!v || typeof v !== "object") return false;
  const f = v as CeldaFormula;
  return typeof f.sharedFormula === "string" && typeof f.formula !== "string";
}

const resultadoDe = (valor: unknown): number | null => {
  if (!valor || typeof valor !== "object") return null;
  const r = (valor as CeldaFormula).result;
  return typeof r === "number" && Number.isFinite(r) ? r : null;
};

/**
 * ¿La fórmula convierte colones a dólares dividiendo por el tipo de cambio de U2?
 * Formas reales en la hoja: `100000/$U$2`, `(15000/$U$2)*3`, `27000/$U$2`.
 * El numerador es el monto EN COLONES, que es lo que queremos guardar: la
 * prohibición de FX (DECISIONS §Cobranza) manda cargar en moneda nativa y NO
 * arrastrar el ₡500 que alguien tecleó en una celda.
 */
const RE_DIVIDE_POR_TC = /(\d[\d.]*)\s*\/\s*\$?U\$?2\s*\)?\s*(?:\*\s*(\d+(?:\.\d+)?))?/i;

export type MontoLeido = {
  monto: number;
  moneda: Moneda;
  /**
   * true = la moneda se DEDUJO de un número pelado (sin fórmula de TC y sin
   * formato con el símbolo de colones). El loader lo reporta para que una persona
   * lo confirme en vez de que el sistema afirme una moneda que nadie escribió.
   */
  monedaInferida: boolean;
};

/**
 * Monto de una celda del bloque de costos fijos, en su MONEDA NATIVA.
 *
 *  - `=100000/$U$2`  → 100000 CRC   (el numerador; jamás el resultado en dólares)
 *  - `=(50*13%)+50`  → 56.5 USD     (aritmética sobre literales = monto con calculadora)
 *  - `=SUM(K8:K19)`  → null         (derivado; misma regla que `montoDeCelda`)
 *  - `400` / `51`    → USD inferido (la hoja opera en dólares desde abril)
 */
export function montoFijoDeCelda(celda: CeldaCruda | undefined): MontoLeido | null {
  if (!celda) return null;
  const { valor } = celda;

  if (typeof valor === "number") {
    return Number.isFinite(valor) ? { monto: valor, moneda: "USD", monedaInferida: true } : null;
  }

  const expr = expresionDe(valor);
  if (expr === null) return null;

  const tc = RE_DIVIDE_POR_TC.exec(expr);
  if (tc) {
    const colones = Number(tc[1]);
    if (!Number.isFinite(colones)) return null;
    // `(15000/$U$2)*3` → ese mes lleva TRES veces el cargo. El multiplicador se lee
    // del TEXTO de la fórmula y NO del resultado cacheado: derivarlo del resultado
    // obligaría a saber el tipo de cambio, que es justo lo que no queremos tocar.
    const veces = tc[2] === undefined ? 1 : Number(tc[2]);
    if (!Number.isFinite(veces) || veces <= 0) return null;
    return { monto: colones * veces, moneda: "CRC", monedaInferida: false };
  }

  // Cualquier LETRA restante = referencia a otra celda o función ⇒ derivado, no es
  // un cargo (misma heurística que `montoDeCelda` en facturaciones-sheet).
  if (/[A-Za-z]/.test(expr)) return null;

  const r = resultadoDe(valor);
  return r === null ? null : { monto: r, moneda: "USD", monedaInferida: true };
}

/** ¿El formato de número declara colones? Señal válida SOLO en las hojas de salarios. */
export function monedaPorFormato(numFmt: string | null | undefined): Moneda {
  return numFmt && numFmt.includes("₡") ? "CRC" : "USD";
}

// ── Bloques de una hoja ─────────────────────────────────────────────────────────

/**
 * El texto de una celda, en las TRES formas que trae este archivo.
 *
 * ⚠ La tercera cuesta cara y no se ve venir: una celda con HIPERVÍNCULO llega como
 * `{text, hyperlink}` y no como string. En la grilla de herramientas dos filas lo
 * tienen (la del CRM y la de feedback), y sin este caso las dos desaparecían del
 * import SIN UN SOLO ERROR — la fila se leía con nombre vacío y el filtro la
 * descartaba como si fuera una separadora.
 */
const textoDe = (celda: CeldaCruda | undefined): string => {
  const v = celda?.valor;
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    if ("richText" in v) {
      const rt = (v as { richText?: Array<{ text?: string }> }).richText ?? [];
      return rt.map((t) => t.text ?? "").join("").trim();
    }
    const t = (v as { text?: unknown }).text;
    if (typeof t === "string") return t.trim();
  }
  return "";
};

/**
 * Filas de un bloque, delimitado por MARCADORES y no por números de fila: la hoja
 * se edita a mano todos los meses y un índice fijo envejece en la primera fila que
 * alguien inserte. `desde` es la fila cuyo nombre matchea (exclusiva) y `hasta` la
 * primera que matchee después (exclusiva).
 */
export function filasDelBloque(
  filas: FilaCruda[],
  desde: RegExp,
  hasta: RegExp,
): FilaCruda[] {
  const i = filas.findIndex((f) => desde.test(textoDe(f.celdas[0])));
  if (i < 0) return [];
  const resto = filas.slice(i + 1);
  const j = resto.findIndex((f) => hasta.test(textoDe(f.celdas[0])));
  return (j < 0 ? resto : resto.slice(0, j)).filter((f) => textoDe(f.celdas[0]) !== "");
}

// ── Costos fijos ────────────────────────────────────────────────────────────────

export type MesLeido = { col: number; monto: MontoLeido | null };

export type ConceptoFijo = {
  fila: number;
  nombre: string;
  /** Un elemento por columna VISIBLE del bloque vivo, en orden. */
  meses: MesLeido[];
  /** El monto que se repite en más meses. null = no hay ninguno repetido. */
  estable: MontoLeido | null;
  /** Cuántos meses llevan exactamente `estable`. */
  mesesEstables: number;
  /** Montos distintos del estable (los que hacen dudar). */
  variantes: Array<{ col: number; monto: number }>;
  /** true = los últimos meses del bloque están en cero ⇒ el concepto terminó. */
  terminado: boolean;
  advertencias: string[];
};

/**
 * Lee un bloque de costos fijos sobre las columnas VISIBLES que le pase el lector.
 *
 * El "estable" es la MODA, no el primero ni el promedio: la hoja tiene conceptos
 * que varían a propósito (una patente que se triplica tres veces al año) y otros
 * que se terminaron a mitad de año (un proveedor que dejó de cobrar). Promediar los
 * mezclaría a los dos en un número que no existe en ningún mes.
 */
export function leerCostosFijos(filas: FilaCruda[], columnas: number[]): ConceptoFijo[] {
  return filas.map((f) => {
    const nombre = textoDe(f.celdas[0]);
    const meses: MesLeido[] = columnas.map((col) => ({
      col,
      monto: montoFijoDeCelda(f.celdas[col - 1]),
    }));
    const conMonto = meses.filter((m) => m.monto !== null) as Array<{ col: number; monto: MontoLeido }>;
    const advertencias: string[] = [];

    // Red contra un lector que no resuelva las fórmulas compartidas: sin esto, ocho
    // de cada nueve meses desaparecen sin una sola línea de error.
    const sinResolver = columnas.filter((col) => esCompartidaSinResolver(f.celdas[col - 1])).length;
    if (sinResolver > 0) {
      advertencias.push(
        `${sinResolver} meses llegaron como fórmula compartida sin resolver — el lector tiene que sustituirla por la del ancla`,
      );
    }

    const monedas = new Set(conMonto.map((m) => m.monto.moneda));
    if (monedas.size > 1) {
      advertencias.push(
        `mezcla monedas dentro del mismo concepto (${[...monedas].join(" y ")}) — no se puede cargar como una sola línea`,
      );
    }

    // Moda por monto+moneda, sobre los meses CON CARGO. Un cero no es un monto: es
    // la ausencia de uno. Contarlo hacía que un proveedor que dejó de cobrar a mitad
    // de año tuviera "monto estable = 0" y el motivo real (terminó) no se imprimiera.
    const conCargo = conMonto.filter((m) => m.monto.monto > 0);
    const cuenta = new Map<string, { monto: MontoLeido; n: number }>();
    for (const m of conCargo) {
      const k = `${m.monto.moneda}:${m.monto.monto}`;
      const prev = cuenta.get(k);
      if (prev) prev.n += 1;
      else cuenta.set(k, { monto: m.monto, n: 1 });
    }
    let estable: MontoLeido | null = null;
    let mesesEstables = 0;
    for (const { monto, n } of cuenta.values()) {
      if (n > mesesEstables) {
        estable = monto;
        mesesEstables = n;
      }
    }

    const variantes = conCargo
      .filter((m) => !estable || m.monto.monto !== estable.monto || m.monto.moneda !== estable.moneda)
      .map((m) => ({ col: m.col, monto: m.monto.monto }));
    if (variantes.length > 0 && estable) {
      advertencias.push(
        `${variantes.length} de ${conCargo.length} meses con cargo traen otro monto (${[
          ...new Set(variantes.map((v) => v.monto)),
        ].join(", ")}) — confirmar si es recargo, trimestral o error`,
      );
    }

    // "Terminado" = arranca con monto y el bloque cierra en ceros. Un concepto que
    // dejó de cobrarse NO es recurrente vigente: entra pausado, nunca a la proyección.
    const ultimoConMonto = [...conMonto].reverse().find((m) => m.monto.monto > 0) ?? null;
    const hayCerosDespues =
      ultimoConMonto !== null && conMonto.some((m) => m.col > ultimoConMonto.col && m.monto.monto === 0);
    if (hayCerosDespues) advertencias.push("los últimos meses están en cero — el concepto terminó");

    if (estable?.monedaInferida) {
      advertencias.push(
        "la moneda se dedujo de un número sin fórmula ni símbolo — confirmar antes de cargar",
      );
    }
    if (estable && estable.moneda === "USD" && estable.monto >= 10_000) {
      advertencias.push(
        `${estable.monto} en dólares es sospechosamente alto para esta hoja — ¿son colones?`,
      );
    }

    return {
      fila: f.fila,
      nombre,
      meses,
      estable,
      mesesEstables,
      variantes,
      terminado: hayCerosDespues,
      advertencias,
    };
  });
}

/**
 * ¿Se puede cargar como `CostoRecurrente` MENSUAL sin adivinar nada?
 * Devuelve el motivo cuando NO — el loader lo imprime tal cual y lo deja afuera.
 *
 * ⚠ Una moneda INFERIDA no frena la carga: frenarla dejaría afuera a un tercio de
 * los conceptos por un dato que el archivo simplemente no declara en ningún lado.
 * Sale como advertencia en el dry-run para que una persona la confirme — que es
 * distinto de que el sistema la afirme solo.
 */
export function motivoParaNoCargar(c: ConceptoFijo): string | null {
  if (!c.estable) return "ningún mes trae un monto legible";
  if (c.estable.monto === 0) return "el monto estable es cero";
  if (c.advertencias.some((a) => a.startsWith("mezcla monedas"))) return "mezcla monedas";
  if (c.advertencias.some((a) => a.includes("fórmula compartida sin resolver"))) {
    return "el lector no resolvió las fórmulas compartidas";
  }
  if (c.terminado) return "terminó durante el período (va pausado, no a la proyección)";
  if (c.variantes.length > 0) return "el monto no es el mismo todos los meses";
  return null;
}

// ── Herramientas ────────────────────────────────────────────────────────────────

export type Herramienta = {
  fila: number;
  nombre: string;
  monto: number;
  moneda: Moneda;
  /** MENSUAL si aparece en 2+ meses; ANUAL si aparece en uno solo. */
  frecuencia: "MENSUAL" | "ANUAL";
  /** Meses (índice 0-11) en los que la grilla trae ese monto. */
  mesesConCargo: number[];
  advertencias: string[];
};

/**
 * Lee la GRILLA mensual de herramientas (una fila por herramienta, doce columnas).
 *
 * ⚠ La fuente es la grilla y NO la lista de arriba de la hoja: los dos totales de
 * esa lista cortan el rango antes de la última fila y pierden una herramienta
 * entera. La lista sirve para el día de pago y para el importe anual, nada más.
 *
 * Un cargo en UN SOLO mes es un pago ANUAL (así están el hosting, el dominio y el
 * tema del sitio). El enum solo tiene MENSUAL|ANUAL, así que un anual se va a
 * mensualizar /12 en la proyección: el burn queda bien y el mes puntual no. Se
 * anota como advertencia en vez de inventar una frecuencia nueva.
 */
export function leerHerramientas(filas: FilaCruda[], columnas: number[]): Herramienta[] {
  const out: Herramienta[] = [];
  for (const f of filas) {
    const nombre = textoDe(f.celdas[0]);
    if (!nombre || /^total/i.test(nombre)) continue;

    const cargos = columnas
      .map((col, mes0) => ({ mes0, monto: montoFijoDeCelda(f.celdas[col - 1]) }))
      .filter((m) => m.monto !== null && m.monto.monto > 0) as Array<{ mes0: number; monto: MontoLeido }>;

    const advertencias: string[] = [];
    if (cargos.length === 0) {
      out.push({
        fila: f.fila,
        nombre,
        monto: 0,
        moneda: "USD",
        frecuencia: "MENSUAL",
        mesesConCargo: [],
        advertencias: ["sin importe en ningún mes — no se carga"],
      });
      continue;
    }

    const montos = [...new Set(cargos.map((c) => c.monto.monto))];
    if (montos.length > 1) {
      advertencias.push(`el importe cambia durante el año (${montos.join(", ")}) — se usa el más frecuente`);
    }

    const cuenta = new Map<number, number>();
    for (const c of cargos) cuenta.set(c.monto.monto, (cuenta.get(c.monto.monto) ?? 0) + 1);
    let monto = cargos[0]!.monto.monto;
    let mejor = 0;
    for (const [m, n] of cuenta) {
      if (n > mejor) {
        monto = m;
        mejor = n;
      }
    }

    const frecuencia = cargos.length === 1 ? ("ANUAL" as const) : ("MENSUAL" as const);
    if (frecuencia === "ANUAL") {
      advertencias.push("cargo de un solo mes ⇒ ANUAL: la proyección lo mensualiza /12 y no cae en su mes real");
    }

    out.push({
      fila: f.fila,
      nombre,
      monto,
      moneda: cargos[0]!.monto.moneda,
      frecuencia,
      mesesConCargo: cargos.map((c) => c.mes0),
      advertencias,
    });
  }
  return out;
}

// ── Salarios ────────────────────────────────────────────────────────────────────

export type Salario = {
  fila: number;
  nombre: string;
  puesto: string;
  pais: string;
  monto: number;
  moneda: Moneda;
};

/**
 * Lee "Salarios Actuales" (colaborador · puesto · salario mensual).
 *
 * El país viene en la primera columna y solo en la fila donde ARRANCA el grupo, así
 * que se arrastra hacia abajo. Acá la moneda SÍ sale del formato de número: en esta
 * hoja varía fila por fila (unos en colones, otros en dólares) y es la señal buena
 * —al revés que en "Costos Fijos", donde está aplicado en bloque y no dice nada—.
 */
export function leerSalarios(
  filas: FilaCruda[],
  cols: { pais: number; nombre: number; puesto: number; monto: number },
): Salario[] {
  const out: Salario[] = [];
  let pais = "";
  for (const f of filas) {
    const p = textoDe(f.celdas[cols.pais - 1]);
    if (p && !/^total/i.test(p)) pais = p;

    const nombre = textoDe(f.celdas[cols.nombre - 1]);
    if (!nombre) continue;

    const celda = f.celdas[cols.monto - 1];
    const bruto = celda?.valor;
    const monto = typeof bruto === "number" ? bruto : resultadoDe(bruto);
    if (monto === null || !Number.isFinite(monto) || monto <= 0) continue;

    out.push({
      fila: f.fila,
      nombre,
      puesto: textoDe(f.celdas[cols.puesto - 1]),
      pais,
      monto,
      moneda: monedaPorFormato(celda?.numFmt),
    });
  }
  return out;
}

// ── Historial mensual de salarios (la hoja del aguinaldo) ───────────────────────

export type HistorialSalario = {
  fila: number;
  nombre: string;
  /** Un elemento por columna del período, en el orden en que vinieron. */
  meses: Array<{ col: number; monto: number }>;
  moneda: Moneda;
  /** Meses con monto > 0 — la cobertura real de esta persona en el período. */
  mesesConSalario: number;
};

/**
 * Lee "Pretensión de Aguinaldos": el salario MES A MES de cada colaborador durante
 * el período de aguinaldo (diciembre del año anterior a noviembre del año en curso).
 *
 * Es la única fuente del archivo que tiene la HISTORIA y no solo la foto de hoy —
 * por eso alimenta el libro de planilla, no solo el aguinaldo. Los ceros iniciales
 * de quien entró a mitad de año son dato, no huecos: son exactamente lo que hace que
 * su aguinaldo salga proporcional sin que nadie cargue una fecha de ingreso.
 *
 * La columna del total y la del monto convertido a dólares NO se leen: la primera es
 * derivada (la recalcula Nexus) y la segunda usa el tipo de cambio tecleado en la
 * hoja, que por la prohibición de FX no entra al sistema.
 */
export function leerHistorialSalarios(filas: FilaCruda[], columnas: number[]): HistorialSalario[] {
  const out: HistorialSalario[] = [];
  for (const f of filas) {
    const nombre = textoDe(f.celdas[0]) || textoDe(f.celdas[1]);
    if (!nombre) continue;

    const meses: Array<{ col: number; monto: number }> = [];
    let numFmt: string | null | undefined;
    for (const col of columnas) {
      const celda = f.celdas[col - 1];
      const bruto = celda?.valor;
      const monto = typeof bruto === "number" ? bruto : resultadoDe(bruto);
      if (monto === null || !Number.isFinite(monto)) continue;
      if (numFmt === undefined && monto > 0) numFmt = celda?.numFmt;
      meses.push({ col, monto });
    }
    if (meses.length === 0) continue;

    out.push({
      fila: f.fila,
      nombre,
      meses,
      moneda: monedaPorFormato(numFmt),
      mesesConSalario: meses.filter((m) => m.monto > 0).length,
    });
  }
  return out;
}
