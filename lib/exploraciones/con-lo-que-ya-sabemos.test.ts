/**
 * La escala de un cliente con lo que ya sabemos (24 nov, el TEC; docs/diagnostico-con-lo-que-sabemos-plan.md): la preventa
 * de una ficha que no es prospecto parte de lo que ya sabemos, y sus reuniones de trabajo se nombran aparte de las sesiones
 * de diagnóstico.
 */
import { describe, expect, it } from "vitest";
import { pedidoDePosicionar, reglaDeLoQueYaSabemos, REUNION_DE_TRABAJO, type ContextoDelPedido } from "./agente-pedido";
import { ESCALA_DE_PRUEBA, estadoDePrueba } from "./escala-de-prueba.test-helpers";
import { clavesDeTrabajo, type PestanaDeSesion, type ReunionDeLaExploracion, type SesionPlaneada } from "./guia";
import { sugerirReunionesDeTrabajo } from "./reuniones-de-trabajo";
import { partirDeLoQueYaSabemos, reunionesParaUbicar } from "./posicionar";

describe("partirDeLoQueYaSabemos", () => {
  it("la preventa de un cliente parte de lo que ya sabemos; la de un prospecto, de sus reuniones", () => {
    expect(partirDeLoQueYaSabemos("CLIENTE")).toBe(true);
    expect(partirDeLoQueYaSabemos("PROSPECTO")).toBe(false);
    // Una ficha sin tipo no inventa una base que no sabe si tiene.
    expect(partirDeLoQueYaSabemos(null)).toBe(false);
    expect(partirDeLoQueYaSabemos("")).toBe(false);
  });
});

describe("el pedido de «Ubicar con lo que ya sabemos»", () => {
  const ctx = (o: Partial<ContextoDelPedido> = {}): ContextoDelPedido & { objetivo: string } => ({
    modo: "leer",
    marco: "venta",
    empresa: "TEC · AE",
    industria: "EDUCATION",
    escala: ESCALA_DE_PRUEBA,
    areas: [],
    conHipotesis: true,
    perfil: null,
    contenido: estadoDePrueba().contenido,
    fuentes: [{ id: "S1", etiqueta: "Reunión del 22 oct 2026 (resumen): Reportes de Ventas", texto: "La cliente contó que los reportes se arman a mano cada semana." }],
    hoy: "2026-11-24T12:00:00.000Z",
    objetivo: "la preventa de un cliente, con lo que ya sabemos de la empresa",
    ...o,
  });

  it("sin sesiones de diagnóstico, dice que ubica con lo que ya sabemos y qué no es un nivel en una reunión de trabajo", () => {
    const p = pedidoDePosicionar(ctx({ loQueYaSabemos: "solo" }));
    expect(String(p.system)).toContain("todavía no tuvo sesiones de diagnóstico");
    expect(String(p.system)).toContain("lo que Smarteam explicó o configuró no es un nivel de la empresa");
    expect(String(p.system)).not.toContain("Las sesiones de diagnóstico pesan más");
  });

  it("con sesiones de diagnóstico, ellas pesan más que la base", () => {
    const p = pedidoDePosicionar(ctx({ loQueYaSabemos: "ademas" }));
    expect(String(p.system)).toContain("Las sesiones de diagnóstico pesan más");
  });

  it("la preventa de un prospecto no cambia", () => {
    expect(reglaDeLoQueYaSabemos(undefined)).toBe("");
    const p = pedidoDePosicionar(ctx());
    expect(String(p.system)).not.toContain("ya es cliente");
  });

  it("una reunión de trabajo se nombra como tal en la lista de reuniones que lee", () => {
    const p = pedidoDePosicionar(
      ctx({
        loQueYaSabemos: "ademas",
        reuniones: [
          { fuente: "S1", etiqueta: "Reunión del 22 oct 2026: Reportes de Ventas", deTrabajo: true },
          { fuente: "S2", etiqueta: "Reunión del 1 dic 2026: Diagnóstico de Marketing" },
        ],
      }),
    );
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain(`S1: Reunión del 22 oct 2026: Reportes de Ventas · ${REUNION_DE_TRABAJO}`);
    expect(cuerpo).toMatch(/S2: Reunión del 1 dic 2026: Diagnóstico de Marketing\n/);
  });
});

describe("clavesDeTrabajo", () => {
  const reunion = (id: string): ReunionDeLaExploracion => ({ id, titulo: id, fecha: "2026-10-22T15:00:00.000Z", origen: "meet", leida: false, texto: "transcripcion" });
  const pestana = (sesion: SesionPlaneada | null, r: ReunionDeLaExploracion | null): Pick<PestanaDeSesion, "sesion" | "reunion"> => ({ sesion, reunion: r });

  it("solo las reuniones de las sesiones marcadas como reunión de trabajo, con su clave y la que eligió la persona", () => {
    const claves = clavesDeTrabajo([
      pestana({ id: "s-a", deLoQueYaSabemos: true, reunion: { id: "gmeet_a", origen: "meet" } }, reunion("gmeet_a")),
      pestana({ id: "s-b", deLoQueYaSabemos: true, reunion: { id: "gmeet_b2", origen: "meet" } }, reunion("gmeet_b")),
      pestana({ id: "s-c" }, reunion("gmeet_c")),
      pestana({ id: "s-d", deLoQueYaSabemos: false }, reunion("gmeet_d")),
      pestana(null, reunion("gmeet_e")),
    ]);
    expect([...claves].sort()).toEqual(["meet:gmeet_a", "meet:gmeet_b", "meet:gmeet_b2"]);
  });
});

describe("sugerirReunionesDeTrabajo", () => {
  const r = (sessionId: string, title: string, date: string, texto = "transcripcion") => ({ sessionId, title, date, texto });
  const reuniones = [
    r("a", "AE | Reportes de Ventas", "2026-10-22T15:00:00.000Z"),
    r("b", "Revisión Fundatec", "2026-11-05T15:00:00.000Z"),
    r("c", "AE | Marketing Alineación y Despliegue", "2026-09-16T15:00:00.000Z"),
    r("d", "Capacitación ventas AE | TEC", "2026-09-09T15:00:00.000Z"),
    r("e", "AE | Reportes de Ventas", "2026-10-26T15:00:00.000Z"),
    r("f", "Sesión de cierre interna", "2026-07-02T15:00:00.000Z"),
    r("g", "Solo notas", "2026-10-01T15:00:00.000Z", "notas"),
    r("h", "Sin medir", "2026-10-02T15:00:00.000Z"),
  ];
  const delCliente = new Map<string, number | null>([
    ["a", 39],
    ["b", 59],
    ["c", 43],
    ["d", 14],
    ["e", 50],
    ["f", 0],
    ["g", 80],
    ["h", null],
  ]);

  it("primero la mejor de cada equipo, después las demás por cuánto habló el cliente; las de poca voz al final, marcadas", () => {
    const s = sugerirReunionesDeTrabajo(reuniones, delCliente, { minimo: 0.28 });
    expect(s.map((x) => x.sessionId)).toEqual(["b", "e", "c", "a", "d"]);
    expect(s.find((x) => x.sessionId === "e")?.equipo).toBe("ventas");
    expect(s.find((x) => x.sessionId === "c")?.equipo).toBe("marketing");
    expect(s.find((x) => x.sessionId === "d")).toMatchObject({ pocoDelCliente: true, delCliente: 14 });
    expect(s.filter((x) => x.pocoDelCliente).map((x) => x.sessionId)).toEqual(["d"]);
  });

  it("no sugiere lo que no tiene transcripción, ni donde la empresa no habló, ni lo que no se pudo medir", () => {
    const ids = sugerirReunionesDeTrabajo(reuniones, delCliente, { minimo: 0.28 }).map((x) => x.sessionId);
    expect(ids).not.toContain("f");
    expect(ids).not.toContain("g");
    expect(ids).not.toContain("h");
  });

  it("respeta el tope", () => {
    expect(sugerirReunionesDeTrabajo(reuniones, delCliente, { minimo: 0.28, cuantas: 2 })).toHaveLength(2);
  });
});

describe("reunionesParaUbicar con reuniones de trabajo", () => {
  const r = (id: string, dia: string) => ({ id, origen: "meet", fecha: `2026-${dia}T15:00:00.000Z`, texto: "transcripcion" });
  const todas = [r("trabajo1", "11-20"), r("trabajo2", "11-18"), r("trabajo3", "11-15"), r("trabajo4", "11-10"), r("diagnostico", "11-01")];
  const deSesiones = new Set(todas.map((x) => `meet:${x.id}`));

  it("una sesión de diagnóstico entra aunque haya cuatro reuniones de trabajo más nuevas", () => {
    const deTrabajo = new Set(["meet:trabajo1", "meet:trabajo2", "meet:trabajo3", "meet:trabajo4"]);
    expect(reunionesParaUbicar(todas, deSesiones, 4, null, { deTrabajo })).toEqual(["diagnostico", "trabajo1", "trabajo2", "trabajo3"]);
  });

  it("sin reuniones de trabajo, las más nuevas como siempre", () => {
    expect(reunionesParaUbicar(todas, deSesiones, 4)).toEqual(["trabajo1", "trabajo2", "trabajo3", "trabajo4"]);
  });
});
