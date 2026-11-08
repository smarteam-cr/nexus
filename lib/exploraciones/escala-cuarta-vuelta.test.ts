/**
 * lib/exploraciones/escala-cuarta-vuelta.test.ts — La escala de la preventa, cuarta vuelta (2026-11-08, Elías con Centauro
 * Solutions): el radar que no subía a Eficiente u Óptimo, las áreas que se eligen y se superponen, «Para explorar más»
 * ordenado por hipótesis y la tarjeta de cada dimensión con sus preguntas para llevar a la próxima sesión.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RadarDeUnaEmpresa from "@/components/escala/RadarDeUnaEmpresa";
import type { SesionPlaneada } from "./guia";
import { areasDeLaEscala, hipotesisDelArea, ordenParaExplorar, partesParaExplorar, type AreaParaContar } from "./equipos-de-la-escala";
import { ESCALA_DE_PRUEBA, estadoDePrueba, todasEn } from "./escala-de-prueba.test-helpers";
import { leerPropuesta, OperacionSchema } from "./esquemas";
import { chequeoDelMapa, nivelDelVendedor, posicionesDelMapa, sinRiesgoSiSube } from "./mapa";
import { leerTarjetasDelAgente, llevadaDesdeLaEscala, opsParaLlevar, opsParaQuitar, tarjetaParaMostrar, yaLlevada } from "./tarjetas-de-la-escala";
import { procedenciasDeLaSesion, textoDeLaProcedencia, preguntasParaMostrar, type PestanaDeSesion } from "./guia";

const nivelEnElRadar = (chequeo: Parameters<typeof estadoDePrueba>[0], id: string) => {
  const estado = estadoDePrueba(chequeo);
  return chequeoDelMapa(ESCALA_DE_PRUEBA, ["1"], posicionesDelMapa(estado, [])).areas[0].dimensiones.find((d) => d.id === id)?.nivel;
};

describe("bug: marcar Eficiente u Óptimo no se veía en el radar", () => {
  const conRiesgo = { ...todasEn("I"), "1.3": { nivel: "I" as const, fuente: "vendedor" as const, riesgo: true } };

  it("la causa: con el riesgo guardado, Eficiente se dibuja en Funcional (lo topa el chequeo)", () => {
    expect(nivelEnElRadar({ ...conRiesgo, "1.3": { nivel: "E", fuente: "vendedor", riesgo: true } }, "1.3")).toBe("F");
  });

  it("⛔ marcar Eficiente u Óptimo quita el riesgo y el radar sube", () => {
    for (const nivel of ["E", "O"] as const) {
      const estimado = nivelDelVendedor(nivel, conRiesgo["1.3"], { nivel: "I", porQue: null, origen: "confirmado" });
      expect(estimado).toEqual({ nivel, fuente: "vendedor" });
      expect(nivelEnElRadar({ ...conRiesgo, "1.3": estimado! }, "1.3")).toBe(nivel);
    }
  });

  it("en Funcional o debajo, el riesgo se queda; marcar lo mismo que ya está no cambia nada", () => {
    expect(nivelDelVendedor("F", conRiesgo["1.3"], { nivel: "I", porQue: null, origen: "confirmado" })).toEqual({ nivel: "F", fuente: "vendedor", riesgo: true });
    expect(nivelDelVendedor("I", conRiesgo["1.3"], { nivel: "I", porQue: null, origen: "confirmado" })).toBeNull();
    // Ya en Eficiente con el riesgo (radar en Funcional): volver a marcar Eficiente lo arregla, y conserva la frase del cliente.
    expect(
      nivelDelVendedor("E", { nivel: "E", fuente: "reunion", evidencia: "lo dijo", riesgo: true }, { nivel: "E", porQue: null, origen: "confirmado" }),
    ).toEqual({ nivel: "E", fuente: "reunion", evidencia: "lo dijo" });
  });

  it("lo que propone el agente, usado en Eficiente, también sale sin el riesgo", () => {
    expect(sinRiesgoSiSube({ nivel: "O", fuente: "reunion", riesgo: true, porQue: "x" })).toEqual({ nivel: "O", fuente: "reunion", porQue: "x" });
    expect(sinRiesgoSiSube({ nivel: "F", fuente: "reunion", riesgo: true })).toEqual({ nivel: "F", fuente: "reunion", riesgo: true });
  });
});

describe("«Para explorar más»: entre más hipótesis, más se puede explorar", () => {
  const dims = (area: string) => Array.from({ length: 8 }, (_, i) => ({ id: `${area}.${i + 1}`, aplica: true }));
  const AREAS: AreaParaContar[] = [
    { id: "1", nombre: "Ventas", dimensiones: dims("1") },
    { id: "2", nombre: "Marketing", dimensiones: dims("2") },
    { id: "3", nombre: "Servicio", dimensiones: dims("3") },
  ];
  const hip = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { confirmado: { fuente: "hipotesis" as const } }]));
  const evi = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { confirmado: { fuente: "reunion" as const } }]));

  it("ordena por hipótesis (usadas y sugeridas sin frase); a igual número, la que tiene más sin dato", () => {
    const areas = areasDeLaEscala({
      areas: AREAS,
      enJuego: ["1", "3"],
      lo: {
        ...evi("1.1", "1.2", "1.3", "1.4", "1.5", "1.6"),
        ...hip("1.7", "1.8"),
        ...hip("2.1", "2.2"),
        "2.3": { sugerido: { fuente: "hipotesis" as const, conCita: false } },
        "2.4": { sugerido: { fuente: "reunion" as const, conCita: true } },
        ...evi("3.1", "3.2", "3.3", "3.4", "3.5", "3.6"),
        ...hip("3.7", "3.8"),
      },
      areasDeLasSesiones: [],
    });
    expect(areas.map(hipotesisDelArea)).toEqual([2, 3, 2]);
    expect(ordenParaExplorar(areas).map((a) => a.nombre)).toEqual(["Marketing", "Ventas", "Servicio"]);
  });

  it("un área sin hipótesis ni partes sin dato no lleva sugerencia", () => {
    const areas = areasDeLaEscala({ areas: AREAS.slice(0, 1), enJuego: ["1"], lo: evi(...dims("1").map((d) => d.id)), areasDeLasSesiones: [] });
    expect(ordenParaExplorar(areas)).toEqual([]);
  });

  it("las partes: primero las hipótesis, después las sin dato; lo que tiene evidencia no va", () => {
    const clase: Record<string, "evidencia" | "hipotesis"> = { "1.1": "evidencia", "1.2": "hipotesis", "1.5": "hipotesis" };
    const r = partesParaExplorar([...dims("1"), { id: "1.9", aplica: false }], (id) => clase[id] ?? null);
    expect(r.hipotesis.map((d) => d.id)).toEqual(["1.2", "1.5"]);
    expect(r.sinDato.map((d) => d.id)).toEqual(["1.3", "1.4", "1.6", "1.7", "1.8"]);
  });
});

describe("la tarjeta de cada dimensión", () => {
  it("lee lo del agente con tolerancia", () => {
    const t = leerTarjetasDelAgente(
      [
        { dimensionId: "1.1", comoEsta: "Cada vendedor\n lleva su Excel.", preguntas: ["¿Dónde?", 3, "¿Quién?"] },
        { dimensionId: "1.1", comoEsta: "Repetida", preguntas: [] },
        { dimensionId: "2.1", comoEsta: "Sin preguntas" },
        { dimensionId: "x", comoEsta: "No es de la escala" },
        "basura",
      ],
      new Set(["1.1", "2.1"]),
    );
    expect(t).toEqual({ "1.1": { comoEsta: "Cada vendedor lleva su Excel.", preguntas: ["¿Dónde?", "¿Quién?"] }, "2.1": { comoEsta: "Sin preguntas", preguntas: [] } });
    expect(leerTarjetasDelAgente(null, new Set(["1.1"]))).toEqual({});
  });

  it("sin corrida, se arma con el porqué y la pregunta de la escala, y no dice que es del agente", () => {
    expect(tarjetaParaMostrar(undefined, { porQue: "Lo dijo en la reunión.", preguntaDeLaEscala: "¿Cómo va?", conNivel: true })).toEqual({
      comoEsta: "Lo dijo en la reunión.",
      preguntas: ["¿Cómo va?"],
      deAgente: false,
    });
    expect(tarjetaParaMostrar(undefined, { porQue: null, preguntaDeLaEscala: "¿Cómo va?", conNivel: false }).comoEsta).toBe("Todavía sin dato de esta parte.");
    expect(tarjetaParaMostrar({ comoEsta: "Así está.", preguntas: [] }, { porQue: null, preguntaDeLaEscala: "¿Cómo va?", conNivel: true })).toEqual({
      comoEsta: "Así está.",
      preguntas: ["¿Cómo va?"],
      deAgente: true,
    });
  });

  it("se guarda en la propuesta y se lee de vuelta; una mal formada se ignora", () => {
    const tarjetasDeLaEscala = { porDimension: { "1.1": { comoEsta: "Así.", preguntas: ["¿Qué?"] } }, en: "2026-11-08T10:00:00.000Z", corridaId: "run" };
    expect(leerPropuesta({ tarjetasDeLaEscala }).tarjetasDeLaEscala).toEqual(tarjetasDeLaEscala);
    expect(leerPropuesta({ tarjetasDeLaEscala: { porDimension: { malo: 1 }, en: "x" } }).tarjetasDeLaEscala).toBeUndefined();
  });
});

describe("llevar una pregunta a la exploración (el mismo camino que ya lee la guía)", () => {
  const sesion: SesionPlaneada = { id: "s-tres", titulo: "Sesión 3" } as SesionPlaneada;

  it("con próxima sesión: se suma a lo que se lleva, con su dimensión, y la operación es válida", () => {
    const r = opsParaLlevar({ pregunta: " ¿Quién revisa los datos? ", dimensionId: "1.3", sesion });
    expect(r).toEqual({
      ok: true,
      ops: [
        {
          op: "editarSesion",
          sesionId: "s-tres",
          poner: { explorar: ["¿Quién revisa los datos?"], explorarPara: { "¿Quién revisa los datos?": "1.3" }, explorarDe: { "¿Quién revisa los datos?": "s-tres" } },
          quitar: [],
        },
      ],
    });
    if (r.ok) expect(OperacionSchema.safeParse(r.ops[0]).success).toBe(true);
  });

  it("⛔ la guía la muestra «Lo llevaste desde La escala», aunque no haya habido ninguna reunión, con su dimensión", () => {
    const q = "¿Quién revisa los datos?";
    const conLaPregunta = { ...sesion, explorar: [q], explorarPara: { [q]: "1.3" }, explorarDe: { [q]: "s-tres" } };
    const pestana = { clave: "s-tres", numero: 1, sesion: conLaPregunta, hecha: false } as unknown as PestanaDeSesion;
    const proc = procedenciasDeLaSesion(pestana, [pestana]);
    expect(proc.abiertos.get(q)).toBe(0);
    const preguntas = preguntasParaMostrar(null, [], [], ESCALA_DE_PRUEBA, proc);
    const llevada = preguntas.find((p) => p.pregunta === q);
    expect(llevada?.procedencia && textoDeLaProcedencia(llevada.procedencia)).toBe("Lo llevaste desde La escala");
    expect(llevada?.apunta?.para).toBe("1.3");
  });

  it("no la repite, conserva lo que ya llevaba y avisa con la lista llena", () => {
    // Una clave vieja que ya no está en la lista se limpia (el esquema topa las claves en 10).
    const con = { ...sesion, explorar: ["Otra cosa"], explorarPara: { "Otra cosa": "1.1", "Vieja": "1.4" }, explorarDe: { "Otra cosa": "s-uno" } };
    const r = opsParaLlevar({ pregunta: "¿Nueva?", dimensionId: "1.2", sesion: con });
    expect(r.ok && r.ops[0]).toMatchObject({
      poner: { explorar: ["Otra cosa", "¿Nueva?"], explorarPara: { "Otra cosa": "1.1", "¿Nueva?": "1.2" }, explorarDe: { "Otra cosa": "s-uno", "¿Nueva?": "s-tres" } },
    });
    expect(opsParaLlevar({ pregunta: "otra  COSA", dimensionId: "1.1", sesion: con })).toEqual({ ok: true, ops: [] });
    expect(yaLlevada("otra cosa", con)).toBe(true);
    const llena = { ...sesion, explorar: Array.from({ length: 10 }, (_, i) => `t${i}`) };
    expect(opsParaLlevar({ pregunta: "¿Una más?", dimensionId: "1.1", sesion: llena }).ok).toBe(false);
  });

  it("sin próxima sesión planeada no se lleva (no pisa lo marcado para explorar a fondo): lo dice", () => {
    expect(opsParaLlevar({ pregunta: "¿Quién revisa los datos?", dimensionId: "1.3", sesion: null }).ok).toBe(false);
  });

  it("se deshace: solo lo llevado desde La escala, y la sesión queda sin rastro", () => {
    const q = "¿Quién revisa los datos?";
    const llevada = { ...sesion, explorar: [q, "Abierta"], explorarPara: { [q]: "1.3" }, explorarDe: { [q]: "s-tres", Abierta: "s-uno" } };
    expect(llevadaDesdeLaEscala(q, llevada)).toBe(true);
    expect(llevadaDesdeLaEscala("Abierta", llevada)).toBe(false);
    const r = opsParaQuitar({ pregunta: q, sesion: llevada });
    expect(r.ok && r.ops[0]).toEqual({ op: "editarSesion", sesionId: "s-tres", poner: { explorar: ["Abierta"], explorarDe: { Abierta: "s-uno" } }, quitar: ["explorarPara"] });
    if (r.ok) expect(OperacionSchema.safeParse(r.ops[0]).success).toBe(true);
    expect(opsParaQuitar({ pregunta: "Abierta", sesion: llevada })).toEqual({ ok: true, ops: [] });
  });
});

describe("el radar con varias áreas encima", () => {
  const niveles = [
    { letra: "D" as const, nombre: "Deficiente" },
    { letra: "I" as const, nombre: "Inicial" },
    { letra: "F" as const, nombre: "Funcional" },
    { letra: "E" as const, nombre: "Eficiente" },
    { letra: "O" as const, nombre: "Óptimo" },
  ];
  const dimsDe = (area: string, nombres: string[], nivel: "I" | "F", porExplorar = false) =>
    nombres.map((nombre, i) => ({
      clave: `${area}.${i + 1}`,
      nombre,
      capa: (i < 2 ? "base" : "produccion") as "base" | "produccion",
      preguntada: true,
      nivel,
      porExplorar,
      puntaje: 30,
    }));
  const capas = [
    { clave: "base" as const, nombre: "Base operativa", nivel: null, puntaje: null },
    { clave: "produccion" as const, nombre: "Producción", nivel: null, puntaje: null },
  ];

  it("dibuja cada área de su color, con la clave de SU dimensión en sus nodos y la leyenda", () => {
    const html = renderToStaticMarkup(
      createElement(RadarDeUnaEmpresa, {
        area: "Ventas",
        dimensiones: dimsDe("1", ["Procesos", "Datos", "Propuesta", "Leads"], "I"),
        capas,
        niveles,
        color: "#0b58d3",
        otras: [{ area: "Marketing", color: "#db2777", dimensiones: dimsDe("2", ["Procesos", "Datos", "Marca", "Canales"], "F", true) }],
      }),
    );
    expect(html).toContain('class="rde-otra"');
    expect(html).toContain('data-d="2.3"');
    expect(html).toContain("#db2777");
    expect(html).toContain("Los nombres de las partes son los de Ventas");
    // Los nombres del radar son los del área principal.
    expect(html).toContain("Propuesta");
    expect(html).not.toContain(">Marca<");
  });

  it("⛔ sin `otras`, el radar del cliente no cambia: ni leyenda de áreas ni figuras de más", () => {
    const html = renderToStaticMarkup(createElement(RadarDeUnaEmpresa, { area: "Ventas", dimensiones: dimsDe("1", ["Procesos", "Datos", "Propuesta", "Leads"], "I"), capas, niveles }));
    expect(html).not.toContain("rde-otra");
    expect(html).not.toContain("Los nombres de las partes");
    expect(html).toContain("#0b58d3");
  });
});
