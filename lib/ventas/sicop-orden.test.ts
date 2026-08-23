/**
 * lib/ventas/sicop-orden.test.ts — LO QUE LA PANTALLA ESCONDE Y EN QUÉ ORDEN LO PONE.
 *
 * Correr: `npx vitest run lib/ventas/sicop-orden.test.ts --project unit`.
 *
 * El riesgo de este módulo no es que se vea feo: es que ESCONDA una licitación real. Dos de
 * los cortes vienen encendidos por default (lo ya cerrado y lo que la IA marcó FUERA), así
 * que un error acá no produce una pantalla rota sino una pantalla que se ve perfecta con una
 * venta menos adentro. Eso no lo caza mirar.
 *
 * Lo otro que se congela es el trato de los NULL al ordenar: "todavía no lo sabemos" no
 * puede ordenarse como "es lo peor" ni como "es lo mejor".
 */
import { describe, expect, it } from "vitest";
import {
  COLONES_POR_DOLAR_APROX,
  FILTRO_VACIO,
  contarOcultas,
  fechaLimiteDe,
  filtrarLicitaciones,
  montoComparable,
  ordenarLicitaciones,
  type EncajeSicop,
  type FilaSicop,
  type LecturaSicop,
} from "./sicop-orden";

const HOY = new Date("2026-08-23T12:00:00Z");

function lectura(p: Partial<LecturaSicop> = {}): LecturaSicop {
  return {
    objeto: null,
    institucion: null,
    categorias: [],
    encaje: "DUDOSO",
    encajeRazon: null,
    puntajeEncaje: null,
    probabilidad: null,
    probabilidadRazon: null,
    bloqueantes: [],
    evaluacion: null,
    pesoPrecio: null,
    entregables: null,
    plazos: [],
    monto: null,
    moneda: null,
    confianza: null,
    notasLeidas: 0,
    adjuntosSinLeer: 0,
    profundo: false,
    adjuntosLeidos: 0,
    fuenteTruncada: false,
    analizadoEl: "2026-08-20T00:00:00.000Z",
    modelo: "claude-sonnet-4-6",
    error: null,
    ...p,
  };
}

function fila(id: string, p: Partial<FilaSicop> = {}): FilaSicop {
  return {
    id,
    asunto: `Licitación ${id}`,
    detalle: null,
    procedimiento: null,
    tipoContratacion: null,
    formatoEvaluacion: null,
    fechaAclaraciones: null,
    motivoPerdida: null,
    responsable: null,
    creadaEl: null,
    actualizadaEl: "2026-08-01T00:00:00.000Z",
    presupuestoCrm: null,
    etapa: { id: "analisis", label: "Análisis de licitación", orden: 0, cerrada: false },
    lectura: null,
    filtro: null,
    datosDelProcedimiento: null,
    notas: [],
    archivos: [],
    notasIncompletas: 0,
    movidoDespues: false,
    ...p,
  };
}

const cerrada = { id: "perdido", label: "Perdido", orden: 9, cerrada: true };

// ── Filtros ────────────────────────────────────────────────────────────────────

describe("filtrarLicitaciones — los dos cortes que vienen encendidos", () => {
  it("«solo en juego» esconde lo que está en una etapa que CIERRA", () => {
    const filas = [fila("viva"), fila("muerta", { etapa: cerrada })];
    expect(filtrarLicitaciones(filas, FILTRO_VACIO).map((f) => f.id)).toEqual(["viva"]);
    expect(
      filtrarLicitaciones(filas, { ...FILTRO_VACIO, soloEnJuego: false }).map((f) => f.id),
    ).toEqual(["viva", "muerta"]);
  });

  it("esconde lo que la IA marcó FUERA, y lo devuelve con `verDescartadas`", () => {
    const filas = [
      fila("dentro", { lectura: lectura({ encaje: "DENTRO" }) }),
      fila("fuera", { lectura: lectura({ encaje: "FUERA" }) }),
    ];
    expect(filtrarLicitaciones(filas, FILTRO_VACIO).map((f) => f.id)).toEqual(["dentro"]);
    expect(
      filtrarLicitaciones(filas, { ...FILTRO_VACIO, verDescartadas: true }).map((f) => f.id),
    ).toEqual(["dentro", "fuera"]);
  });

  it("⛔ una licitación SIN ANALIZAR nunca se esconde", () => {
    /* La edición que la pone en rojo: tratar `lectura === null` como descartada. Sin análisis
       no es "no sirve": es "nadie la miró todavía", y esconderla pierde una venta real por un
       trabajo pendiente — el peor error posible de esta pantalla. */
    const filas = [fila("sin-leer", { lectura: null })];
    expect(filtrarLicitaciones(filas, FILTRO_VACIO).map((f) => f.id)).toEqual(["sin-leer"]);
  });

  it("filtrar por encaje EXIGE lectura: una sin analizar no cuela en «Dentro»", () => {
    const filas = [
      fila("dentro", { lectura: lectura({ encaje: "DENTRO" }) }),
      fila("sin-leer"),
    ];
    const encajes: EncajeSicop[] = ["DENTRO"];
    expect(filtrarLicitaciones(filas, { ...FILTRO_VACIO, encajes }).map((f) => f.id)).toEqual([
      "dentro",
    ]);
  });

  it("la categoría es «alguna de», no «todas»", () => {
    const filas = [
      fila("web", { lectura: lectura({ categorias: ["sitio-web", "hosting"] }) }),
      fila("crm", { lectura: lectura({ categorias: ["crm"] }) }),
      fila("sin-leer"),
    ];
    expect(
      filtrarLicitaciones(filas, { ...FILTRO_VACIO, categorias: ["hosting"] }).map((f) => f.id),
    ).toEqual(["web"]);
  });

  it("el buscador entra al objeto y a la institución, sin tildes ni mayúsculas", () => {
    const filas = [
      fila("a", { lectura: lectura({ institucion: "Municipalidad de Garabito" }) }),
      fila("b", { lectura: lectura({ objeto: "Hospedaje de sitios web" }) }),
      fila("c", { procedimiento: "2025LD-000064-0021800611" }),
    ];
    const busca = (t: string) =>
      filtrarLicitaciones(filas, { ...FILTRO_VACIO, texto: t }).map((f) => f.id);
    expect(busca("garabito")).toEqual(["a"]);
    expect(busca("MUNICIPALIDAD")).toEqual(["a"]);
    expect(busca("hospedaje")).toEqual(["b"]);
    expect(busca("0021800611")).toEqual(["c"]);
  });
});

describe("contarOcultas — la pantalla declara lo que está escondiendo", () => {
  it("cuenta por separado lo cerrado y lo descartado, sin contar dos veces", () => {
    /* Una fila cerrada Y descartada se cuenta UNA vez (como cerrada): si se contara en las
       dos, la línea de estado sumaría más de lo que hay y nadie volvería a creerle. */
    const filas = [
      fila("viva"),
      fila("muerta", { etapa: cerrada }),
      fila("muerta-y-fuera", { etapa: cerrada, lectura: lectura({ encaje: "FUERA" }) }),
      fila("fuera", { lectura: lectura({ encaje: "FUERA" }) }),
    ];
    expect(contarOcultas(filas, FILTRO_VACIO)).toEqual({ porCerrada: 2, porDescartada: 1 });
  });

  it("con los cortes apagados no esconde nada", () => {
    const filas = [fila("muerta", { etapa: cerrada, lectura: lectura({ encaje: "FUERA" }) })];
    expect(
      contarOcultas(filas, { ...FILTRO_VACIO, soloEnJuego: false, verDescartadas: true }),
    ).toEqual({ porCerrada: 0, porDescartada: 0 });
  });
});

// ── Orden ──────────────────────────────────────────────────────────────────────

describe("ordenarLicitaciones — lo que no se sabe va al final, nunca al principio", () => {
  it("por encaje: DENTRO, DUDOSO, FUERA y al final lo no analizado", () => {
    const filas = [
      fila("sin-leer"),
      fila("fuera", { lectura: lectura({ encaje: "FUERA" }) }),
      fila("dentro", { lectura: lectura({ encaje: "DENTRO" }) }),
      fila("dudoso", { lectura: lectura({ encaje: "DUDOSO" }) }),
    ];
    expect(ordenarLicitaciones(filas, "encaje", HOY).map((f) => f.id)).toEqual([
      "dentro",
      "dudoso",
      "fuera",
      "sin-leer",
    ]);
  });

  it("dentro del mismo encaje desempata el puntaje", () => {
    const filas = [
      fila("bajo", { lectura: lectura({ encaje: "DENTRO", puntajeEncaje: 40 }) }),
      fila("alto", { lectura: lectura({ encaje: "DENTRO", puntajeEncaje: 90 }) }),
    ];
    expect(ordenarLicitaciones(filas, "encaje", HOY).map((f) => f.id)).toEqual(["alto", "bajo"]);
  });

  it("por probabilidad: sin probabilidad va al final, no como cero", () => {
    /* La diferencia importa: un null que ordena como 0 se lee como "es la peor de la lista",
       y lo que dice de verdad es "el texto no alcanzaba para juzgarlo". */
    const filas = [
      fila("sin"),
      fila("baja", { lectura: lectura({ probabilidad: 10 }) }),
      fila("alta", { lectura: lectura({ probabilidad: 80 }) }),
    ];
    expect(ordenarLicitaciones(filas, "probabilidad", HOY).map((f) => f.id)).toEqual([
      "alta",
      "baja",
      "sin",
    ]);
  });

  it("por monto: los colones se comparan contra los dólares, y lo sin monto va al final", () => {
    const filas = [
      fila("sin"),
      fila("usd", { lectura: lectura({ monto: 40_000, moneda: "USD" }) }),
      // 30 millones de colones ≈ US$59.400: gana al de 40.000 dólares.
      fila("crc", { lectura: lectura({ monto: 30_000_000, moneda: "CRC" }) }),
    ];
    expect(ordenarLicitaciones(filas, "monto", HOY).map((f) => f.id)).toEqual([
      "crc",
      "usd",
      "sin",
    ]);
  });

  it("por etapa respeta el orden del portal", () => {
    const filas = [
      fila("tarde", { etapa: cerrada }),
      fila("temprano", { etapa: { id: "a", label: "Análisis", orden: 0, cerrada: false } }),
    ];
    expect(ordenarLicitaciones(filas, "etapa", HOY).map((f) => f.id)).toEqual([
      "temprano",
      "tarde",
    ]);
  });

  it("ordenar NO muta la lista que recibe", () => {
    const filas = [fila("b", { etapa: cerrada }), fila("a")];
    const copia = filas.map((f) => f.id);
    ordenarLicitaciones(filas, "etapa", HOY);
    expect(filas.map((f) => f.id)).toEqual(copia);
  });
});

describe("montoComparable", () => {
  it("sin moneda declarada asume dólares (no inventa magnitud)", () => {
    expect(montoComparable(fila("x", { lectura: lectura({ monto: 1000 }) }))).toBe(1000);
  });

  it("colones se dividen por la tasa declarada", () => {
    expect(montoComparable(fila("x", { lectura: lectura({ monto: 1010, moneda: "CRC" }) }))).toBe(
      1010 / COLONES_POR_DOLAR_APROX,
    );
  });

  it("sin lectura o sin monto devuelve null, no cero", () => {
    expect(montoComparable(fila("x"))).toBeNull();
    expect(montoComparable(fila("x", { lectura: lectura() }))).toBeNull();
  });
});

// ── Fecha límite ───────────────────────────────────────────────────────────────

describe("fechaLimiteDe — «lo que vence antes» no puede ser lo que venció en 2022", () => {
  it("⛔ IGNORA los plazos ya vencidos", () => {
    /* La edición que la pone en rojo: tomar el mínimo de todas las fechas. Un cartel de 2022
       con apertura vencida encabezaría el orden por cierre — la licitación más muerta del
       pipeline en el primer puesto, que es lo contrario de para qué se ordena por cierre. */
    const f = fila("x", {
      lectura: lectura({
        plazos: [
          { etiqueta: "Apertura", fecha: "2022-03-01", nota: null },
          { etiqueta: "Adjudicación", fecha: "2026-12-01", nota: null },
        ],
      }),
    });
    expect(fechaLimiteDe(f, HOY)).toBe("2026-12-01");
  });

  it("toma el plazo futuro MÁS CERCANO", () => {
    const f = fila("x", {
      lectura: lectura({
        plazos: [
          { etiqueta: "Ejecución", fecha: "2027-01-01", nota: null },
          { etiqueta: "Aclaraciones", fecha: "2026-09-05", nota: null },
        ],
      }),
    });
    expect(fechaLimiteDe(f, HOY)).toBe("2026-09-05");
  });

  it("sin plazos de IA cae a la fecha de aclaraciones del CRM", () => {
    const f = fila("x", { fechaAclaraciones: "2026-10-10" });
    expect(fechaLimiteDe(f, HOY)).toBe("2026-10-10");
  });

  it("si todo venció devuelve null (no la menos vieja)", () => {
    const f = fila("x", {
      fechaAclaraciones: "2025-11-18",
      lectura: lectura({ plazos: [{ etiqueta: "Apertura", fecha: "2025-12-01", nota: null }] }),
    });
    expect(fechaLimiteDe(f, HOY)).toBeNull();
  });

  it("una fecha basura no rompe el orden", () => {
    const f = fila("x", {
      lectura: lectura({ plazos: [{ etiqueta: "Raro", fecha: "cuando salga", nota: null }] }),
    });
    expect(fechaLimiteDe(f, HOY)).toBeNull();
  });
});
