/**
 * lib/contexto/sugerencias-del-documento.test.ts — LAS SUGERENCIAS de un documento (etapa 7).
 *
 * Lo que no puede pasar sin que la suite se ponga roja: que se sugiera una reunión ya elegida o desestimada, una que
 * todavía no ocurrió, una que no es de la membresía del proyecto (la de otro cliente), o que el servidor de las
 * sugerencias escriba algo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { SesionPlaneada } from "@/lib/exploraciones/guia";
import {
  LARGO_DEL_MOTIVO,
  MOTIVO_DE_LA_REGLA_VIEJA,
  SUGERIDAS_DE_LA_REGLA_VIEJA,
  TOPE_DE_SUGERENCIAS,
  FUENTES_QUE_ENTRAN_SOLAS,
  motivoDeLaReunionConTexto,
  motivoDeLaSesion,
  motivoDeLosHechos,
  reunionesDeLasSesiones,
  sugerenciasDelDocumento,
  type ReunionDelProyecto,
} from "./sugerencias-del-documento";

const AHORA = Date.parse("2026-10-10T15:00:00.000Z");
const DIA = 86_400_000;

const reunion = (id: string, diasAtras: number, afinado: boolean | null = null, extra: Partial<ReunionDelProyecto> = {}): ReunionDelProyecto => ({
  id,
  titulo: `Reunión ${id}`,
  fecha: AHORA - diasAtras * DIA,
  participantes: ["ana@cliente.com", "eli@smarteamcr.com"],
  afinado,
  ...extra,
});

const PROPIOS = new Set(["smarteamcr.com"]);

describe("qué se sugiere", () => {
  it("el diagnóstico sugiere la reunión de cada sesión de la exploración, con el número de la sesión", () => {
    const reuniones = [reunion("m1", 20), reunion("m2", 10), reunion("m3", 5)];
    const sesiones: SesionPlaneada[] = [
      { id: "s-b", fecha: "2026-09-30", reunion: { id: "m2", origen: "meet" } },
      { id: "s-a", fecha: "2026-09-20", reunion: { id: "m1", origen: "meet" } },
    ];
    const out = sugerenciasDelDocumento("diagnostico", { reuniones, sesionesDeLaExploracion: sesiones, dominiosPropios: PROPIOS, ahora: AHORA });
    expect(out).toEqual([
      { sessionId: "m1", motivo: "Sesión 1 de la exploración", fuente: "exploracion" },
      { sessionId: "m2", motivo: "Sesión 2 de la exploración", fuente: "exploracion" },
      // La que no es de una sesión entra después, por la regla vieja (con el cliente).
      { sessionId: "m3", motivo: MOTIVO_DE_LA_REGLA_VIEJA, fuente: "reunion" },
    ]);
  });

  it("la reunión del evento del calendario de una sesión también; la ligada solo por la fecha, no", () => {
    const reuniones = [reunion("gmeet_ev1", 6), reunion("m-del-dia", 3)];
    const sesiones: SesionPlaneada[] = [
      { id: "s1", fecha: "2026-10-04", evento: { id: "ev1", calendario: "eli@smarteamcr.com", inicio: new Date(AHORA - 6 * DIA).toISOString() } },
      // Sin reunión ni evento: la pantalla la liga por la fecha, pero eso es una adivinanza y no se sugiere.
      { id: "s2", fecha: new Date(AHORA - 3 * DIA).toISOString().slice(0, 10) },
    ];
    const out = sugerenciasDelDocumento("diagnostico", { reuniones, sesionesDeLaExploracion: sesiones, ahora: AHORA });
    expect(out.filter((s) => s.fuente === "exploracion").map((s) => s.sessionId)).toEqual(["gmeet_ev1"]);
  });

  it("una sesión que «no se hizo» no cuenta ni lleva número", () => {
    const reuniones = [reunion("m1", 20), reunion("m2", 10)];
    const sesiones: SesionPlaneada[] = [
      { id: "s1", fecha: "2026-09-20", reunion: { id: "m1", origen: "meet" }, resultado: "noSeHizo" },
      { id: "s2", fecha: "2026-09-30", reunion: { id: "m2", origen: "meet" } },
    ];
    expect(reunionesDeLasSesiones(sesiones, reuniones, AHORA)).toEqual([{ sessionId: "m2", numero: 1 }]);
  });

  it("las sesiones de la exploración solo cuentan en el diagnóstico", () => {
    const reuniones = [reunion("m1", 20)];
    const sesiones: SesionPlaneada[] = [{ id: "s1", fecha: "2026-09-20", reunion: { id: "m1", origen: "meet" } }];
    for (const d of ["planificacion", "ejecucion", "kickoff", "integraciones", "entrega"] as const) {
      const out = sugerenciasDelDocumento(d, { reuniones, sesionesDeLaExploracion: sesiones, ahora: AHORA });
      expect(out.filter((s) => s.fuente === "exploracion"), d).toEqual([]);
    }
  });

  it("en todos los documentos, las reuniones con hechos abiertos ruteados a él, con la frase del hecho", () => {
    const reuniones = [reunion("m1", 8), reunion("m2", 4)];
    const hechos = [
      { sessionId: "m2", frase: "El pipeline de ventas queda con seis etapas." },
      { sessionId: "m1", frase: "Las propiedades de negocios se ordenan por región." },
      { sessionId: "m2", frase: "Las automatizaciones de marketing van en la segunda fase." },
    ];
    const out = sugerenciasDelDocumento("planificacion", { reuniones, hechos, ahora: AHORA });
    expect(out).toEqual([
      { sessionId: "m2", motivo: "El pipeline de ventas queda con seis etapas. (y 1 hecho más)", fuente: "hecho" },
      { sessionId: "m1", motivo: "Las propiedades de negocios se ordenan por región.", fuente: "hecho" },
    ]);
  });

  it("una reunión que es de una sesión y tiene hechos se sugiere UNA vez, como sesión de la exploración", () => {
    const reuniones = [reunion("m1", 8)];
    const sesiones: SesionPlaneada[] = [{ id: "s1", fecha: "2026-10-02", reunion: { id: "m1", origen: "meet" } }];
    const out = sugerenciasDelDocumento("diagnostico", {
      reuniones,
      sesionesDeLaExploracion: sesiones,
      hechos: [{ sessionId: "m1", frase: "Quieren medir el costo de adquisición por canal." }],
      ahora: AHORA,
    });
    expect(out).toEqual([{ sessionId: "m1", motivo: motivoDeLaSesion(1), fuente: "exploracion" }]);
  });
});

describe("qué NO se sugiere", () => {
  const sesionesDe = (ids: string[]): SesionPlaneada[] =>
    ids.map((id, i) => ({ id: `s${i}`, fecha: `2026-09-${String(10 + i).padStart(2, "0")}`, reunion: { id, origen: "meet" as const } }));

  it("ni una elegida (true) ni una desestimada (false)", () => {
    const reuniones = [reunion("elegida", 20, true), reunion("desestimada", 15, false), reunion("libre", 10)];
    const out = sugerenciasDelDocumento("diagnostico", {
      reuniones,
      sesionesDeLaExploracion: sesionesDe(["elegida", "desestimada", "libre"]),
      hechos: [
        { sessionId: "elegida", frase: "x" },
        { sessionId: "desestimada", frase: "y" },
      ],
      ahora: AHORA,
    });
    expect(out.map((s) => s.sessionId)).toEqual(["libre"]);
    // El número sigue siendo el de la pantalla: la elegida y la desestimada también son sesiones.
    expect(out[0].motivo).toBe("Sesión 3 de la exploración");
  });

  it("ni una que todavía no ocurrió", () => {
    const futura = reunion("futura", -2);
    const out = sugerenciasDelDocumento("kickoff", { reuniones: [futura], hechos: [{ sessionId: "futura", frase: "algo" }], ahora: AHORA });
    expect(out).toEqual([]);
  });

  it("ni una que no es de la membresía del proyecto (la de otro cliente)", () => {
    const out = sugerenciasDelDocumento("diagnostico", {
      reuniones: [reunion("del-proyecto", 10)],
      sesionesDeLaExploracion: sesionesDe(["de-otro-cliente"]),
      hechos: [{ sessionId: "de-otro-cliente", frase: "se coló" }],
      ahora: AHORA,
    });
    // Solo la del proyecto, por la regla vieja: la de otro cliente no aparece por ninguna fuente.
    expect(out).toEqual([{ sessionId: "del-proyecto", motivo: MOTIVO_DE_LA_REGLA_VIEJA, fuente: "reunion" }]);
  });

  it("ni un hecho sin reunión ni con la frase vacía", () => {
    const out = sugerenciasDelDocumento("entrega", {
      reuniones: [reunion("m1", 3)],
      hechos: [
        { sessionId: null, frase: "de la cuenta" },
        { sessionId: "m1", frase: "   " },
      ],
      ahora: AHORA,
    });
    expect(out.filter((s) => s.fuente === "hecho")).toEqual([]);
  });

  it("fuera de los seis documentos, nada (el handoff, el cronograma y la exploración tienen su regla)", () => {
    const e = { reuniones: [reunion("m1", 3)], hechos: [{ sessionId: "m1", frase: "algo" }], ahora: AHORA };
    for (const d of ["handoff", "cronograma", "exploracion"] as const) expect(sugerenciasDelDocumento(d, e), d).toEqual([]);
  });

  it("como mucho TOPE_DE_SUGERENCIAS", () => {
    const reuniones = Array.from({ length: 15 }, (_, i) => reunion(`m${i}`, i + 1));
    const hechos = reuniones.map((r) => ({ sessionId: r.id, frase: `Hecho de ${r.id}` }));
    expect(sugerenciasDelDocumento("integraciones", { reuniones, hechos, ahora: AHORA })).toHaveLength(TOPE_DE_SUGERENCIAS);
  });
});

describe("la regla vieja: reunión con el cliente en este proyecto (2026-10-10)", () => {
  it("las más recientes con el cliente, sin tocar, después de las otras fuentes y sin repetirlas", () => {
    const reuniones = Array.from({ length: 12 }, (_, i) => reunion(`m${i}`, i + 1));
    const out = sugerenciasDelDocumento("kickoff", {
      reuniones,
      dominiosPropios: PROPIOS,
      hechos: [{ sessionId: "m5", frase: "El kickoff es el lunes." }],
      ahora: AHORA,
    });
    expect(out[0]).toEqual({ sessionId: "m5", motivo: "El kickoff es el lunes.", fuente: "hecho" });
    const viejas = out.filter((s) => s.fuente === "reunion");
    expect(viejas).toHaveLength(SUGERIDAS_DE_LA_REGLA_VIEJA);
    expect(viejas.map((s) => s.sessionId)).toEqual(["m0", "m1", "m2", "m3", "m4", "m6", "m7", "m8"]);
  });

  it("ni las de puertas adentro, ni las elegidas, ni las desestimadas, ni las futuras", () => {
    const reuniones = [
      reunion("interna", 2, null, { participantes: ["eli@smarteamcr.com", "ana@smarteamcr.com"] }),
      reunion("elegida", 3, true),
      reunion("desestimada", 4, false),
      reunion("futura", -1),
      reunion("buena", 5),
    ];
    const out = sugerenciasDelDocumento("entrega", { reuniones, dominiosPropios: PROPIOS, ahora: AHORA });
    expect(out.map((s) => s.sessionId)).toEqual(["buena"]);
  });

  it("sin saber la sala (el servidor no leyó los dominios), no sugiere por la regla vieja", () => {
    const out = sugerenciasDelDocumento("ejecucion", { reuniones: [reunion("m1", 2)], reglaVieja: false, ahora: AHORA });
    expect(out).toEqual([]);
  });

  it("el servidor lee las categorías en todos los documentos y apaga la regla vieja si no puede", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/contexto/sugerencias-del-documento-server.ts"), "utf8");
    expect(src).toContain('seguro("las categorías", () => getSessionCategories(), null)');
    expect(src).toContain("reglaVieja: categorias !== null");
  });
});

describe("los motivos", () => {
  it("se leen en una línea: la frase recortada y cuántos hechos más", () => {
    const larga = "palabra ".repeat(60);
    const m = motivoDeLosHechos([larga]);
    expect(m.length).toBeLessThanOrEqual(LARGO_DEL_MOTIVO);
    expect(m.endsWith("…")).toBe(true);
    expect(motivoDeLosHechos(["Uno", "Dos", "Tres"])).toBe("Uno (y 2 hechos más)");
  });
});

describe("⛔ el servidor de las sugerencias no escribe nada y sale del chokepoint", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const soloCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const SERVIDOR = "lib/contexto/sugerencias-del-documento-server.ts";

  it("ni una escritura de Prisma ni SQL que escriba", () => {
    const src = soloCodigo(leer(SERVIDOR));
    expect(src).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
    expect(src).not.toMatch(/\$executeRaw|INSERT INTO|UPDATE "|DELETE FROM/i);
  });

  it("las reuniones salen de la membresía del proyecto (chokepoint), nunca de una consulta propia", () => {
    const src = soloCodigo(leer(SERVIDOR));
    expect(src).toContain("getProjectMemberSessions(projectId)");
    expect(src).not.toMatch(/\.(firefliesSession|sessionProject)\./);
    expect(src).not.toMatch(/FROM "FirefliesSession"|FROM "SessionProject"/);
  });

  it("los hechos entran por las novedades de lib/seguimiento (bandera y SQL), nunca leyendo la tabla", () => {
    const src = soloCodigo(leer(SERVIDOR));
    expect(src).toContain("novedadesDelProyecto(projectId,");
    expect(src).not.toMatch(/\bhechoDeReunion\b|"HechoDeReunion"/);
  });

  it("la ruta del panel usa las sugerencias y no las repite entre las candidatas", () => {
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/session-candidates/route.ts"));
    expect(ruta).toContain("sugerenciasParaElDocumento(projectId, destino)");
    expect(ruta).toContain("!sugeridasIds.has(s.id)");
    // Si las sugerencias fallan, el panel sigue: nunca un 500 por una sugerencia.
    expect(ruta).toMatch(/sugerenciasParaElDocumento\(projectId, destino\)\.catch\(/);
  });
});

describe("el panel de los seis documentos (SessionSelectionReview + DocumentoContextSection)", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
  const soloCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const PANEL = soloCodigo(leer("components/clients/SessionSelectionReview.tsx"));
  const SECCION = soloCodigo(leer("components/canvas/DocumentoContextSection.tsx"));

  it("«Descartar» desestima (false) y «Usar» elige (true): solo con el clic de una persona", () => {
    expect(PANEL).toContain("postReuniones({ sessionIds: [sessionId], feeds: false, desestimar: true })");
    expect(PANEL).toContain("postReuniones({ sessionIds, feeds: true })");
    expect(PANEL).toMatch(/<FranjaDeSugerencias/);
    expect(PANEL).toMatch(/<FilaSugerida/);
    expect(PANEL).toMatch(/<BotonUsar/);
  });

  it("deshacer vuelve a elegir (sin «sugerida») y no hay excluidas, como en el cronograma", () => {
    expect(PANEL).toContain("esCronograma || soloElegidas ? {} : { sugeridas:");
    expect(PANEL).toContain("excluidas={soloElegidas ? [] :");
  });

  it("la lista vacía dice que la IA trabaja con la memoria, y la sección lo explica", () => {
    expect(PANEL).toContain("Sin reuniones elegidas: la IA no lee ninguna reunión, solo la memoria del proyecto. Elige las que quieras que lea enteras.");
    expect(SECCION).toContain("más la memoria del proyecto");
    expect(SECCION).toContain("onSugeridas={setSugeridas}");
    expect(SECCION, "volvió la explicación del modo sugerido").not.toContain("todas las reuniones del proyecto con el cliente");
  });

  it("las reuniones del proyecto se pueden elegir aunque no estén entre las 100 más recientes del cliente", () => {
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/session-candidates/route.ts"));
    // Como en el cronograma: la membresía que no está elegida ni sugerida va como candidata «del proyecto».
    expect(ruta).toContain("const delProyecto = esCronograma || soloElegidas");
    expect(ruta).toContain("delProyecto: delProyectoIds.has(s.id)");
    // Y el panel les pone su grupo arriba de las del cliente.
    expect(PANEL).toContain("filtered.filter((c) => c.delProyecto)");
    expect(PANEL).toContain('{ separador: "Del proyecto" }');
  });
});

describe("en el diagnóstico entran solas todas las reuniones del proyecto con texto (L1 etapa 2, 2026-10-24)", () => {
  /* CEMACO el 23 oct: cinco sesiones de la exploración, más la Alineación, el Handoff y «Caso CEMACO», que nadie eligió
     y el diagnóstico no leía. Dos con solo notas de Gemini. */
  const reuniones = [
    reunion("s1", 18),
    reunion("alineacion", 25),
    reunion("handoff", 30),
    reunion("caso", 12),
    reunion("solo-notas", 4),
    reunion("vacia", 3),
    reunion("sacada", 8, false),
    reunion("elegida", 9, true),
    reunion("futura", -2),
    // Solo Smarteam: la Alineación interna. Tiene texto y NO entra sola (el diagnóstico lo lee el cliente).
    reunion("interna", 6, null, { participantes: ["eli@smarteamcr.com", "ana@smarteamcr.com"] }),
  ];
  const sesiones: SesionPlaneada[] = [{ id: "e1", fecha: "2026-09-22", reunion: { id: "s1", origen: "meet" } }];
  const clases = new Map([
    ["s1", "transcripcion"],
    ["alineacion", "transcripcion"],
    ["handoff", "transcripcion"],
    ["caso", "transcripcion"],
    ["solo-notas", "solo_notas"],
    ["vacia", "nada"],
    ["sacada", "transcripcion"],
    ["elegida", "transcripcion"],
    ["futura", "transcripcion"],
    ["interna", "transcripcion"],
  ] as const);
  const out = sugerenciasDelDocumento("diagnostico", {
    reuniones,
    sesionesDeLaExploracion: sesiones,
    dominiosPropios: PROPIOS,
    clasesDeTexto: new Map(clases),
    ahora: AHORA,
  });

  it("primero la de la exploración y después las del proyecto con texto, de la más reciente a la más vieja", () => {
    const solas = out.filter((s) => FUENTES_QUE_ENTRAN_SOLAS.includes(s.fuente));
    expect(solas.map((s) => [s.sessionId, s.fuente])).toEqual([
      ["s1", "exploracion"],
      ["solo-notas", "proyecto"],
      ["caso", "proyecto"],
      ["alineacion", "proyecto"],
      ["handoff", "proyecto"],
    ]);
    expect(solas.find((s) => s.sessionId === "solo-notas")?.motivo).toBe(motivoDeLaReunionConTexto("solo_notas"));
  });

  it("nunca la sacada, la elegida (ya entra por su lado), la futura ni la que no dejó texto", () => {
    const solas = new Set(out.filter((s) => s.fuente === "proyecto").map((s) => s.sessionId));
    for (const id of ["sacada", "elegida", "futura", "vacia", "interna"]) expect(solas.has(id), id).toBe(false);
  });

  it("una de puertas adentro con texto no entra sola, y sin los dominios de Smarteam no entra ninguna", () => {
    expect(out.find((s) => s.sessionId === "interna")?.fuente).not.toBe("proyecto");
    const sinSala = sugerenciasDelDocumento("diagnostico", { reuniones, clasesDeTexto: new Map(clases), ahora: AHORA });
    expect(sinSala.some((s) => s.fuente === "proyecto")).toBe(false);
  });

  it("la que no dejó texto queda como sugerencia de siempre, que espera un «Usar»", () => {
    expect(out.find((s) => s.sessionId === "vacia")?.fuente).toBe("reunion");
  });

  it("no tienen tope (entran todas): el tope es de lo que espera un «Usar»", () => {
    const muchas = Array.from({ length: TOPE_DE_SUGERENCIAS + 5 }, (_, i) => reunion(`r${i}`, i + 1));
    const r = sugerenciasDelDocumento("diagnostico", {
      reuniones: muchas,
      clasesDeTexto: new Map(muchas.map((m) => [m.id, "transcripcion" as const])),
      dominiosPropios: PROPIOS,
      ahora: AHORA,
    });
    expect(r.filter((s) => s.fuente === "proyecto")).toHaveLength(TOPE_DE_SUGERENCIAS + 5);
  });

  it("solo en el diagnóstico: los demás documentos siguen esperando un «Usar»", () => {
    const r = sugerenciasDelDocumento("planificacion", { reuniones, clasesDeTexto: new Map(clases), dominiosPropios: PROPIOS, ahora: AHORA });
    expect(r.some((s) => s.fuente === "proyecto")).toBe(false);
  });

  it("el servidor usa el predicado único y el chokepoint", () => {
    const servidor = fs.readFileSync(path.join(process.cwd(), "lib/contexto/sugerencias-del-documento-server.ts"), "utf8");
    expect(servidor).toContain("clasesDeTextoDeLasReuniones(");
    expect(fs.readFileSync(path.join(process.cwd(), "lib/sessions/clase-de-texto-server.ts"), "utf8")).toContain("sqlClaseDeTexto(");
    expect(servidor).toContain("getProjectMemberSessions(");
    expect(servidor).not.toMatch(/transcript:\s*\{\s*not:/);
  });
});

describe("el equipo del cliente de las reuniones (L5, 2026-10-25)", () => {
  it("la reunión de una sesión de la exploración lleva el equipo de su sesión", () => {
    const reuniones = [reunion("m1", 20), reunion("m2", 10)];
    const sesiones: SesionPlaneada[] = [
      { id: "s1", fecha: "2026-09-20", reunion: { id: "m1", origen: "meet" }, equipo: "marketing" },
      { id: "s2", fecha: "2026-09-30", reunion: { id: "m2", origen: "meet" } },
    ];
    expect(reunionesDeLasSesiones(sesiones, reuniones, AHORA)).toEqual([
      { sessionId: "m1", numero: 1, equipo: "marketing" },
      { sessionId: "m2", numero: 2 },
    ]);
  });

  it("el servidor: el de la sesión manda, el del Contexto solo para las demás; la ruta exige la membresía del proyecto", () => {
    const servidor = fs.readFileSync(path.join(process.cwd(), "lib/contexto/sugerencias-del-documento-server.ts"), "utf8");
    expect(servidor).toMatch(/const sinSesion = ids\.filter\(\(id\) => !out\.has\(id\)\)/);
    const ruta = fs.readFileSync(path.join(process.cwd(), "app/api/projects/[projectId]/contexto/[pieza]/equipo/route.ts"), "utf8");
    expect(ruta).toContain("getProjectMemberSessions(projectId)");
    expect(ruta).toContain("guardContextoDelDocumento(");
    const escritor = fs.readFileSync(path.join(process.cwd(), "lib/sessions/equipo-de-la-reunion-server.ts"), "utf8");
    expect(escritor).toMatch(/WHERE "projectId" = \$\{projectId\} AND "sessionId" = \$\{sessionId\}/);
  });
});
