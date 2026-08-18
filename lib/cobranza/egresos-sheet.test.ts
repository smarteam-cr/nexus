/**
 * lib/cobranza/egresos-sheet.test.ts
 *
 * Los casos NO son inventados: son las celdas REALES del archivo de Alex, copiadas
 * tal como las entrega exceljs (con `sharedFormula`, `#REF!` y todo). Si alguien
 * cambia el decodificador y estos se rompen, un costo de producción se movió.
 *
 * Las columnas del bloque vivo son 11..19 (K..S = abril..diciembre). Las 9 de la
 * izquierda (B..J) están OCULTAS en el archivo y no se leen nunca — por eso los
 * casos de acá arrancan en 11.
 */
import { describe, it, expect } from "vitest";
import {
  esCompartidaSinResolver,
  filasDelBloque,
  leerCostosFijos,
  leerHerramientas,
  leerHistorialSalarios,
  leerSalarios,
  mesDeEncabezado,
  mesesDeEncabezado,
  monedaPorFormato,
  montoFijoDeCelda,
  motivoParaNoCargar,
  serieMensualDe,
  type CeldaCruda,
  type FilaCruda,
} from "./egresos-sheet";

const VIVAS = [11, 12, 13, 14, 15, 16, 17, 18, 19];

/** Celda con fórmula ya RESUELTA (lo que entrega el lector tras sustituir el ancla). */
const fx = (formula: string, result: number): CeldaCruda => ({ valor: { formula, result } });
const n = (valor: number, numFmt?: string): CeldaCruda => ({ valor, numFmt });
const txt = (valor: string): CeldaCruda => ({ valor });
const vacia: CeldaCruda = { valor: null };

/** Fila: nombre en la columna 1 y los nueve meses del bloque vivo en 11..19. */
function filaFija(fila: number, nombre: string, meses: CeldaCruda[]): FilaCruda {
  const celdas: CeldaCruda[] = new Array(19).fill(vacia);
  celdas[0] = txt(nombre);
  meses.forEach((c, i) => {
    celdas[10 + i] = c;
  });
  return { fila, celdas };
}

describe("montoFijoDeCelda — el bloque vivo está en DÓLARES, confirmado por Elías", () => {
  it("una división por el tipo de cambio devuelve el RESULTADO, no el numerador", () => {
    // Alquiler de Oficina, fila 8: el numerador (100000) es cómo Alex arma la cuenta
    // en su cabeza, pero lo que paga de verdad es el resultado cacheado: $200.
    expect(montoFijoDeCelda(fx("100000/$U$2", 200))).toEqual({
      monto: 200,
      moneda: "USD",
      monedaInferida: false,
    });
  });

  it("un multiplicador dentro de la fórmula ya viene resuelto en el resultado", () => {
    // Patente, junio: `(15000/$U$2)*3` → Excel ya hizo la cuenta: $90.
    expect(montoFijoDeCelda(fx("(15000/$U$2)*3", 90))).toEqual({
      monto: 90,
      moneda: "USD",
      monedaInferida: false,
    });
    expect(montoFijoDeCelda(fx("(15000/$U$2)", 30))?.monto).toBe(30);
  });

  it("aritmética sobre literales es un monto escrito con calculadora", () => {
    expect(montoFijoDeCelda(fx("(50*13%)+50", 56.5))).toEqual({
      monto: 56.5,
      moneda: "USD",
      monedaInferida: true,
    });
    expect(montoFijoDeCelda(fx("50.6+969.73", 1020.33))?.monto).toBe(1020.33);
  });

  it("una fórmula que REFERENCIA otra celda es derivada y no es un cargo", () => {
    expect(montoFijoDeCelda(fx("SUM(K8:K19)", 2617.83))).toBeNull();
    expect(montoFijoDeCelda(fx("K3", 130.6))).toBeNull();
    // Los totales del bloque oculto quedaron rotos; su resultado ni siquiera es número.
    expect(montoFijoDeCelda({ valor: { formula: "(#REF!*597)+#REF!", result: "#REF!" } })).toBeNull();
  });

  it("un número pelado se lee en dólares pero DECLARA que la moneda se dedujo", () => {
    // Póliza (51) y SP de Luis Jinesta (400): el archivo no dice la moneda en ningún lado.
    expect(montoFijoDeCelda(n(51))).toEqual({ monto: 51, moneda: "USD", monedaInferida: true });
    expect(montoFijoDeCelda(n(400, "[$$]#,##0.00"))?.monedaInferida).toBe(true);
  });

  it("una fórmula COMPARTIDA sin resolver no se adivina: es null y se detecta", () => {
    // exceljs entrega L8..S8 así. Ocho de los nueve meses del alquiler.
    const compartida: CeldaCruda = { valor: { result: 200, sharedFormula: "K8" } };
    expect(montoFijoDeCelda(compartida)).toBeNull();
    expect(esCompartidaSinResolver(compartida)).toBe(true);
    expect(esCompartidaSinResolver(fx("100000/$U$2", 200))).toBe(false);
  });
});

describe("monedaPorFormato — solo vale en las hojas de salarios", () => {
  it("el símbolo de colones manda; cualquier otra cosa es dólares", () => {
    expect(monedaPorFormato("[$₡]#,##0.00")).toBe("CRC");
    expect(monedaPorFormato('"$"#,##0.00')).toBe("USD");
    expect(monedaPorFormato(null)).toBe("USD");
  });
});

describe("leerCostosFijos — los 4 comportamientos reales de la hoja", () => {
  const alquiler = filaFija(8, "Alquiler de Oficina", VIVAS.map(() => fx("100000/$U$2", 200)));

  const patente = filaFija(15, "Patente CR Smarteam S.A", [
    fx("15000/$U$2", 30),
    fx("15000/$U$2", 30),
    fx("(15000/$U$2)*3", 90),
    fx("(15000/$U$2)", 30),
    fx("(15000/$U$2)", 30),
    fx("(15000/$U$2)*3", 90),
    fx("(15000/$U$2)", 30),
    fx("(15000/$U$2)", 30),
    fx("(15000/$U$2)*3", 90),
  ]);

  const tijerino = filaFija(16, "Juan Tijerino", [
    n(470), n(600), n(600), n(0), n(0), n(0), n(0), n(0), n(0),
  ]);

  const poliza = filaFija(14, "Poliza CR Smarteam S.A", VIVAS.map(() => n(51)));

  const leidos = leerCostosFijos([alquiler, patente, tijerino, poliza], VIVAS);
  const [a, p, t, po] = leidos;

  it("un concepto parejo sale con su monto en dólares y se puede cargar", () => {
    expect(a!.estable).toEqual({ monto: 200, moneda: "USD", monedaInferida: false });
    expect(a!.mesesEstables).toBe(9);
    expect(a!.variantes).toEqual([]);
    expect(motivoParaNoCargar(a!)).toBeNull();
  });

  it("el estable es la MODA, y lo que se sale queda listado — no promediado", () => {
    // Promediar $30 y $90 daría $50: un monto que no existe en ningún mes.
    expect(p!.estable?.monto).toBe(30);
    expect(p!.mesesEstables).toBe(6);
    expect(p!.variantes).toHaveLength(3);
    expect(p!.variantes.every((v) => v.monto === 90)).toBe(true);
    expect(motivoParaNoCargar(p!)).toBe("el monto no es el mismo todos los meses");
  });

  it("un concepto que termina en ceros NO es recurrente vigente", () => {
    expect(t!.terminado).toBe(true);
    expect(motivoParaNoCargar(t!)).toContain("terminó durante el período");
  });

  it("una moneda deducida se ADVIERTE pero no frena la carga", () => {
    expect(po!.estable).toEqual({ monto: 51, moneda: "USD", monedaInferida: true });
    expect(po!.advertencias.some((w) => w.includes("se dedujo"))).toBe(true);
    expect(motivoParaNoCargar(po!)).toBeNull();
  });

  it("si el lector no resolvió las compartidas, el concepto NO se carga en silencio", () => {
    const roto = filaFija(8, "Alquiler de Oficina", [
      fx("100000/$U$2", 200),
      ...VIVAS.slice(1).map(() => ({ valor: { result: 200, sharedFormula: "K8" } }) as CeldaCruda),
    ]);
    const [r] = leerCostosFijos([roto], VIVAS);
    expect(r!.mesesEstables).toBe(1);
    expect(motivoParaNoCargar(r!)).toBe("el lector no resolvió las fórmulas compartidas");
  });

});

describe("filasDelBloque — los límites son marcadores, no números de fila", () => {
  const filas: FilaCruda[] = [
    { fila: 6, celdas: [txt("Gastos Fijos")] },
    { fila: 7, celdas: [txt("Mes")] },
    { fila: 8, celdas: [txt("Alquiler de Oficina")] },
    { fila: 9, celdas: [txt("CCSS CR Smarteam")] },
    { fila: 20, celdas: [txt("TOTAL en $")] },
    { fila: 22, celdas: [txt("INGRESO TOTAL")] },
  ];

  it("toma lo que hay entre el encabezado y el total, sin incluirlos", () => {
    const bloque = filasDelBloque(filas, /^Mes$/i, /^TOTAL/i);
    expect(bloque.map((f) => f.fila)).toEqual([8, 9]);
  });

  it("sin marcador de cierre llega hasta el final", () => {
    expect(filasDelBloque(filas, /^Mes$/i, /^NO-EXISTE$/).map((f) => f.fila)).toEqual([8, 9, 20, 22]);
  });

  it("sin marcador de apertura devuelve vacío en vez de leer toda la hoja", () => {
    expect(filasDelBloque(filas, /^NO-EXISTE$/, /^TOTAL/i)).toEqual([]);
  });
});

describe("leerHerramientas — un cargo de un solo mes es ANUAL", () => {
  const MESES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // B..M = ene..dic

  function filaTool(fila: number, nombre: string, montos: Array<number | null>): FilaCruda {
    const celdas: CeldaCruda[] = new Array(13).fill(vacia);
    celdas[0] = txt(nombre);
    montos.forEach((m, i) => {
      celdas[1 + i] = m === null ? vacia : n(m);
    });
    return { fila, celdas };
  }

  const filas = [
    filaTool(32, "HubSpot", new Array(12).fill(535)),
    filaTool(43, "DIVI", [null, null, null, null, null, null, 89, null, null, null, null, null]),
    filaTool(49, "SUPA BASE", [null, null, null, null, null, 25, 25, 25, 25, 25, 25, 25]),
    filaTool(48, "Claude", new Array(12).fill(null)),
    filaTool(50, "TOTAL", new Array(12).fill(1802.86)),
  ];
  const tools = leerHerramientas(filas, MESES);

  it("doce meses iguales = mensual", () => {
    const h = tools.find((t) => t.nombre === "HubSpot")!;
    expect(h.monto).toBe(535);
    expect(h.frecuencia).toBe("MENSUAL");
  });

  it("un solo mes = anual, y avisa que se va a mensualizar", () => {
    const d = tools.find((t) => t.nombre === "DIVI")!;
    expect(d.frecuencia).toBe("ANUAL");
    expect(d.monto).toBe(89);
    expect(d.advertencias.some((w) => w.includes("mensualiza"))).toBe(true);
  });

  it("una herramienta que arranca a mitad de año sigue siendo mensual", () => {
    // Supabase: la LISTA de arriba la trae dos veces (300 anual y 25 mensual); la
    // grilla resuelve que es mensual desde junio. Por eso la fuente es la grilla.
    const s = tools.find((t) => t.nombre === "SUPA BASE")!;
    expect(s.frecuencia).toBe("MENSUAL");
    expect(s.monto).toBe(25);
    expect(s.mesesConCargo).toHaveLength(7);
  });

  it("sin importe en ningún mes no se inventa un monto", () => {
    const c = tools.find((t) => t.nombre === "Claude")!;
    expect(c.monto).toBe(0);
    expect(c.advertencias[0]).toContain("sin importe");
  });

  it("la fila TOTAL del documento no es una herramienta", () => {
    expect(tools.some((t) => /^total/i.test(t.nombre))).toBe(false);
  });

  it("una celda con HIPERVÍNCULO tiene nombre igual — no desaparece", () => {
    // Caso real: dos herramientas de la grilla traen `{text, hyperlink}` en vez de
    // un string. Leerlas como vacías las borraba del import sin un solo error.
    const conLink: FilaCruda = {
      fila: 32,
      celdas: [
        { valor: { text: "HubSpot", hyperlink: "https://app.hubspot.com/…" } },
        ...new Array(12).fill(n(535)),
      ],
    };
    const [h] = leerHerramientas([conLink], MESES);
    expect(h!.nombre).toBe("HubSpot");
    expect(h!.monto).toBe(535);
  });
});

describe("leerSalarios — acá el formato SÍ dice la moneda", () => {
  const COLS = { pais: 1, nombre: 2, puesto: 3, monto: 4 };
  const fila = (f: number, pais: string, nombre: string, puesto: string, monto: CeldaCruda): FilaCruda => ({
    fila: f,
    celdas: [txt(pais), txt(nombre), txt(puesto), monto],
  });

  const filas = [
    fila(2, "Costa Rica", "Alejandro Salas", "Solution Architect", n(918000, "[$₡]#,##0.00")),
    fila(3, "", "", "", vacia),
    fila(13, "", "Jerson Escudero", "CSL de Implementación", n(1200, '"$"#,##0.00')),
    fila(26, "Nicaragüa", "Lidia Flores", "Diseñadora Grafica", n(1200, '"$"#,##0.00')),
    fila(31, "Total", "", "", { valor: { formula: "SUM(D14:D29)+(D2+D4)/500", result: 19804 } }),
  ];
  const salarios = leerSalarios(filas, COLS);

  it("separa colones de dólares por el formato de cada fila", () => {
    expect(salarios[0]).toMatchObject({ nombre: "Alejandro Salas", monto: 918000, moneda: "CRC" });
    expect(salarios[1]).toMatchObject({ nombre: "Jerson Escudero", monto: 1200, moneda: "USD" });
  });

  it("el país se arrastra hacia abajo hasta que aparece otro", () => {
    expect(salarios[0]!.pais).toBe("Costa Rica");
    // Jerson no tiene país en su fila: hereda el del grupo, no queda vacío.
    expect(salarios[1]!.pais).toBe("Costa Rica");
    expect(salarios[2]!.pais).toBe("Nicaragüa");
  });

  it("las filas vacías y la de TOTAL no son colaboradores", () => {
    // ⚠ Ese total del documento arranca en D14 y se come a Jerson: leerlo como
    // persona metería una fila fantasma de 19804.
    expect(salarios).toHaveLength(3);
    expect(salarios.some((s) => s.nombre === "Total" || s.monto === 19804)).toBe(false);
  });
});

describe("leerHistorialSalarios — la historia, que es lo que el aguinaldo necesita", () => {
  const PERIODO = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // C..N = dic..nov

  function filaHist(f: number, nombre: string, montos: number[], numFmt: string): FilaCruda {
    const celdas: CeldaCruda[] = new Array(14).fill(vacia);
    celdas[1] = txt(nombre);
    montos.forEach((m, i) => {
      celdas[2 + i] = n(m, numFmt);
    });
    return { fila: f, celdas };
  }

  const filas = [
    filaHist(8, "Marco Salas", new Array(12).fill(1200000), "[$₡]#,##0"),
    // Elías arranca en abril: los ceros de diciembre a marzo son DATO, no huecos.
    filaHist(12, "Elías González", [0, 0, 0, 0, 1400000, 1400000, 1400000, 1400000, 1500000, 1500000, 1500000, 1500000], "[$₡]#,##0"),
    filaHist(20, "Heiver Gómez", new Array(12).fill(1000), '"$"#,##0'),
  ];
  const hist = leerHistorialSalarios(filas, PERIODO);

  it("trae los doce meses de cada persona con su moneda", () => {
    expect(hist).toHaveLength(3);
    expect(hist[0]).toMatchObject({ nombre: "Marco Salas", moneda: "CRC", mesesConSalario: 12 });
    expect(hist[2]!.moneda).toBe("USD");
  });

  it("quien entró a mitad de período queda con su cobertura real", () => {
    const elias = hist[1]!;
    expect(elias.meses).toHaveLength(12);
    expect(elias.mesesConSalario).toBe(8);
    // La suma /12 es exactamente el aguinaldo proporcional, sin fecha de ingreso.
    const suma = elias.meses.reduce((acc, m) => acc + m.monto, 0);
    expect(suma / 12).toBeCloseTo(966666.6667, 2);
  });

  it("la moneda se toma del primer mes CON monto, no de un cero sin formato", () => {
    expect(hist[1]!.moneda).toBe("CRC");
  });
});

/**
 * La serie mensual — el detalle que el decodificador leía y tiraba.
 *
 * Lo que se prueba acá no es aritmética: es que el mes al que aterriza cada monto salga
 * del ENCABEZADO y no de una cuenta sobre el número de columna. Ese bug no se ve — la
 * serie se corre un mes, el total del año sigue cuadrando y nada chilla.
 */
describe("mesDeEncabezado — de qué mes habla una columna", () => {
  it("el nombre completo, con o sin mayúscula", () => {
    expect(mesDeEncabezado("Abril")).toBe(4);
    expect(mesDeEncabezado("diciembre")).toBe(12);
  });

  it("«Setiembre» sin p es septiembre: así se escribe en Costa Rica la mitad de las veces", () => {
    expect(mesDeEncabezado("Setiembre")).toBe(9);
    expect(mesDeEncabezado("SET")).toBe(9);
  });

  it("una FECHA real se lee por su mes y el año basura de la plantilla se ignora", () => {
    // Los encabezados de estas hojas traen 2022/2025 por herencia de la plantilla.
    expect(mesDeEncabezado(new Date(Date.UTC(2022, 3, 15)))).toBe(4);
    expect(mesDeEncabezado(new Date(Date.UTC(2025, 10, 30)))).toBe(11);
  });

  it("una abreviatura AMBIGUA devuelve null en vez de elegir la primera", () => {
    // "ma" es marzo y mayo. Elegir marzo movería medio año de costos sin avisar.
    expect(mesDeEncabezado("ma")).toBeNull();
    expect(mesDeEncabezado("m")).toBeNull();
  });

  it("lo que no es un mes no se fuerza a serlo", () => {
    expect(mesDeEncabezado("Total")).toBeNull();
    expect(mesDeEncabezado("")).toBeNull();
    expect(mesDeEncabezado(null)).toBeNull();
    expect(mesDeEncabezado(42)).toBeNull();
  });
});

describe("mesesDeEncabezado + serieMensualDe — el monto cae en SU mes", () => {
  /** Fila de encabezado del bloque vivo: K..S = abril..diciembre. */
  const encabezado: FilaCruda = (() => {
    const celdas: CeldaCruda[] = new Array(19).fill(vacia);
    celdas[0] = txt("Mes");
    ["Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"].forEach(
      (m, i) => {
        celdas[10 + i] = txt(m);
      },
    );
    return { fila: 7, celdas };
  })();

  it("mapea cada columna visible a su mes de calendario", () => {
    const mapa = mesesDeEncabezado(encabezado, VIVAS);
    expect(mapa.size).toBe(9);
    expect(mapa.get(11)).toBe(4); // K = abril
    expect(mapa.get(19)).toBe(12); // S = diciembre
  });

  it("una columna con encabezado ilegible NO entra al mapa: se declara, no se adivina", () => {
    const roto: FilaCruda = {
      ...encabezado,
      celdas: encabezado.celdas.map((c, i) => (i === 12 ? txt("???") : c)),
    };
    const mapa = mesesDeEncabezado(roto, VIVAS);
    expect(mapa.size).toBe(8);
    expect(mapa.has(13)).toBe(false);
  });

  it("el CERO explícito sobrevive: «no se cobró» no es lo mismo que «no se pudo leer»", () => {
    const fila = filaFija(15, "Patente", [n(0), n(90), n(30), n(30), n(30), n(30), n(30), n(90), n(30)]);
    const [c] = leerCostosFijos([fila], VIVAS);
    const serie = serieMensualDe(c!.meses, mesesDeEncabezado(encabezado, VIVAS));
    expect(serie).toHaveLength(9);
    expect(serie[0]).toMatchObject({ mes: 4, monto: 0 });
  });

  it("una celda ilegible no produce un mes en cero — produce un hueco", () => {
    const fila = filaFija(15, "Patente", [vacia, n(90), n(30), n(30), n(30), n(30), n(30), n(90), n(30)]);
    const [c] = leerCostosFijos([fila], VIVAS);
    const serie = serieMensualDe(c!.meses, mesesDeEncabezado(encabezado, VIVAS));
    expect(serie).toHaveLength(8);
    expect(serie.some((s) => s.mes === 4)).toBe(false);
  });

  it("EL CASO QUE MOTIVA TODO: el concepto que no se puede cargar como costo SÍ tiene serie", () => {
    // La patente se triplica tres veces al año, así que `motivoParaNoCargar` la deja
    // afuera del burn — con razón, porque no hay un monto mensual honesto. Pero su
    // serie mes a mes existe y es justo la que más se nota en la curva del año.
    const fila = filaFija(15, "Patente", [n(30), n(90), n(30), n(30), n(90), n(30), n(30), n(90), n(30)]);
    const [c] = leerCostosFijos([fila], VIVAS);
    expect(motivoParaNoCargar(c!)).toBe("el monto no es el mismo todos los meses");

    const serie = serieMensualDe(c!.meses, mesesDeEncabezado(encabezado, VIVAS));
    expect(serie).toHaveLength(9);
    expect(serie.filter((s) => s.monto === 90).map((s) => s.mes)).toEqual([5, 8, 11]);
    expect(serie.reduce((acc, s) => acc + s.monto, 0)).toBe(450);
  });

  it("la serie sale ordenada por mes aunque las columnas vengan desordenadas", () => {
    const mapa = new Map([
      [11, 12],
      [12, 4],
    ]);
    const serie = serieMensualDe(
      [
        { col: 11, monto: { monto: 100, moneda: "USD", monedaInferida: false } },
        { col: 12, monto: { monto: 200, moneda: "USD", monedaInferida: false } },
      ],
      mapa,
    );
    expect(serie.map((s) => s.mes)).toEqual([4, 12]);
  });
});

describe("Herramienta.meses — el pago anual cae en su mes real", () => {
  const MESES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // B..M = ene..dic

  function filaTool(fila: number, nombre: string, montos: Array<number | null>): FilaCruda {
    const celdas: CeldaCruda[] = new Array(13).fill(vacia);
    celdas[0] = txt(nombre);
    montos.forEach((m, i) => {
      celdas[1 + i] = m === null ? vacia : n(m);
    });
    return { fila, celdas };
  }

  it("un cargo de un solo mes queda en JULIO, no repartido en doce", () => {
    // DIVI: el burn lo mensualiza /12 (89/12 = 7.42 por mes, que no ocurrió nunca).
    // El libro de egresos lo pone donde pasó de verdad.
    const [divi] = leerHerramientas(
      [filaTool(43, "DIVI", [null, null, null, null, null, null, 89, null, null, null, null, null])],
      MESES,
    );
    expect(divi!.frecuencia).toBe("ANUAL");
    expect(divi!.meses).toEqual([{ mes: 7, monto: 89, moneda: "USD", monedaInferida: true }]);
  });

  it("una herramienta que sube de precio se ve subiendo, no aplanada en la moda", () => {
    const [h] = leerHerramientas([filaTool(32, "HubSpot", [535, 535, 535, 535, 535, 600, 600, 600, 600, 600, 600, 600])], MESES);
    expect(h!.monto).toBe(600); // la moda, que es lo que usa el burn
    expect(h!.meses.filter((m) => m.monto === 535).map((m) => m.mes)).toEqual([1, 2, 3, 4, 5]);
    expect(h!.meses).toHaveLength(12);
  });

  it("sin cargos la serie es vacía, no un mes en cero", () => {
    const [c] = leerHerramientas([filaTool(48, "Claude", new Array(12).fill(null))], MESES);
    expect(c!.meses).toEqual([]);
  });

  it("con mapa de encabezado manda el encabezado, no la posición de la columna", () => {
    // La defensa contra la columna insertada a mano: si la grilla se corre, el
    // encabezado sigue diciendo la verdad y la serie no se desplaza en silencio.
    const mapa = new Map(MESES.map((col, i) => [col, ((i + 6) % 12) + 1])); // corrida 6 meses
    const [h] = leerHerramientas([filaTool(49, "SUPA BASE", [25, null, null, null, null, null, null, null, null, null, null, null])], MESES, mapa);
    expect(h!.meses).toEqual([{ mes: 7, monto: 25, moneda: "USD", monedaInferida: true }]);
  });
});
