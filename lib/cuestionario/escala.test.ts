import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { MINI_ESCALA } from "@/lib/escala/documento/mini-escala.fixture";
import { areasContratadas } from "@/lib/escala/areas-por-hub";
import { fundirGuardado, leerGuardado } from "./avance";
import { compararCuestionarios } from "./comparar";
import { armarSecciones, estimadosDeLasRespuestas, resultadoDeLaEscala } from "./escala-armado";
import type { CuestionariosDelProyecto, CuestionarioVista } from "./servicio";
import { OPCION_NO_SE, preguntaParaElCliente, type Respuestas } from "./tipos";

const escala = parsearEscala(MINI_ESCALA);
const AHORA = "2026-10-02T10:00:00.000Z";
const area1 = escala.areas.find((a) => a.id === "1")!;

describe("áreas por hub: solo las de los hubs contratados", () => {
  it("mapea por número de área, no por nombre", () => {
    expect(areasContratadas(["service_hub", "sales_hub", "otra"])).toEqual(["1", "3"]);
    expect(areasContratadas([])).toEqual([]);
  });
});

describe("cuestionario de escala: se arma desde la escala publicada", () => {
  const secciones = armarSecciones(escala, ["1"], { cierre: "con equipo", despues: "continua" }, {}, AHORA);
  const area = secciones.find((s) => s.key === "area-1")!;
  const principales = area.preguntas.filter((q) => !q.opcional);

  it("una pregunta principal por dimensión que aplica, con la pregunta de la escala", () => {
    expect(principales.length).toBeGreaterThan(0);
    for (const q of principales) {
      const dim = area1.dimensiones.find((d) => d.id === q.ref)!;
      expect(dim).toBeTruthy();
      expect(q.texto).toBe(dim.pregunta);
    }
  });

  it("una opción por nivel, con su letra SOLO del lado nuestro", () => {
    for (const q of principales) {
      expect(q.opciones!.map((o) => o.nivel)).toEqual(["D", "I", "F", "E", "O"]);
    }
  });

  it("⛔ el cliente no ve ids de la escala, letras ni la dimensión", () => {
    for (const q of area.preguntas) {
      const visible = preguntaParaElCliente(q);
      expect(visible.ref).toBeUndefined();
      expect(visible.opciones?.some((o) => "nivel" in o)).toBeFalsy();
      // Los ids son opacos: no se puede leer la dimensión en ellos.
      expect(q.id).not.toMatch(/\d\.\d/);
      expect(JSON.stringify(visible)).not.toMatch(/"\d\.\d+(\.[DIFEO]\d*)?"/);
    }
  });

  it("cada dimensión trae su «cuéntanos un ejemplo» opcional", () => {
    expect(area.preguntas.filter((q) => q.opcional).length).toBe(principales.length);
  });

  it("sin perfil, sus preguntas van primero; con perfil, no", () => {
    const sinPerfil = armarSecciones(escala, ["1"], null, {}, AHORA);
    const conPerfil = armarSecciones(escala, ["1"], { cierre: "con equipo", despues: "continua" }, {}, AHORA);
    expect(conPerfil.some((s) => s.key === "tu-negocio")).toBe(false);
    if (escala.perfilDeNegocio.cierre || escala.perfilDeNegocio.despues) {
      expect(sinPerfil[0].key === "tu-negocio" || sinPerfil.every((s) => s.key !== "tu-negocio")).toBe(true);
    }
  });

  it("lo que ya ubicó el diagnóstico preliminar llega prellenado (sin IA)", () => {
    const dim = principales[0].ref!;
    const [s] = armarSecciones(escala, ["1"], { cierre: "con equipo", despues: "continua" }, { [dim]: { nivel: "F" } }, AHORA);
    const q = s.preguntas.find((x) => x.ref === dim && !x.opcional)!;
    const r = s.respuestas[q.id];
    expect(r.origen).toBe("prellenado");
    expect(q.opciones!.find((o) => o.id === r.valor)!.nivel).toBe("F");
  });

  it("el código de la escala no está escrito acá: el armador no conoce nombres de dimensiones", () => {
    const src = fs.readFileSync("lib/cuestionario/escala-armado.ts", "utf8");
    for (const d of area1.dimensiones) expect(src).not.toContain(d.nombre);
  });
});

describe("el nivel lo calcula Nexus", () => {
  const secciones = armarSecciones(escala, ["1"], { cierre: "con equipo", despues: "continua" }, {}, AHORA);
  const area = secciones.find((s) => s.key === "area-1")!;
  const principales = area.preguntas.filter((q) => !q.opcional);

  it("cada opción elegida es la letra de su nivel; «No lo sé» cuenta como el más bajo", () => {
    const respuestas: Respuestas = {};
    principales.forEach((q, i) => {
      respuestas[q.id] = { valor: i === 0 ? OPCION_NO_SE : q.opciones![2].id, origen: "cliente", actualizadoAt: AHORA };
    });
    const { estimados, contestadas, total } = estimadosDeLasRespuestas([{ key: "area-1", preguntas: area.preguntas, respuestas }], {
      cierre: "con equipo",
      despues: "continua",
    });
    expect(estimados[principales[0].ref!].nivel).toBe("D");
    expect(estimados[principales[1].ref!].nivel).toBe("F");
    expect(contestadas).toBe(total);
  });

  it("con todo contestado, el área tiene nivel", () => {
    const respuestas: Respuestas = {};
    for (const q of principales) respuestas[q.id] = { valor: q.opciones![2].id, origen: "cliente", actualizadoAt: AHORA };
    const { resultado } = resultadoDeLaEscala(escala, null, [{ key: "area-1", preguntas: area.preguntas, respuestas }], {
      cierre: "con equipo",
      despues: "continua",
    });
    expect(resultado.areas[0].nivel).toBe("F");
  });

  it("una opción que no es de la pregunta no se guarda", () => {
    const q = principales[0];
    const r = fundirGuardado(
      { tipo: "escala", preguntas: area.preguntas, respuestas: {}, etapas: [] },
      leerGuardado({ respuestas: { [q.id]: { valor: "o-inventada" } }, etapas: [] })!,
      AHORA,
    );
    expect(r.respuestas[q.id]).toBeUndefined();
  });
});

function vistaDe(cuestionarios: Partial<CuestionarioVista>[]): CuestionariosDelProyecto {
  return {
    personas: [
      { id: "p1", nombre: "Ana", cargo: null, email: null, ruta: "", revocado: false, ultimoUsoAt: null },
      { id: "p2", nombre: "Luis", cargo: null, email: null, ruta: "", revocado: false, ultimoUsoAt: null },
    ],
    cuestionarios: cuestionarios.map((c, i) => ({
      id: `c${i}`,
      tipo: "escala",
      titulo: "Escala de rendimiento",
      personaId: null,
      publicadoAt: AHORA,
      cerradoAt: null,
      escala: null,
      prellenado: { enCurso: false, at: null, error: null },
      pestanas: [],
      cambios: [],
      disponibles: [],
      ...c,
    })) as CuestionarioVista[],
  };
}

describe("vista comparada", () => {
  const opciones = ["D", "I", "F", "E", "O"].map((n) => ({ id: `o${n}`, texto: `Nivel ${n}`, nivel: n }));
  const pestana = (valor: string, extra: object = {}) => ({
    id: "x",
    key: "area-1",
    titulo: "Ventas",
    descripcion: null,
    tipo: "escala" as const,
    preguntas: [{ id: "q1", categoria: "Proceso", texto: "¿?", momento: "previo" as const, opciones, ref: "1.1" }],
    respuestas: { q1: { valor, origen: "cliente" as const, actualizadoAt: AHORA, ...extra } },
    etapas: [],
    contextoAdicional: null,
    enviadaAt: AHORA,
    clienteActualizadoAt: AHORA,
    avance: { contestadas: 1, total: 1, sinEtapas: false },
    adjuntos: [],
  });

  it("en escala, dos niveles de distancia = se contradicen; uno = difieren", () => {
    const lejos = compararCuestionarios(vistaDe([{ personaId: "p1", pestanas: [pestana("oD")] }, { personaId: "p2", pestanas: [pestana("oF")] }]));
    expect(lejos.escala!.dimensiones[0].desacuerdo).toBe("se-contradicen");
    const cerca = compararCuestionarios(vistaDe([{ personaId: "p1", pestanas: [pestana("oF")] }, { personaId: "p2", pestanas: [pestana("oE")] }]));
    expect(cerca.escala!.dimensiones[0].desacuerdo).toBe("difieren");
  });

  it("lo prellenado sin confirmar no es la voz de nadie: no cuenta para el desacuerdo", () => {
    const r = compararCuestionarios(
      vistaDe([
        { personaId: "p1", pestanas: [pestana("oD", { origen: "prellenado" })] },
        { personaId: "p2", pestanas: [pestana("oO")] },
      ]),
    );
    expect(r.escala!.dimensiones[0].desacuerdo).toBeNull();
  });

  it("dice quién respondió qué, y enviado frente a borrador", () => {
    const r = compararCuestionarios(vistaDe([{ personaId: "p1", pestanas: [pestana("oF")] }]));
    expect(r.estado[0]).toMatchObject({ persona: "Ana", seccionesEnviadas: 1, secciones: 1 });
  });
});

describe("⛔ el cuestionario nunca es obligatorio para avanzar", () => {
  it("ningún gate del ciclo de vida lee los cuestionarios", () => {
    const leer = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? leer(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !e.name.includes(".test.") ? [`${dir}/${e.name}`] : [],
      );
    const ofensores = [...leer("lib/lifecycle"), ...leer("lib/flow")].filter((f) => /cuestionario/i.test(fs.readFileSync(f, "utf8")));
    expect(ofensores, "un gate que mira el cuestionario lo vuelve obligatorio").toEqual([]);
  });
});

describe("el perfil de negocio reconoce sus opciones aunque el nombre traiga palabras de más", () => {
  it("«Relación única» es «única», «Relación continua» es «continua»", () => {
    const e = parsearEscala(MINI_ESCALA);
    const [s] = armarSecciones(
      { ...e, perfilDeNegocio: { ...e.perfilDeNegocio, despues: { pregunta: "¿Qué pasa después?", opciones: [
        { nombre: "Relación única", definicion: "compra una vez" },
        { nombre: "Recompra", definicion: "vuelve sin contrato" },
        { nombre: "Relación continua", definicion: "hay contrato" },
      ] } } },
      ["1"],
      { cierre: "con equipo", despues: null },
      {},
      AHORA,
    );
    expect(s.key).toBe("tu-negocio");
    expect(s.preguntas[0].opciones!.map((o) => o.id)).toEqual(["única", "recompra", "continua"]);
  });
});
