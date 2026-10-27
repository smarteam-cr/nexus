import { describe, expect, it } from "vitest";
import {
  diaEnCostaRica,
  empresasConTests,
  estadoDelBanco,
  estadoEnHubspot,
  lunesDeLaSemana,
  medicionDelTest,
  medicionPorSemana,
  porcentaje,
  type IntentoEnPantalla,
} from "./pantalla";
import type { PreguntaDelBanco } from "./tipos";

const intento = (o: Partial<IntentoEnPantalla>): IntentoEnPantalla => ({
  id: "c1",
  area: "1",
  version: "web",
  estado: "terminado",
  paso: 8,
  totalDePreguntas: 8,
  nombre: "Ana Pérez",
  email: "ana@acme.com",
  puesto: null,
  empresa: "Acme",
  dominio: "acme.com",
  clientId: null,
  nivel: "F",
  nivelNombre: "Funcional",
  url: "https://nexus/external/test/resultado/x#y",
  hubspotFormAt: null,
  hubspotNotaAt: null,
  hubspotIntentos: 0,
  hubspotError: null,
  createdAt: "2026-10-20T10:00:00.000Z",
  terminadoAt: null,
  ...o,
});

const pregunta: PreguntaDelBanco = { id: "p-1.1", dimensionId: "1.1", texto: "¿Cómo…?", ayuda: null, opciones: [{ id: "o-1.1-D", texto: "Nada", nivel: "D" }] };

describe("el estado de un banco", () => {
  it("sin aprobar, publicado, y publicado con cambios sin aprobar", () => {
    expect(estadoDelBanco({ preguntas: [pregunta], aprobadas: null })).toBe("sin-aprobar");
    expect(estadoDelBanco({ preguntas: [pregunta], aprobadas: [pregunta] })).toBe("aprobado");
    expect(estadoDelBanco({ preguntas: [{ ...pregunta, texto: "¿Cómo hoy…?" }], aprobadas: [pregunta] })).toBe("aprobado-con-cambios");
  });
});

describe("la medición", () => {
  it("cuenta por área y versión, y dónde lo dejaron", () => {
    const m = medicionDelTest([
      intento({}),
      intento({ id: "c2", estado: "abandonado", paso: 2 }),
      intento({ id: "c3", estado: "abandonado", paso: 2 }),
      intento({ id: "c4", estado: "en_curso", paso: 0 }),
      intento({ id: "c5", version: "marketing", estado: "abandonado", paso: 9, totalDePreguntas: 4 }),
    ]);
    expect(m).toEqual([
      { area: "1", version: "marketing", visitas: null, empezados: 1, terminados: 0, abandonados: 1, enCurso: 0, dejadosEn: [0, 0, 0, 1] },
      { area: "1", version: "web", visitas: null, empezados: 4, terminados: 1, abandonados: 2, enCurso: 1, dejadosEn: [0, 0, 2] },
    ]);
  });

  it("con las visitas, suma los que abrieron la página; un test que se abrió y nadie empezó aparece con cero", () => {
    const m = medicionDelTest(
      [intento({})],
      [
        { dia: "2026-10-19", area: "1", version: "web", visitas: 7 },
        { dia: "2026-10-20", area: "1", version: "web", visitas: 3 },
        { dia: "2026-10-20", area: "3", version: "marketing", visitas: 2 },
      ],
    );
    expect(m.map((x) => [x.area, x.version, x.visitas, x.empezados])).toEqual([
      ["1", "web", 10, 1],
      ["3", "marketing", 2, 0],
    ]);
    expect(porcentaje(1, 10)).toBe(10);
    expect(porcentaje(1, 0)).toBeNull();
    expect(porcentaje(1, null)).toBeNull();
  });
});

describe("semana a semana (antes y después del corte)", () => {
  it("el día es el de Costa Rica y la semana empieza el lunes", () => {
    expect(diaEnCostaRica("2026-10-27T03:00:00.000Z")).toBe("2026-10-26");
    expect(lunesDeLaSemana("2026-10-26")).toBe("2026-10-26");
    expect(lunesDeLaSemana("2026-11-01")).toBe("2026-10-26");
    expect(lunesDeLaSemana("2026-10-25")).toBe("2026-10-19");
  });

  it("cada intento cuenta en la semana en que empezó, con las visitas de esa semana; la más reciente primero", () => {
    const filas = medicionPorSemana(
      [
        intento({ createdAt: "2026-10-20T10:00:00.000Z" }),
        intento({ id: "c2", estado: "abandonado", createdAt: "2026-10-26T05:00:00.000Z" }), // el lunes en UTC, el domingo 25 en Costa Rica
        intento({ id: "c3", createdAt: "2026-10-28T15:00:00.000Z" }),
      ],
      [
        { dia: "2026-10-21", area: "1", version: "web", visitas: 5 },
        { dia: "2026-10-28", area: "1", version: "web", visitas: 4 },
      ],
    );
    expect(filas.map((f) => [f.semana, f.visitas, f.empezados, f.terminados, f.abandonados])).toEqual([
      ["2026-10-26", 4, 1, 1, 0],
      ["2026-10-19", 5, 2, 1, 1],
    ]);
  });

  it("sin la tabla de visitas, las visitas son null y no cero", () => {
    expect(medicionPorSemana([intento({})], null)[0].visitas).toBeNull();
  });
});

describe("¿llegó a HubSpot?", () => {
  it("el formulario basta mientras contesta; terminado o dejado, falta la nota", () => {
    expect(estadoEnHubspot(intento({ estado: "en_curso", hubspotFormAt: "x" }), true)).toBe("enviado");
    expect(estadoEnHubspot(intento({ hubspotFormAt: "x" }), true)).toBe("en-camino");
    expect(estadoEnHubspot(intento({ hubspotFormAt: "x", hubspotNotaAt: "y" }), false)).toBe("enviado");
    expect(estadoEnHubspot(intento({ hubspotError: "404" }), true)).toBe("con-error");
    expect(estadoEnHubspot(intento({}), false)).toBe("apagado");
  });
});

describe("los intentos por empresa (K10)", () => {
  it("une por empresa de Nexus, si no por dominio, si no por correo; un terminado gana a uno posterior dejado", () => {
    const g = empresasConTests([
      intento({ id: "a", createdAt: "2026-10-20T10:00:00.000Z" }),
      intento({ id: "b", estado: "abandonado", createdAt: "2026-10-21T10:00:00.000Z", email: "luis@acme.com", nombre: "Luis" }),
      intento({ id: "c", area: "2", createdAt: "2026-10-19T10:00:00.000Z" }),
      intento({ id: "d", dominio: null, empresa: null, email: "yo@gmail.com", nombre: "Yo", createdAt: "2026-10-22T10:00:00.000Z" }),
      intento({ id: "e", clientId: "cli1", dominio: "otra.com", empresa: "Otra", createdAt: "2026-10-18T10:00:00.000Z" }),
    ]);
    expect(g.map((x) => x.clave)).toEqual(["e:yo@gmail.com", "d:acme.com", "c:cli1"]);
    const acme = g[1];
    expect(acme.porArea["1"].id).toBe("a");
    expect(acme.porArea["2"].id).toBe("c");
    expect(acme.personas.map((p) => p.email)).toEqual(["luis@acme.com", "ana@acme.com"]);
  });
});
