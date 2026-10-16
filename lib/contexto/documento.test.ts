/**
 * lib/contexto/documento.test.ts — EL «CONTEXTO ADICIONAL» ES DE CADA DOCUMENTO (2026-10-07).
 *
 * Pedido de Elías: «el contexto adicional debe ser para cada artefacto por separado: la misma
 * sección, pero guardarse para cada artefacto». Lo que puede romperse sin que nada avise:
 *  · un documento nuevo en la lista sin su columna en `SessionProject` (la X no se guardaría) o sin
 *    su SQL (el deploy revienta al leer vínculos);
 *  · la celda que cura el contexto no es la de generar ESE documento;
 *  · un runner deja de leer sus instrucciones, o lee las de otro documento;
 *  · (etapa 4) la regla de la frontera deja de viajar dentro del material, o un lector le recorta la
 *    cabeza al bloque y se la come.
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* El material lee la base y las reuniones; acá solo se prueba la mitad pura (`armarMaterialDelDocumento`
   y los dos bloques). Sin estos mocks, importarlo arrastra el cliente de Prisma y el chokepoint. */
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/sessions/project-sources", () => ({ getProjectDocumentSessions: vi.fn() }));
vi.mock("@/lib/sessions/transcript", () => ({ fetchTranscriptContent: vi.fn() }));
vi.mock("@/lib/cache/session-categories", () => ({ getSessionCategories: vi.fn() }));

import {
  DOCUMENTOS_CON_CONTEXTO,
  MAX_ELEGIDAS_A_LEER,
  MAX_ELEGIDAS_ENTERAS,
  PISO_POR_ELEGIDA_EN_RESUMEN,
  TECHO_POR_ELEGIDA,
  TOPE_ELEGIDAS_DEL_DOCUMENTO,
  documentoConContexto,
  documentoDelDestino,
  espacioPorElegida,
  queLeeSinElegidas,
} from "./documento";
import {
  COLUMNA_DEL_DESTINO,
  DESTINOS_DE_DOCUMENTO,
  DESTINOS_SOLO_ELEGIDAS,
  esSoloElegidas,
  parseDestino,
} from "@/lib/sessions/destinos-de-contexto";
import { TOPE_DE_LA_TRANSCRIPCION } from "@/lib/sessions/lectura-salida";
import { pieceBySlug } from "@/lib/pieces/registry";
import {
  armarMaterialDelDocumento,
  avisoSinReunionesElegidas,
  bloqueDeNotasDelDocumento,
  bloqueDeReunionesDelDocumento,
  cierreDeFronteraDelDocumento,
  encuadreDeLasElegidas,
  lineaDeCoberturaDeLasElegidas,
  minutaParaElDocumento,
  planDeLasElegidas,
  textoDeUnaElegidaEnResumen,
  textoDeUnaElegidaEntera,
} from "./material-del-documento";
import { FRONTERA_DE_LOS_DOCUMENTOS, FRONTERA_INTERNA } from "./frontera-de-los-documentos";

const raiz = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

describe("el registro de documentos con contexto", () => {
  it("cada documento es una pieza del proyecto, y lo cura la celda de GENERARLO", () => {
    for (const d of DOCUMENTOS_CON_CONTEXTO) {
      const pieza = pieceBySlug(d.pieza);
      expect(pieza, d.pieza).not.toBeNull();
      expect(pieza!.scope, d.pieza).toBe("project");
      expect(d.seccion, d.pieza).toBe(pieza!.permissionSection);
      expect(documentoConContexto(d.pieza)).toBe(d);
    }
  });

  it("los destinos de documento y los documentos son los mismos, uno a uno", () => {
    expect(DOCUMENTOS_CON_CONTEXTO.map((d) => d.destino).sort()).toEqual([...DESTINOS_DE_DOCUMENTO].sort());
    for (const destino of DESTINOS_DE_DOCUMENTO) {
      expect(documentoDelDestino(destino)?.destino, destino).toBe(destino);
      expect(parseDestino(destino)).toBe(destino);
    }
  });

  it("cada destino guarda su afinado en una columna PROPIA que existe en el schema", () => {
    const columnas = Object.values(COLUMNA_DEL_DESTINO);
    expect(new Set(columnas).size).toBe(columnas.length);
    const schema = leer("prisma/schema.prisma");
    const modelo = schema.slice(schema.indexOf("model SessionProject {"));
    const cuerpo = modelo.slice(0, modelo.indexOf("\n}"));
    for (const c of columnas) expect(cuerpo, c).toMatch(new RegExp(`\\b${c}\\s+Boolean\\?`));
  });

  it("las cuatro columnas del 2026-10-07 tienen su SQL aditivo", () => {
    const sql = leer("scripts/sql/2026-10-07-contexto-de-cada-documento.sql");
    for (const c of ["kickoffOverride", "explorationOverride", "techRequirementsOverride", "deliveryOverride"]) {
      expect(sql, c).toContain(`ADD COLUMN IF NOT EXISTS "${c}" BOOLEAN`);
    }
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("el bloque dice qué hace la IA y trae un ejemplo, en tuteo", () => {
    for (const d of DOCUMENTOS_CON_CONTEXTO) {
      expect(d.laIa.trim(), d.pieza).not.toBe("");
      expect(d.ejemplo.startsWith("Ej.: "), d.pieza).toBe(true);
      // Las formas de voseo más comunes en un pedido a la IA.
      expect(`${d.laIa} ${d.ejemplo}`, d.pieza).not.toMatch(/\b(enfocate|poné|incluí|mencioná|preguntá|destacá|usá)\b/i);
    }
  });
});

describe("cada runner lee las instrucciones de SU documento", () => {
  const RUNNERS: Array<{ archivo: string; lee: string }> = [
    { archivo: "lib/canvas/diagnostico-fuentes.ts", lee: "material.instrucciones" },
    { archivo: "lib/canvas/planificacion-generate.ts", lee: "material.instrucciones" },
    { archivo: "lib/canvas/implementacion-generate.ts", lee: "material.instrucciones" },
    { archivo: "lib/canvas/entrega-generate.ts", lee: "material.instrucciones" },
    { archivo: "lib/canvas/desarrollo-generate.ts", lee: "material.instrucciones" },
    { archivo: "lib/guia-exploracion/agente.ts", lee: "instrucciones +" },
    { archivo: "app/api/clients/[id]/analyze/route.ts", lee: "materialDelKickoff.instrucciones" },
  ];

  it("cada uno carga el material de su pieza y pone las instrucciones en el mensaje", () => {
    for (const { archivo, lee } of RUNNERS) {
      const src = leer(archivo);
      expect(src, archivo).toContain(lee);
    }
    expect(leer("lib/canvas/diagnostico-fuentes.ts")).toContain('documentoConContexto("diagnosis")');
    expect(leer("lib/canvas/planificacion-generate.ts")).toContain('documentoConContexto("planning")');
    expect(leer("lib/canvas/implementacion-generate.ts")).toContain('documentoConContexto("implementation")');
    expect(leer("lib/canvas/entrega-generate.ts")).toContain('documentoConContexto("delivery")');
    expect(leer("lib/canvas/desarrollo-generate.ts")).toContain('documentoConContexto("tech-requirements")');
    expect(leer("lib/guia-exploracion/agente.ts")).toContain('documentoConContexto("exploration")');
    expect(leer("lib/guia-exploracion/agente.ts")).toContain('instruccionesDelDocumento(projectId, "exploration")');
    const analyze = leer("app/api/clients/[id]/analyze/route.ts");
    expect(analyze).toContain('documentoConContexto("kickoff")');
    expect(analyze).toContain('instruccionesDelDocumento(bodyProjectId, "handoff")');
    expect(analyze).toContain("${instruccionesDelHandoff}${cseExclusionsBlock}");
  });

  it("las instrucciones salen del canvas de la pieza (la entry `__doc`), no de otro documento", () => {
    const src = leer("lib/contexto/material-del-documento.ts");
    expect(src).toContain("leerInstrucciones(projectId, doc.pieza)");
    expect(src).toContain("canvasOf(pieza)");
    expect(src).toContain("bloqueDeInstruccionesDeDoc(");
  });

  it("guardarlas pide la celda de generar ese documento (el cronograma, la suya)", () => {
    const src = leer("app/api/projects/[projectId]/doc-brief/route.ts");
    expect(src).toContain('slug === "timeline"');
    expect(src).toContain("guardTimelineEdit(projectId)");
    expect(src).toContain('guardContextoDelDocumento(projectId, "handoff")');
    expect(src).toContain("guardContextoDelDocumento(projectId, doc.seccion)");
  });
});

describe("⭐ la frontera viaja DENTRO del material de los documentos (etapa 4)", () => {
  const PIEZAS = DOCUMENTOS_CON_CONTEXTO.map((d) => d.pieza);
  const DE_CARA = PIEZAS.filter((p) => pieceBySlug(p)!.clientFacing);
  const INTERNAS = PIEZAS.filter((p) => !pieceBySlug(p)!.clientFacing);

  it("las cinco piezas de cara al cliente llevan la regla completa; ejecución y exploración, la interna", () => {
    expect([...DE_CARA].sort()).toEqual(["delivery", "diagnosis", "kickoff", "planning", "tech-requirements"]);
    expect([...INTERNAS].sort()).toEqual(["exploration", "implementation"]);
    for (const pieza of DE_CARA) {
      const bloque = bloqueDeReunionesDelDocumento(["### Reunión — 2 sept 2026\nhablamos"], pieza);
      expect(bloque.startsWith(FRONTERA_DE_LOS_DOCUMENTOS), pieza).toBe(true);
      expect(bloqueDeNotasDelDocumento("### Nota\nalgo", pieza).startsWith(FRONTERA_DE_LOS_DOCUMENTOS), pieza).toBe(true);
    }
    for (const pieza of INTERNAS) {
      const bloque = bloqueDeReunionesDelDocumento(["### Reunión — 2 sept 2026\nhablamos"], pieza);
      expect(bloque.startsWith(FRONTERA_INTERNA), pieza).toBe(true);
      expect(bloque, pieza).not.toContain(FRONTERA_DE_LOS_DOCUMENTOS);
    }
  });

  it("sin reuniones ni notas los bloques quedan en \"\": el mensaje de cada lector es el de antes", () => {
    for (const pieza of PIEZAS) {
      expect(bloqueDeReunionesDelDocumento([], pieza), pieza).toBe("");
      expect(bloqueDeNotasDelDocumento("", pieza), pieza).toBe("");
      expect(armarMaterialDelDocumento({ pieza, leidas: [], notas: [] }), pieza).toEqual({
        reuniones: "",
        notas: "",
        materialInterno: [],
      });
    }
  });

  it("materialInterno trae cada texto por separado, sin encabezados ni la regla", () => {
    const m = armarMaterialDelDocumento({
      pieza: "kickoff",
      leidas: [
        { encabezado: "### [CON EL CLIENTE] Kickoff — 2 sept 2026", texto: "La implementación cuesta US$18.000." },
        { encabezado: "### [PUERTAS ADENTRO] Interna — 3 sept 2026", texto: "Laura es difícil de convencer." },
      ],
      notas: [{ title: "Correo de Laura", content: "Nos pidió un descuento del 10 %.", createdAt: new Date("2026-09-04T15:00:00Z") }],
    });
    expect(m.reuniones.startsWith(FRONTERA_DE_LOS_DOCUMENTOS)).toBe(true);
    expect(m.reuniones).toContain("### [CON EL CLIENTE] Kickoff — 2 sept 2026\nLa implementación cuesta US$18.000.");
    expect(m.notas.startsWith(FRONTERA_DE_LOS_DOCUMENTOS)).toBe(true);
    expect(m.notas).toContain("Nos pidió un descuento del 10 %.");
    expect(m.materialInterno).toHaveLength(3);
    expect(m.materialInterno[0]).toBe("La implementación cuesta US$18.000.");
    expect(m.materialInterno[1]).toBe("Laura es difícil de convencer.");
    expect(m.materialInterno[2]).toContain("Nos pidió un descuento del 10 %.");
    for (const t of m.materialInterno) expect(t).not.toContain(FRONTERA_DE_LOS_DOCUMENTOS);
  });

  /* Los siete lectores pegan `material.reuniones` y `material.notas` detrás de su encabezado. Si uno
     le recortara la cabeza al bloque (`slice`, `split`, `replace`…), se comería justo la regla. */
  const LECTORES: Array<{ archivo: string; material: string }> = [
    { archivo: "lib/canvas/diagnostico-fuentes.ts", material: "material" },
    { archivo: "lib/canvas/planificacion-generate.ts", material: "material" },
    { archivo: "lib/canvas/implementacion-generate.ts", material: "material" },
    { archivo: "lib/canvas/entrega-generate.ts", material: "material" },
    { archivo: "lib/canvas/desarrollo-generate.ts", material: "material" },
    { archivo: "lib/guia-exploracion/agente.ts", material: "material" },
    { archivo: "app/api/clients/[id]/analyze/route.ts", material: "materialDelKickoff" },
  ];

  it("los siete lectores usan los bloques enteros, sin recortarles la cabeza", () => {
    for (const { archivo, material } of LECTORES) {
      const src = leer(archivo);
      expect(src, archivo).toContain(`${material}.reuniones`);
      expect(src, archivo).toContain(`${material}.notas`);
      expect(src, `${archivo} recorta el bloque y se come la regla`).not.toMatch(
        new RegExp(`\\b${material}\\.(?:reuniones|notas)\\s*\\.\\s*(?:slice|substring|substr|split|replace|replaceAll)\\(`),
      );
    }
  });

  it("⛔ la exploración que leen el diagnóstico y la planificación también lleva la regla (trae lo que salió de cada sesión)", () => {
    for (const [archivo, pieza] of [
      ["lib/canvas/diagnostico-fuentes.ts", "diagnosis"],
      ["lib/canvas/planificacion-generate.ts", "planning"],
    ] as const) {
      const src = leer(archivo);
      const i = src.indexOf("=== EXPLORACIÓN");
      expect(i, archivo).toBeGreaterThan(0);
      expect(src.slice(i, i + 300), `${archivo}: el bloque de la exploración perdió la regla`).toContain(`\${fronteraDeLaPieza("${pieza}")}`);
    }
  });

  it("la regla la pone el material, no cada lector", () => {
    const src = leer("lib/contexto/material-del-documento.ts");
    expect(src).toContain("fronteraDeLaPieza(");
    expect(src, "el cargador dejó de armar los bloques con la regla").toContain(
      "...armarMaterialDelDocumento({ pieza: doc.pieza, leidas, notas, cobertura })",
    );
  });

  it("⭐ la regla vuelve al FINAL del mensaje, solo con material (el bloque de reuniones puede ser largo)", () => {
    for (const pieza of DE_CARA) {
      const cierre = cierreDeFronteraDelDocumento(pieza, { reuniones: true, notas: false, transcripciones: false });
      expect(cierre, pieza).toContain(FRONTERA_DE_LOS_DOCUMENTOS);
      expect(cierreDeFronteraDelDocumento(pieza, { reuniones: false, notas: true, transcripciones: false }), pieza).toContain(
        FRONTERA_DE_LOS_DOCUMENTOS,
      );
      // Sin reuniones ni notas no hay cierre: el mensaje de cada lector queda como antes.
      expect(cierreDeFronteraDelDocumento(pieza, { reuniones: false, notas: false, transcripciones: false }), pieza).toBe("");
    }
    for (const pieza of INTERNAS) {
      const cierre = cierreDeFronteraDelDocumento(pieza, { reuniones: true, notas: false, transcripciones: false });
      expect(cierre, pieza).toContain(FRONTERA_INTERNA);
      expect(cierre, pieza).not.toContain(FRONTERA_DE_LOS_DOCUMENTOS);
    }
    // Con transcripciones enteras avisa del final de la reunión, que puede ser del equipo solo.
    expect(cierreDeFronteraDelDocumento("kickoff", { reuniones: true, notas: false, transcripciones: true })).toContain(
      "cuando el cliente ya había colgado",
    );
    expect(cierreDeFronteraDelDocumento("kickoff", { reuniones: true, notas: false, transcripciones: false })).not.toContain(
      "colgado",
    );
  });

  it("los seis lectores ponen el cierre de la regla en su mensaje", () => {
    for (const { archivo, material } of LECTORES.filter((l) => !l.archivo.includes("guia-exploracion"))) {
      expect(leer(archivo), archivo).toContain(`${material}.cierreDeFrontera`);
    }
  });
});

describe("⭐ los seis documentos leen SOLO LAS ELEGIDAS, enteras (etapa 7)", () => {
  /* DECISIONS «Los documentos leen la memoria y solo las reuniones elegidas» (2026-10-09). Lo que puede
     romperse sin que nada avise: un documento vuelve a leer en resumen (el resumen de Gemini en vez de
     lo que se dijo), el tope deja de cumplirse, la transcripción se trae entera desde la base, o un
     lector deja de decir que no hay reuniones elegidas y el modelo cree que el proyecto no tuvo ninguna. */

  it("son todos los documentos menos la exploración", () => {
    const piezas = DOCUMENTOS_CON_CONTEXTO.filter((d) => esSoloElegidas(d.destino)).map((d) => d.pieza).sort();
    expect(piezas).toEqual(["delivery", "diagnosis", "implementation", "kickoff", "planning", "tech-requirements"]);
    expect(DESTINOS_SOLO_ELEGIDAS).toHaveLength(6);
  });

  it("los topes: 160.000 en total, 60.000 por reunión (el corte de la lectura de cada reunión) y 6 enteras", () => {
    expect(TOPE_ELEGIDAS_DEL_DOCUMENTO).toBe(160_000);
    expect(TECHO_POR_ELEGIDA).toBe(60_000);
    expect(TECHO_POR_ELEGIDA).toBe(TOPE_DE_LA_TRANSCRIPCION);
    expect(MAX_ELEGIDAS_ENTERAS).toBe(6);
    // Su propio número (antes copiaba el de la exploración): pasadas las 24, no entran.
    expect(MAX_ELEGIDAS_A_LEER).toBe(24);
    expect(espacioPorElegida(0)).toBe(0);
    expect(espacioPorElegida(1)).toBe(60_000);
    expect(espacioPorElegida(2)).toBe(60_000);
    expect(espacioPorElegida(3)).toBe(53_333);
    expect(espacioPorElegida(6)).toBe(26_666);
    // Las que van en resumen comparten el total: nunca se pasa de 160.000.
    for (let enteras = 1; enteras <= MAX_ELEGIDAS_ENTERAS; enteras++)
      for (let enResumen = 0; enResumen <= MAX_ELEGIDAS_A_LEER - enteras; enResumen++)
        expect(enteras * espacioPorElegida(enteras, enResumen) + enResumen * PISO_POR_ELEGIDA_EN_RESUMEN).toBeLessThanOrEqual(
          TOPE_ELEGIDAS_DEL_DOCUMENTO,
        );
  });

  it("las 6 más recientes van enteras, las siguientes en resumen y las más viejas no entran", () => {
    const sesiones = Array.from({ length: 30 }, (_, i) => ({ id: `s${String(i).padStart(2, "0")}`, date: Date.UTC(2026, 7, 1 + i) }));
    const plan = planDeLasElegidas(sesiones);
    expect(plan.enteras.map((s) => s.id)).toEqual(["s29", "s28", "s27", "s26", "s25", "s24"]);
    expect(plan.enResumen.map((s) => s.id)).toHaveLength(MAX_ELEGIDAS_A_LEER - MAX_ELEGIDAS_ENTERAS);
    expect(plan.enResumen[0].id).toBe("s23");
    expect(plan.enResumen.map((s) => s.id)).not.toContain("s05");
    expect(plan.espacio).toBe(espacioPorElegida(6, MAX_ELEGIDAS_A_LEER - MAX_ELEGIDAS_ENTERAS));
    const dos = planDeLasElegidas(sesiones.slice(0, 2));
    expect([dos.enteras.length, dos.enResumen.length, dos.espacio]).toEqual([2, 0, 60_000]);
    expect(planDeLasElegidas([])).toEqual({ enteras: [], enResumen: [], espacio: 0, vacias: [] });
  });

  it("⭐ una elegida vacía no ocupa lugar: las 6 enteras son de las que tienen algo que leer", () => {
    const sesiones = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, date: Date.UTC(2026, 7, 1 + i) }));
    // Las 3 más recientes no dejaron nada (sin transcripción, notas ni minuta).
    const conContenido = new Set(["s0", "s1", "s2", "s3", "s4"]);
    const plan = planDeLasElegidas(sesiones, conContenido);
    expect(plan.vacias.map((s) => s.id).sort()).toEqual(["s5", "s6", "s7"]);
    expect(plan.enteras.map((s) => s.id)).toEqual(["s4", "s3", "s2", "s1", "s0"]);
    expect(plan.enResumen).toEqual([]);
    // El espacio se reparte entre las que tienen texto: 5 enteras, no 6.
    expect(plan.espacio).toBe(espacioPorElegida(5, 0));
    // Sin el conjunto, cuentan todas (como antes).
    expect(planDeLasElegidas(sesiones).enteras).toHaveLength(6);
  });

  it("la línea de cobertura dice cuántas se leyeron y por qué no las demás; con todas leídas, nada", () => {
    expect(lineaDeCoberturaDeLasElegidas({ elegidas: 5, leidas: 5, sinContenido: 0, fueraDelTope: 0 })).toBe("");
    // Sin ninguna leída la dice `avisoSinReunionesElegidas`, no esta línea.
    expect(lineaDeCoberturaDeLasElegidas({ elegidas: 3, leidas: 0, sinContenido: 3, fueraDelTope: 0 })).toBe("");
    const l = lineaDeCoberturaDeLasElegidas({ elegidas: 30, leidas: 24, sinContenido: 2, fueraDelTope: 4 });
    expect(l).toContain("Se leyeron 24 de las 30 reuniones elegidas");
    expect(l).toContain("2 no dejaron transcripción, notas ni minuta");
    expect(l).toContain("4, las más viejas, no entraron por espacio");
    expect(lineaDeCoberturaDeLasElegidas({ elegidas: 2, leidas: 1, sinContenido: 1, fueraDelTope: 0 })).toContain("1 no dejó");
    // Va dentro del bloque, DESPUÉS de la regla, y nunca sin reuniones.
    const bloque = armarMaterialDelDocumento({
      pieza: "diagnosis",
      leidas: [{ encabezado: "### Reunión — 2 sept 2026", texto: "hablamos" }],
      notas: [],
      cobertura: l,
    }).reuniones;
    expect(bloque.startsWith(FRONTERA_DE_LOS_DOCUMENTOS)).toBe(true);
    expect(bloque.indexOf(l)).toBeGreaterThan(0);
    expect(bloque.indexOf(l)).toBeLessThan(bloque.indexOf("### Reunión"));
    expect(armarMaterialDelDocumento({ pieza: "diagnosis", leidas: [], notas: [], cobertura: l }).reuniones).toBe("");
  });

  it("el encuadre dice cómo se leyeron: enteras, en resumen, o las dos", () => {
    const base = { desde: null, hasta: null };
    expect(encuadreDeLasElegidas({ ...base, leidas: 1, enteras: 1 })).toBe("Se leyó 1 reunión: entera, con su minuta y lo que se dijo.");
    expect(encuadreDeLasElegidas({ ...base, leidas: 8, enteras: 6 })).toContain("6 enteras, con su minuta y lo que se dijo, y 2 en resumen.");
    // El assist las lee en resumen: nunca «0 enteras».
    expect(encuadreDeLasElegidas({ ...base, leidas: 3, enteras: 0 })).toBe("Se leyeron 3 reuniones: en resumen.");
  });

  const minuta = {
    summary: "MINUTA-RESUMEN de la reunión.",
    decisions: [{ text: "DECISION-1: el pipeline queda con 6 etapas." }],
    agreements: [{ text: "ACUERDO-1: el cliente manda la base." }],
    risks: [],
    status: "REVIEWED",
  };
  const notasDeGemini = { overview: "NOTAS-DE-GEMINI: se habló del pipeline y de la base de contactos." };

  it("una elegida entera es su minuta y lo que se dijo, sin las notas de Gemini", () => {
    const t = textoDeUnaElegidaEntera(
      { title: "Planning", summary: notasDeGemini, minuta, transcripcion: "Ana: arrancamos.\nLuis: listo, cerramos." },
      60_000,
    );
    expect(t).toContain("MINUTA-RESUMEN");
    expect(t).toContain("DECISION-1");
    expect(t).toContain("Ana: arrancamos.");
    expect(t).toContain("Luis: listo, cerramos.");
    expect(t).not.toContain("NOTAS-DE-GEMINI");
    // Sin minuta, solo lo que se dijo.
    const sinMinuta = textoDeUnaElegidaEntera({ title: "Planning", summary: notasDeGemini, minuta: null, transcripcion: "Ana: arrancamos." }, 60_000);
    expect(sinMinuta).toContain("Ana: arrancamos.");
    expect(sinMinuta).not.toContain("NOTAS-DE-GEMINI");
  });

  it("si no entra, se queda con el principio y el FINAL de lo que se dijo (ahí se acuerda qué sigue)", () => {
    const larga = `INICIO-DE-LA-REUNION ${"bla ".repeat(60_000)} FIN-DE-LA-REUNION`;
    const t = textoDeUnaElegidaEntera({ title: "Planning", summary: null, minuta, transcripcion: larga }, 26_666);
    expect(t.length).toBeLessThanOrEqual(26_666 + 200);
    expect(t).toContain("INICIO-DE-LA-REUNION");
    expect(t).toContain("FIN-DE-LA-REUNION");
    expect(t).toContain("MINUTA-RESUMEN");
  });

  it("sin transcripción, las notas de Gemini y la minuta; sin espacio, nada", () => {
    const t = textoDeUnaElegidaEntera({ title: "Planning", summary: notasDeGemini, minuta, transcripcion: null }, 60_000);
    expect(t).toContain("NOTAS-DE-GEMINI");
    expect(t).toContain("DECISION-1");
    expect(textoDeUnaElegidaEntera({ title: "x", summary: notasDeGemini, minuta, transcripcion: "algo" }, 0)).toBe("");
  });

  it("⛔ en un documento del cliente, la minuta llega solo con los acuerdos y las decisiones (también en borrador)", () => {
    const conRiesgos = {
      summary: "MINUTA-RESUMEN con la valoración del equipo.",
      decisions: [{ text: "DECISION-1: el pipeline queda con 6 etapas." }, { text: "La implementación queda en US$18.000." }],
      agreements: ["ACUERDO-1: el cliente manda la base."],
      risks: [{ text: "RIESGO-1: Laura no apoya el proyecto.", severity: "high" }],
      status: "REVIEWED",
    };
    for (const pieza of ["kickoff", "diagnosis", "planning", "tech-requirements", "delivery"]) {
      const m = minutaParaElDocumento(conRiesgos, pieza);
      const t = textoDeUnaElegidaEntera({ title: "Planning", summary: null, minuta: m, transcripcion: "Ana: arrancamos." }, 60_000);
      expect(t, pieza).toContain("DECISION-1");
      expect(t, pieza).toContain("ACUERDO-1");
      expect(t, pieza).not.toContain("Riesgos");
      expect(t, pieza).not.toContain("RIESGO-1");
      expect(t, pieza).not.toContain("MINUTA-RESUMEN");
      expect(t, pieza).not.toContain("US$18.000");
      // La IA como borrador (2026-10-15): una minuta en borrador llega con lo mismo, y conserva su estado para marcarla.
      const borrador = minutaParaElDocumento({ ...conRiesgos, status: "DRAFT", agreements: ["ACUERDO-1", "Descuento del 10% por pago anual."] }, pieza);
      expect(borrador?.status, pieza).toBe("DRAFT");
      expect(borrador?.agreements, pieza).toEqual(["ACUERDO-1"]);
      expect(borrador?.risks, pieza).toEqual([]);
      expect(borrador?.summary, pieza).toBeNull();
      const enResumen = textoDeUnaElegidaEnResumen({ title: "x", summary: null, minuta: m, transcripcion: null });
      expect(enResumen, pieza).not.toContain("RIESGO-1");
    }
    // La ejecución es interna: la minuta entera, también en borrador.
    expect(minutaParaElDocumento(conRiesgos, "implementation")).toBe(conRiesgos);
    expect(minutaParaElDocumento({ ...conRiesgos, status: "DRAFT" }, "implementation")?.status).toBe("DRAFT");
    expect(minutaParaElDocumento(null, "kickoff")).toBeNull();
  });

  it("una elegida que no entra entera va en resumen, a 2.000; sin notas ni minuta, el principio de la transcripción", () => {
    const larga = { overview: `NOTAS-DE-GEMINI ${"pipeline ".repeat(1_000)}` };
    const t = textoDeUnaElegidaEnResumen({ title: "Planning", summary: larga, minuta: null, transcripcion: null });
    expect(t).toContain("NOTAS-DE-GEMINI");
    expect(t.length).toBeLessThanOrEqual(PISO_POR_ELEGIDA_EN_RESUMEN);
    const soloTranscripcion = textoDeUnaElegidaEnResumen({ title: "x", summary: null, minuta: null, transcripcion: "Ana: arrancamos." });
    expect(soloTranscripcion).toBe("Ana: arrancamos.");
    expect(textoDeUnaElegidaEnResumen({ title: "x", summary: null, minuta: null, transcripcion: null })).toBe("");
  });

  it("sin reuniones que leer, la línea lo dice (en tuteo y sin prometer la memoria)", () => {
    const diag = documentoConContexto("diagnosis")!;
    const sin = avisoSinReunionesElegidas(diag, { elegidas: 0 });
    expect(sin).toContain("=== SIN REUNIONES ELEGIDAS ===");
    expect(sin).toContain("Nadie eligió reuniones para el diagnóstico");
    expect(avisoSinReunionesElegidas(diag, { elegidas: 1 })).toContain("La reunión elegida para el diagnóstico todavía no ocurrió");
    expect(avisoSinReunionesElegidas(diag, { elegidas: 3 })).toContain("Las 3 reuniones elegidas para el diagnóstico todavía no ocurrieron");
    for (const t of [sin, avisoSinReunionesElegidas(diag, { elegidas: 3 })]) {
      expect(t).not.toMatch(/\b(inventés|tenés|podés|usá)\b/);
      expect(t).not.toMatch(/memoria/i);
    }
  });

  /* Los seis lectores: cada uno dice que las reuniones son las ELEGIDAS por el equipo, y sin ninguna pone la línea. */
  const LECTORES_SOLO_ELEGIDAS: Array<{ archivo: string; material: string }> = [
    { archivo: "lib/canvas/diagnostico-fuentes.ts", material: "material" },
    { archivo: "lib/canvas/planificacion-generate.ts", material: "material" },
    { archivo: "lib/canvas/implementacion-generate.ts", material: "material" },
    { archivo: "lib/canvas/entrega-generate.ts", material: "material" },
    { archivo: "lib/canvas/desarrollo-generate.ts", material: "material" },
    { archivo: "app/api/clients/[id]/analyze/route.ts", material: "materialDelKickoff" },
  ];

  it("cada lector rotula las reuniones como ELEGIDAS por el equipo y, sin ellas, pone `avisoSinReuniones`", () => {
    for (const { archivo, material } of LECTORES_SOLO_ELEGIDAS) {
      const src = leer(archivo);
      expect(src, archivo).toContain("ELEGIDAS POR EL EQUIPO");
      expect(src, archivo).toContain(`${material}.avisoSinReuniones`);
      expect(src, archivo).not.toContain("curadas por el equipo");
      expect(src, archivo).not.toContain("(la fuente principal)");
    }
  });

  it("⛔ el diagnóstico y la planificación leen la memoria (sin elegidas no salen vacíos), sin repetir lo que su material ya leyó", () => {
    expect(leer("lib/canvas/diagnostico-fuentes.ts")).toMatch(/memoriaDelDocumento\(projectId, \{\s*lector: "diagnosis",[\s\S]{0,80}yaLeidas: material\.sesionesUsadas/);
    expect(leer("lib/canvas/planificacion-generate.ts")).toMatch(/memoriaDelDocumento\(projectId, \{\s*lector: "planning",[\s\S]{0,80}yaLeidas: material\.sesionesUsadas/);
  });

  it("el cargador lee las elegidas enteras con la transcripción cortada EN SQL, nunca el texto entero", () => {
    const src = leer("lib/contexto/material-del-documento.ts");
    expect(src).toContain("esSoloElegidas(doc.destino)");
    expect(src).toContain('left("transcript"');
    expect(src).toContain('right("transcript"');
    const lector = src.slice(src.indexOf("async function leerLasElegidas"), src.indexOf("export interface ReunionParaLeer"));
    expect(lector.length, "el lector de las elegidas no está donde se lo busca").toBeGreaterThan(200);
    expect(lector, "la consulta de las elegidas no puede traer la transcripción entera").not.toMatch(/transcript:\s*true/);
  });

  it("el lector de cada documento (el chokepoint) usa la regla de las elegidas, sin mirar la sala", () => {
    const src = leer("lib/sessions/project-sources.ts");
    const fn = src.slice(src.indexOf("export async function getProjectDocumentSessions"), src.indexOf("export async function getClientSessions"));
    expect(fn).toContain("esSoloElegidas(destino)");
    expect(fn).toContain("linkFeedsDocumento({ included: true, override: s[columna] })");
    expect(fn).toContain("getProjectMemberSessions(projectId)");
    // La elegida de antes del piso del proyecto se lee en ESE documento (el panel la muestra elegida).
    expect(fn).toContain("getProjectMemberSessions(projectId, { elegidaEn: columna })");
  });

  it("el panel dice qué lee cada documento sin elegidas (la memoria del cliente trae poco de las reuniones)", () => {
    for (const d of DOCUMENTOS_CON_CONTEXTO.filter((x) => esSoloElegidas(x.destino))) {
      const t = queLeeSinElegidas(d);
      expect(t, d.pieza).toMatch(/^Sin elegidas, no lee ninguna reunión/);
      expect(t, d.pieza).not.toMatch(/\b(tenés|podés|elegí|usá)\b/);
    }
    expect(queLeeSinElegidas({ pieza: "diagnosis" })).toContain("los acuerdos y las decisiones de sus minutas, también las que están en borrador");
    expect(queLeeSinElegidas({ pieza: "delivery" })).toContain("La sección de impacto sale vacía");
    expect(queLeeSinElegidas({ pieza: "implementation" })).toContain("compromisos abiertos");
    expect(leer("components/canvas/DocumentoContextSection.tsx")).toContain("{queLeeSinElegidas(doc)}");
  });
});
