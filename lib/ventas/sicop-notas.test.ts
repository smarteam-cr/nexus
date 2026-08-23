/**
 * lib/ventas/sicop-notas.test.ts — EL LECTOR DE LAS NOTAS DEL SCRAPER.
 *
 * Correr: `npx vitest run lib/ventas/sicop-notas.test.ts --project unit`.
 *
 * ── POR QUÉ ESTE ARCHIVO ES LA ESPECIFICACIÓN ────────────────────────────────
 * El scraper está en desarrollo: el 2026-08-23 creó tres tickets y los borró el mismo día, y
 * no dejó en el portal ni una nota «Detalles del procedimiento». O sea que NO HAY datos vivos
 * contra los cuales verificar. Los dos ejemplos que pasó Elías, transcritos acá literalmente,
 * son lo único que hace de contrato — más el formato VIEJO que sigue vivo en el ticket de
 * Garabito, que tiene que seguir funcionando al mismo tiempo.
 *
 * Lo que se congela:
 *   1. Los dos vocabularios conviven (`high_confidence` y `relevant`).
 *   2. Score y Confianza salen bien de la escala 0-1 — son lo que PRIORIZA la pantalla.
 *   3. Un campo que el lector no conoce NO se pierde.
 *   4. Una nota incompleta se DENUNCIA (`faltantes`) en vez de devolver null en silencio.
 */
import { describe, expect, it } from "vitest";
import {
  aFechaIso,
  aMonto,
  aPuntaje,
  aVeredicto,
  clasificar,
  etiquetaDeArchivos,
  extraerCampos,
  leerNota,
  resumirNotas,
} from "./sicop-notas";

/** Como llega desde HubSpot: markdown crudo dentro del cuerpo de la nota. */
const FILTRO_NUEVO = `**Decisión:** high_confidence

**Score:** 1

**Confianza:** 0.95

**Razón:** El procedimiento solicita explícitamente el servicio de alojamiento web (hosting) y correo electrónico institucional, con una línea de hospedaje de sitios web. Match directo y de alta confianza con track_hosting.`;

/** El formato VIEJO, tal como sigue vivo hoy en el ticket de Garabito (HTML de HubSpot). */
const FILTRO_VIEJO =
  '<div><p>Análisis del filtro</p><p><br></p><p><strong>Decisión</strong>: relevant</p>' +
  "<p><strong>Score:</strong> 0.8</p><p><strong>Confianza:</strong> 0.85</p>" +
  "<p><strong>Razón:</strong> El procedimiento es para servicios de estrategia y cartografía de marca.</p></div>";

const PROCEDIMIENTO = `### Detalles del procedimiento

_2026-08-21T19:34:41.299Z_

**Monto estimado:** 3800000

**Tipo de procedimiento:** LD

**Fecha límite de aclaraciones:** 2026-08-24T23:59:00-06:00

**Fecha límite de recurso de objeción:** 2026-08-25T23:59:00-06:00

**Admisibilidad del recurso de objeción:** Admisible

**Multas:** Sin perjuicio de la aplicación de la cláusula penal por atrasos, la Municipalidad podrá aplicar multas por incumplimientos parciales de las obligaciones contractuales, de acuerdo con las siguientes co`;

const nota = (cuerpo: string, p: { id?: string; creadaEl?: string; adjuntos?: number } = {}) => ({
  id: p.id ?? "n1",
  creadaEl: p.creadaEl ?? "2026-08-21T19:34:41.299Z",
  cuerpo,
  adjuntos: p.adjuntos ?? 0,
});

// ── El caso de oro: la nota de filtro ──────────────────────────────────────────

describe("«Análisis del filtro» — lo que PRIORIZA la pantalla", () => {
  it("⭐ lee el formato nuevo entero (el ejemplo de Elías, literal)", () => {
    const n = leerNota(nota(FILTRO_NUEVO));
    // El título va en el cuerpo del ejemplo nuevo solo a veces; la clase la fija el llamador
    // cuando el encabezado falta. Acá se prueba la EXTRACCIÓN.
    expect(n.campos.map((c) => c.clave)).toEqual(["decision", "score", "confianza", "razon"]);
    const f = leerNota({ ...nota(`Análisis del filtro\n${FILTRO_NUEVO}`) }).filtro!;
    expect(f.decision).toBe("high_confidence");
    expect(f.veredicto).toBe("RELEVANTE");
    expect(f.score).toBe(100);
    expect(f.confianza).toBe(95);
    expect(f.track).toBe("track_hosting");
    expect(f.razon).toContain("alojamiento web (hosting)");
  });

  it("⭐ el formato VIEJO sigue funcionando al mismo tiempo", () => {
    /* La edición que la pone en rojo: reescribir el lector para el vocabulario nuevo. El
       ticket de Garabito todavía tiene esta nota y su score es real. */
    const f = leerNota(nota(FILTRO_VIEJO)).filtro!;
    expect(f.decision).toBe("relevant");
    expect(f.veredicto).toBe("RELEVANTE");
    expect(f.score).toBe(80);
    expect(f.confianza).toBe(85);
  });

  it("reconoce el encabezado con el typo real del scraper («fittro»)", () => {
    expect(clasificar("Análisis del fittro", 0)).toBe("FILTRO");
    expect(clasificar("Análisis de filtro", 0)).toBe("FILTRO");
    expect(clasificar("ANÁLISIS DEL FILTRO", 0)).toBe("FILTRO");
  });

  it("⛔ una nota de filtro SIN Score se denuncia en vez de pasar por buena", () => {
    /* Es el modo de falla del drift: el scraper cambia el nombre del campo, el lector
       devuelve null, y la pantalla muestra «sin priorizar» — que se lee como que no hay
       trabajo, no como que se rompió algo. */
    const n = leerNota(nota("Análisis del filtro\nDecisión: relevant\nConfianza: 0.9"));
    expect(n.filtro!.score).toBeNull();
    expect(n.faltantes).toEqual(["Score", "Razón"]);
  });
});

// ── El caso de oro: los datos del procedimiento ────────────────────────────────

describe("«Detalles del procedimiento» — lo que alimenta las columnas de la tabla", () => {
  const n = leerNota(nota(PROCEDIMIENTO));

  it("⭐ saca los seis campos del ejemplo de Elías", () => {
    const p = n.procedimiento!;
    expect(p.montoEstimado).toBe(3_800_000);
    expect(p.tipoProcedimiento).toBe("LD");
    expect(p.fechaAclaraciones).toBe("2026-08-24T23:59:00-06:00");
    expect(p.fechaObjecion).toBe("2026-08-25T23:59:00-06:00");
    expect(p.admisibilidadObjecion).toBe("Admisible");
    expect(p.multas).toContain("cláusula penal por atrasos");
    expect(n.faltantes).toEqual([]);
  });

  it("⚠ el timestamp suelto NO se lee como un campo", () => {
    /* `_2026-08-21T19:34:41.299Z_` lleva dos puntos y sin guarda produce el campo
       «_2026-08-21T19» con valor «34:41.299Z_» — basura que además se cuela en la pantalla. */
    expect(n.campos.some((c) => c.clave.startsWith("2026"))).toBe(false);
    expect(n.campos.map((c) => c.clave)).toEqual([
      "monto estimado",
      "tipo de procedimiento",
      "fecha limite de aclaraciones",
      "fecha limite de recurso de objecion",
      "admisibilidad del recurso de objecion",
      "multas",
    ]);
  });
});

// ── Tolerancia al drift ────────────────────────────────────────────────────────

describe("nada se descarta", () => {
  it("⛔ un campo que el lector NO conoce sobrevive en `campos`", () => {
    const n = leerNota(nota("Detalles del procedimiento\nMonto estimado: 100\nCanton adjudicador: Escazú"));
    expect(n.procedimiento!.montoEstimado).toBe(100);
    expect(n.campos.find((c) => c.clave === "canton adjudicador")?.valor).toBe("Escazú");
  });

  it("una nota que no es de ninguna clase conocida se conserva entera", () => {
    const n = leerNota(nota("<p>@Marco Salas ver especificaciones del concurso</p>"));
    expect(n.clase).toBe("HUMANA");
    expect(n.texto).toContain("@Marco Salas ver especificaciones");
    expect(n.faltantes).toEqual([]);
  });

  it("una nota vacía con archivo es el cartel", () => {
    expect(clasificar("", 1)).toBe("ARCHIVO");
    expect(clasificar("", 0)).toBe("HUMANA");
  });

  it("una URL en el texto no se convierte en campo", () => {
    const campos = extraerCampos("Ver https://sicop.go.cr/expediente\nTipo de procedimiento: LD");
    expect(campos.map((c) => c.clave)).toEqual(["tipo de procedimiento"]);
  });

  it("un valor MULTILÍNEA no se corta en el salto", () => {
    /* «Multas» y «Razón» se desbordan varias líneas; cortar en el primer salto mutila justo
       la parte que explica por qué la licitación importa. */
    const campos = extraerCampos("Razón: primera línea\nsegunda línea\nScore: 0.5");
    expect(campos[0].valor).toBe("primera línea segunda línea");
    expect(campos[1].valor).toBe("0.5");
  });
});

// ── Normalizadores ─────────────────────────────────────────────────────────────

describe("aPuntaje — la escala 0-1 del scraper a 0-100", () => {
  it("convierte las cuatro formas observadas", () => {
    expect(aPuntaje("0.95")).toBe(95);
    expect(aPuntaje("0,85")).toBe(85);
    expect(aPuntaje("95")).toBe(95);
    expect(aPuntaje("95%")).toBe(95);
  });

  it("⚠ `1` es el máximo, no el 1%", () => {
    // Todos los valores del portal viven en 0-1 (0.3 · 0.55 · 0.8 · 0.85 · 0.95 · 1).
    expect(aPuntaje("1")).toBe(100);
    expect(aPuntaje("0")).toBe(0);
  });

  it("basura devuelve null, no cero", () => {
    for (const v of ["", "alto", null, undefined, "-1"]) expect(aPuntaje(v)).toBeNull();
  });
});

describe("aMonto", () => {
  it("acepta el número pelado y las formas con separadores", () => {
    expect(aMonto("3800000")).toBe(3_800_000);
    expect(aMonto("₡3.800.000")).toBe(3_800_000);
    expect(aMonto("3,800,000")).toBe(3_800_000);
    expect(aMonto("USD 12 500")).toBe(12_500);
  });

  it("sin número devuelve null", () => {
    for (const v of ["", "a convenir", null]) expect(aMonto(v)).toBeNull();
  });
});

describe("aFechaIso", () => {
  it("conserva la ISO con huso tal como vino", () => {
    expect(aFechaIso("2026-08-24T23:59:00-06:00")).toBe("2026-08-24T23:59:00-06:00");
    expect(aFechaIso("2026-08-24")).toBe("2026-08-24");
  });

  it("una fecha en prosa devuelve null (el crudo sigue en `campos`)", () => {
    expect(aFechaIso("24 de agosto")).toBeNull();
    expect(aFechaIso("")).toBeNull();
  });
});

describe("aVeredicto — los dos vocabularios a uno solo", () => {
  it("mapea lo conocido y NO fuerza lo desconocido", () => {
    expect(aVeredicto("high_confidence")).toBe("RELEVANTE");
    expect(aVeredicto("relevant")).toBe("RELEVANTE");
    expect(aVeredicto("doubt")).toBe("DUDA");
    expect(aVeredicto("discard")).toBe("DESCARTE");
    expect(aVeredicto("verde_lima")).toBe("OTRO");
    expect(aVeredicto(null)).toBe("OTRO");
  });
});

// ── El resumen del ticket ──────────────────────────────────────────────────────

describe("resumirNotas — lo que consume la tabla", () => {
  it("⚠ gana la nota MÁS NUEVA, no la primera", () => {
    /* El scraper vuelve a correr cuando cambia el cartel y la corrección llega como nota
       nueva. Quedarse con la vieja mostraría un monto o una fecha que ya no rige. */
    const r = resumirNotas([
      nota("Análisis del filtro\nDecisión: doubt\nScore: 0.3\nConfianza: 0.4\nRazón: vieja", {
        id: "vieja",
        creadaEl: "2026-08-01T00:00:00Z",
      }),
      nota("Análisis del filtro\nDecisión: relevant\nScore: 0.9\nConfianza: 0.9\nRazón: nueva", {
        id: "nueva",
        creadaEl: "2026-08-20T00:00:00Z",
      }),
    ]);
    expect(r.filtro!.score).toBe(90);
    expect(r.filtro!.razon).toBe("nueva");
    expect(r.notas[0].id).toBe("nueva");
  });

  it("cuenta texto, archivos e incompletas por separado", () => {
    const r = resumirNotas([
      nota("Análisis del filtro\nDecisión: relevant", { id: "a" }),
      nota("", { id: "b", adjuntos: 2 }),
      nota("<p>ACLARACIONES TECNICAS</p>", { id: "c", adjuntos: 1 }),
    ]);
    expect(r.conTexto).toBe(2);
    expect(r.archivos).toBe(3);
    expect(r.incompletas).toBe(1); // a la nota de filtro le faltan Score/Confianza/Razón
  });

  it("resuelve el nombre del autor con el mapa de owners", () => {
    const r = resumirNotas(
      [{ id: "n", creadaEl: null, cuerpo: "<p>hola</p>", autor: "90938283" }],
      new Map([["90938283", "Elías González Ugalde"]]),
    );
    expect(r.notas[0].autor).toBe("Elías González Ugalde");
  });

  it("sin notas no revienta", () => {
    const r = resumirNotas([]);
    expect(r).toMatchObject({ filtro: null, procedimiento: null, conTexto: 0, archivos: 0 });
  });
});

describe("etiquetaDeArchivos — lo que se ve en cada nota", () => {
  it("singular, plural y vacío", () => {
    expect(etiquetaDeArchivos(0)).toBe("Sin archivos");
    expect(etiquetaDeArchivos(1)).toBe("1 archivo adjunto");
    expect(etiquetaDeArchivos(3)).toBe("3 archivos adjuntos");
  });
});
