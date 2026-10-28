import { describe, expect, it } from "vitest";
import { MINI_ESCALA } from "@/lib/escala/documento/mini-escala.fixture";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { conIdsPublicos, nombresDeLosPasos, respuestasDelBanco, vistaDelIntento } from "./ids-publicos";
import type { Intento } from "./repositorio-server";
import type { PreguntaDelBanco } from "./tipos";

const banco: PreguntaDelBanco[] = ["1.1", "1.2"].map((d) => ({
  id: `p-${d}`,
  dimensionId: d,
  texto: `¿Cómo funciona ${d}?`,
  ayuda: null,
  opciones: (["D", "I", "F", "E", "O"] as const).map((l) => ({ id: `o-${d}-${l}`, texto: `Opción ${l} de ${d}`, nivel: l })),
}));

function intento(): Intento {
  return {
    id: "c1",
    token: "t",
    area: "1",
    version: "web",
    edicion: null,
    escalaVersion: "8.9.1",
    preguntas: conIdsPublicos(banco),
    respuestas: {},
    paso: 0,
    estado: "en_curso",
    clientId: null,
    resultado: null,
    url: null,
    origen: null,
    hubspotFormAt: null,
    hubspotNotaAt: null,
    hubspotIntentos: 0,
    hubspotError: null,
    createdAt: "2026-10-26T10:00:00.000Z",
    updatedAt: "2026-10-26T10:00:00.000Z",
    terminadoAt: null,
    nombre: "Ana",
    email: "ana@acme.com",
    telefono: null,
    puesto: null,
    empresa: null,
    dominio: null,
    industria: null,
  };
}

describe("⛔ quien responde nunca ve el banco", () => {
  it("la vista no lleva ids del banco, dimensiones ni niveles; cada intento tiene ids propios", () => {
    const i = intento();
    const vista = vistaDelIntento(i);
    const texto = JSON.stringify(vista);
    expect(texto).not.toMatch(/p-1\.|o-1\.|dimensionId|"nivel"|"1\.1"|"1\.2"/);
    expect(vista.preguntas.map((p) => p.opciones.length)).toEqual([5, 5]);
    // Otro intento con el mismo banco: otros ids.
    const otro = vistaDelIntento(intento());
    expect(otro.preguntas[0].id).not.toBe(vista.preguntas[0].id);
    expect(otro.preguntas[0].opciones[0].id).not.toBe(vista.preguntas[0].opciones[0].id);
  });

  it("lo que manda la persona se traduce al banco; lo que no es de este intento se descarta", () => {
    const i = intento();
    const v = vistaDelIntento(i);
    const [p1, p2] = v.preguntas;
    const otro = vistaDelIntento(intento());
    const r = respuestasDelBanco(i, {
      [p1.id]: { opcion: p1.opciones[2].id, matiz: "  Usamos Excel  " },
      [p2.id]: { opcion: "no-se" },
      [otro.preguntas[0].id]: { opcion: otro.preguntas[0].opciones[4].id },
      inventada: { opcion: "o123" },
    });
    expect(r).toEqual({ "p-1.1": { opcion: "o-1.1-F", matiz: "Usamos Excel" }, "p-1.2": { opcion: "no-se" } });
    // Una opción de OTRA pregunta (o de otro intento) no cuenta.
    expect(respuestasDelBanco(i, { [p1.id]: { opcion: p2.opciones[4].id } })).toEqual({});
  });

  it("la barra de avance lleva el nombre de cada paso y su capa, sin decir nada del nivel", () => {
    const escala = parsearEscala(MINI_ESCALA);
    const area = escala.areas[0];
    const nombres = nombresDeLosPasos(escala, area.id);
    const d = area.dimensiones[0];
    expect(nombres[d.id]).toEqual({ paso: d.nombre, capa: escala.capas.find((c) => c.clave === d.capa)!.nombre });
    expect(nombresDeLosPasos(escala, "9")).toEqual({});
    const i = intento();
    i.preguntas = conIdsPublicos(banco, { "1.1": { paso: "Procesos y Rutinas", capa: "Base operativa" } });
    const v = vistaDelIntento(i);
    expect(v.preguntas.map((p) => [p.paso, p.capa])).toEqual([["Procesos y Rutinas", "Base operativa"], [null, null]]);
    expect(JSON.stringify(v)).not.toMatch(/dimensionId|"nivel"|"1\.1"/);
  });

  it("la vista devuelve lo ya elegido con los ids públicos", () => {
    const i = intento();
    const v0 = vistaDelIntento(i);
    i.respuestas = respuestasDelBanco(i, { [v0.preguntas[0].id]: { opcion: v0.preguntas[0].opciones[1].id } });
    expect(vistaDelIntento(i).respuestas).toEqual({ [v0.preguntas[0].id]: { opcion: v0.preguntas[0].opciones[1].id } });
  });
});
