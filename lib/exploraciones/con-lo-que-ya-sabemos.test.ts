/**
 * La escala de un cliente con lo que ya sabemos (24 nov, el TEC; docs/diagnostico-con-lo-que-sabemos-plan.md): la preventa
 * de una ficha que no es prospecto parte de lo que ya sabemos, y sus reuniones de trabajo se nombran aparte de las sesiones
 * de diagnóstico.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rotuloDeLasReunionesDeTrabajo } from "@/lib/external/pagina-del-resumen";
import { pedidoDePosicionar, reglaDeLoQueYaSabemos, REUNION_DE_TRABAJO, type ContextoDelPedido } from "./agente-pedido";
import { ESCALA_DE_PRUEBA, estadoDePrueba } from "./escala-de-prueba.test-helpers";
import { clavesDeTrabajo, type PestanaDeSesion, type ReunionDeLaExploracion, type SesionPlaneada } from "./guia";
import { FORMATO_DE_LA_FOTO, paginaDeLaFoto } from "./escala-publicada";
import { lineaDeLaEscala, marcasQueCambiaron } from "./linea-de-la-escala";
import {
  bloqueDelPeso,
  cuantasSesiones,
  loQueHicimos,
  pedidoDelResumen,
  pesoDeLasSesiones,
  REGLA_DE_LAS_REUNIONES_DE_TRABAJO,
  type ContextoDelResumen,
  type ReunionParaElResumen,
} from "./resumen-de-la-escala";
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

describe("la línea de arriba de la preventa de un cliente", () => {
  const reunion = (dia: string, titulo: string, deTrabajo = false) => ({
    fecha: `2026-${dia}T15:00:00.000Z`,
    titulo,
    origen: "meet",
    texto: "transcripcion",
    ...(deTrabajo ? { deTrabajo: true as const } : {}),
  });
  const base = { ubicadaEn: null, resumenEn: null, ubicando: false, conLoQueYaSabemos: true };

  it("sin sesiones de diagnóstico el botón dice «Ubicar con lo que ya sabemos» y siempre hay qué leer", () => {
    const l = lineaDeLaEscala({ ...base, reuniones: [] });
    expect(l).toMatchObject({ estado: "sinUbicar", boton: { etiqueta: "Ubicar con lo que ya sabemos", fuerte: true } });
    expect(l.texto).toContain("Todavía no hay sesiones de diagnóstico");
    const conTrabajo = lineaDeLaEscala({ ...base, reuniones: [reunion("10-22", "AE | Reportes de Ventas", true)] });
    expect(conTrabajo.boton.etiqueta).toBe("Ubicar con lo que ya sabemos");
    expect(conTrabajo.texto).toContain("1 reunión de trabajo");
  });

  it("con una sesión de diagnóstico vuelve el botón de siempre; un prospecto no cambia", () => {
    expect(lineaDeLaEscala({ ...base, reuniones: [reunion("11-28", "Diagnóstico de Marketing")] }).boton.etiqueta).toBe("Ubicar con las reuniones");
    expect(lineaDeLaEscala({ ...base, conLoQueYaSabemos: false, reuniones: [] })).toMatchObject({ estado: "sinReuniones", boton: { etiqueta: "Ubicar con las reuniones" } });
  });

  it("ubicada con lo que ya sabemos: al día lo dice así, sin contar lo leído en resumen como reuniones", () => {
    const l = lineaDeLaEscala({
      ...base,
      reuniones: [],
      ubicadaEn: "2026-11-24T18:00:00.000Z",
      leyo: ["Reunión del 22 oct 2026 (resumen): AE | Reportes de Ventas", "Reunión del 21 oct 2026 (resumen): AE | Limpieza BBDD", "El handoff"],
    });
    expect(l.estado).toBe("alDia");
    expect(l.texto).toMatch(/con lo que ya sabemos · al día\.$/);
    expect(l.boton.etiqueta).toBe("Volver a ubicar con lo que ya sabemos");
  });

  it("una sesión de diagnóstico sumada sobre una base de trabajo es nueva aunque haya capacitaciones más recientes", () => {
    const trabajo = ["11-20", "11-18", "11-15", "11-10"].map((d, i) => reunion(d, `Capacitación ${i + 1}`, true));
    const l = lineaDeLaEscala({
      ...base,
      reuniones: [...trabajo, reunion("11-01", "Diagnóstico de Ventas")],
      ubicadaEn: "2026-11-21T18:00:00.000Z",
      leyo: ["Reunión del 20 nov 2026: Capacitación 1", "Reunión del 18 nov 2026: Capacitación 2", "Reunión del 15 nov 2026: Capacitación 3", "Reunión del 10 nov 2026: Capacitación 4"],
    });
    expect(l).toMatchObject({ estado: "nuevas", boton: { etiqueta: "Actualizar", fuerte: true } });
    expect(l.texto).toContain("Hay 1 sesión de diagnóstico nueva");
  });
});

describe("«Lo que hicimos» y el Resumen con reuniones de trabajo (D4)", () => {
  const sesion = (deTrabajo: boolean, minutos = 60) => ({ fecha: "2026-11-01T15:00:00.000Z", equipo: "Ventas", minutos, areaId: "1", ...(deTrabajo ? { deTrabajo: true as const } : {}) });

  it("dice «N reuniones de trabajo juntos y N sesiones de diagnóstico», sin la parte que es cero", () => {
    expect(cuantasSesiones([sesion(true), sesion(true), sesion(false)])).toBe("2 reuniones de trabajo juntos y 1 sesión de diagnóstico");
    expect(cuantasSesiones([sesion(true)])).toBe("1 reunión de trabajo juntos");
    expect(cuantasSesiones([sesion(false), sesion(false)])).toBe("2 sesiones");
  });

  it("las reuniones de trabajo nunca se presentan como exploración en la página", () => {
    const h = loQueHicimos({ sesiones: [sesion(true), sesion(true), sesion(false)], personas: 2, texto: null });
    expect(h?.texto).toContain("en 2 reuniones de trabajo juntos y 1 sesión de diagnóstico");
    expect(h?.texto).not.toMatch(/sesiones de exploración/);
    expect(h).toMatchObject({ sesiones: 3, deTrabajo: 2 });
    // Sin reuniones de trabajo, como siempre.
    expect(loQueHicimos({ sesiones: [sesion(false)], personas: 1, texto: null })?.deTrabajo).toBeUndefined();
  });

  it("el pedido del Resumen nombra la reunión de trabajo y dice que pesa menos", () => {
    const r = (clave: string, deTrabajo: boolean): ReunionParaElResumen => ({
      id: clave,
      clave,
      fecha: "2026-11-10T15:00:00Z",
      equipo: "Ventas",
      areaId: "1",
      turnos: [{ n: 1, hablante: "Ana", texto: "Armamos los reportes a mano" }],
      delCliente: ["Ana"],
      ...(deTrabajo ? { deTrabajo: true as const } : {}),
    });
    const ctx: ContextoDelResumen = { empresa: "TEC · AE", areas: [], reuniones: [r("R1", true), r("R2", false)], instrucciones: "" };
    const texto = String((pedidoDelResumen(ctx).messages[0] as { content: string }).content);
    expect(texto).toContain(REGLA_DE_LAS_REUNIONES_DE_TRABAJO);
    expect(texto).toMatch(/### R1 · 2026-11-10 · con Ventas · reunión de trabajo \(lo que ya sabemos\)/);
    expect(texto).not.toMatch(/### R2 [^\n]*reunión de trabajo/);
    const sinTrabajo = String((pedidoDelResumen({ ...ctx, reuniones: [r("R2", false)] }).messages[0] as { content: string }).content);
    expect(sinTrabajo).not.toContain(REGLA_DE_LAS_REUNIONES_DE_TRABAJO);
  });

  it("el peso de cada sesión marca las de trabajo", () => {
    const peso = pesoDeLasSesiones(
      [
        { id: "a", origen: "meet", fecha: "2026-11-01", titulo: "Capacitación", minutos: 90, areaId: "1", deTrabajo: true },
        { id: "b", origen: "meet", fecha: "2026-11-05", titulo: "Diagnóstico", minutos: 60, areaId: "1" },
      ],
      new Set(["1"]),
      new Map([["a", "R1"]]),
    );
    expect(peso[0].deTrabajo).toBe(true);
    expect(peso[1].deTrabajo).toBeUndefined();
    expect(bloqueDelPeso(peso)).toContain("«Capacitación» · 90 min (60 %) · reunión de trabajo (lo que ya sabemos)");
  });
});

describe("lo que cazó la revisión del 24 nov", () => {
  const leer = (...partes: string[]) => fs.readFileSync(path.join(process.cwd(), ...partes), "utf8").replace(/\r\n/g, "\n");

  it("solo un CLIENTE parte de lo que ya sabemos: un aliado o una ficha interna no", () => {
    expect(partirDeLoQueYaSabemos("ALIADO")).toBe(false);
    expect(partirDeLoQueYaSabemos("INTERNO")).toBe(false);
  });

  it("⛔ el selector del contexto no se pierde al primer cambio: vive aparte de `exp`", () => {
    const paso = leer("components", "exploraciones", "PasoEscala.tsx");
    expect(paso).toMatch(/const \{ exp, puedeEditar, proyectosDeLaEmpresa \} = useLienzo\(\)/);
    expect(paso).not.toMatch(/exp\.proyectosDeLaEmpresa/);
    const lienzo = leer("components", "exploraciones", "LienzoDeExploracion.tsx");
    expect(lienzo).toMatch(/if \(data\.exploracion\.proyectosDeLaEmpresa\) setProyectosDeLaEmpresa\(data\.exploracion\.proyectosDeLaEmpresa\)/);
  });

  it("⛔ leer la cuenta pide acceso a la empresa: «Ubicar» de un cliente y las reuniones sugeridas", () => {
    const agente = leer("app", "api", "sales", "exploraciones", "[id]", "agente", "route.ts");
    expect(agente).toMatch(/if \(modo === "posicionar"\) \{[\s\S]{0,400}partirDeLoQueYaSabemos\(lectura\.fila\.client\.kind\)[\s\S]{0,200}guardAccessToClient\(lectura\.fila\.clientId\)/);
    const sugeridas = leer("app", "api", "sales", "exploraciones", "[id]", "reuniones-de-trabajo", "route.ts");
    expect(sugeridas.indexOf("guardAccessToClient(fila.clientId)")).toBeGreaterThan(-1);
    expect(sugeridas.indexOf("guardAccessToClient(fila.clientId)")).toBeLessThan(sugeridas.indexOf("reunionesDeTrabajoSugeridas("));
  });

  it("⛔ la marca de reunión de trabajo se pone solo en la preventa de un cliente y en una que ya pasó, y solo ahí se lee", () => {
    const ruta = leer("app", "api", "sales", "exploraciones", "[id]", "sesiones", "route.ts");
    expect(ruta).toMatch(/const deTrabajo = !!c\.deLoQueYaSabemos && c\.tipo === "pasada" && !lectura\.fila\.projectId && partirDeLoQueYaSabemos\(lectura\.fila\.client\.kind\)/);
    const fuentes = leer("lib", "exploraciones", "fuentes.ts");
    expect(fuentes).toMatch(/const deTrabajo = !opts\.projectId && armadas\.corte\.esCliente \? clavesDeTrabajo\(pestanas\) : new Set<string>\(\)/);
    const resumen = leer("lib", "exploraciones", "resumen-de-la-escala-server.ts");
    expect(resumen).toMatch(/const conMarcas = !fila\.projectId && partirDeLoQueYaSabemos\(fila\.client\.kind\)/);
  });

  it("⛔ la página del cliente nombra las reuniones de trabajo aparte (D4), en una celda, y las áreas sin «exploradas»", () => {
    const vista = leer("components", "external", "test", "ResumenDeLaEscalaVista.tsx");
    expect(vista).toMatch(/\{h\.deTrabajo \? \([\s\S]{0,300}rotuloDeLasReunionesDeTrabajo\(h\.deTrabajo, h\.sesiones - h\.deTrabajo\)/);
    expect(vista).toMatch(/h\.deTrabajo \? \(exploradas\.length === 1 \? "área con la que trabajamos" : "áreas con las que trabajamos"\)/);
    expect(rotuloDeLasReunionesDeTrabajo(4, 2)).toBe("reuniones de trabajo juntos y 2 sesiones de diagnóstico");
    expect(rotuloDeLasReunionesDeTrabajo(1, 0)).toBe("reunión de trabajo juntos");
  });

  it("si cambia la clase de una reunión después de armar el Resumen, la línea pide rehacerlo", () => {
    const fecha = "2026-10-22T15:00:00.000Z";
    expect(marcasQueCambiaron([{ fecha }], [{ fecha, deTrabajo: true }])).toBe(1);
    expect(marcasQueCambiaron([{ fecha, deTrabajo: true }], [{ fecha, deTrabajo: true }])).toBe(0);
    expect(marcasQueCambiaron(undefined, [{ fecha, deTrabajo: true }])).toBe(0);
    const l = lineaDeLaEscala({
      reuniones: [{ fecha, titulo: "AE | Reportes", origen: "meet", texto: "transcripcion", deTrabajo: true }],
      ubicadaEn: "2026-11-24T18:00:00.000Z",
      leyo: ["Reunión del 22 oct 2026: AE | Reportes"],
      resumenEn: "2026-11-24T19:00:00.000Z",
      ubicando: false,
      conLoQueYaSabemos: true,
      marcasCambiadas: 1,
    });
    expect(l.estado).toBe("resumenAtrasado");
    expect(l.texto).toContain("cuenta 1 reunión con otra clase");
  });

  it("el pedido del Resumen no titula «de diagnóstico» un bloque con reuniones de trabajo", () => {
    const r: ReunionParaElResumen = { id: "a", clave: "R1", fecha: "2026-11-10T15:00:00Z", equipo: null, turnos: [{ n: 1, hablante: "Ana", texto: "x" }], delCliente: ["Ana"], deTrabajo: true };
    const texto = String((pedidoDelResumen({ empresa: "TEC · AE", areas: [], reuniones: [r], instrucciones: "" }).messages[0] as { content: string }).content);
    expect(texto).toContain("Las reuniones con la empresa (cada línea");
    expect(texto).not.toContain("Las reuniones de diagnóstico (cada línea");
  });
});

describe("una escala ya publicada no cambia sola con el deploy (Elías, 24 nov)", () => {
  it("la foto guarda «Lo que hicimos» armado: una de antes no trae la marca y se dibuja como siempre", () => {
    const vieja = { formato: FORMATO_DE_LA_FOTO, pagina: { empresa: "TEC · AE", areas: [], resultados: [], resumen: { hicimos: { sesiones: 4, minutos: 240, sinDuracion: 0, equipos: [], personas: 3, texto: "Nos dedicaste 4 h en 4 sesiones.", mano: false, areas: [] } } } };
    const pagina = paginaDeLaFoto(vieja);
    const h = (pagina?.resumen as { hicimos?: { deTrabajo?: number; texto: string } } | undefined)?.hicimos;
    expect(h?.deTrabajo).toBeUndefined();
    expect(h?.texto).toBe("Nos dedicaste 4 h en 4 sesiones.");
    // La vista solo cambia con la marca: sin ella, la cifra y el rótulo de siempre.
    const vista = fs.readFileSync(path.join(process.cwd(), "components", "external", "test", "ResumenDeLaEscalaVista.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(vista).toMatch(/\{h\.deTrabajo \? \([\s\S]{0,700}\) : \(\s*<div>\s*<b>\{fijo\("hicimos\.sesiones", String\(h\.sesiones\)/);
  });
});
