/**
 * lib/encuestas-de-cuenta/preguntas-de-datos.test.ts — lo que falta de los datos de la empresa, preguntado con opciones
 * y con lo que Nexus propone (R2 etapa 3).
 */
import { describe, expect, it } from "vitest";
import { datoDeLaEmpresa } from "@/lib/clients/datos-de-la-empresa";
import {
  esClaveDeDato,
  esRespuestaValida,
  faltaElDato,
  PREGUNTAS_DE_DATOS,
  preguntaDeDato,
  propuestaDeNexus,
  respuestasDelDato,
  textoDeLaPregunta,
} from "./preguntas-de-datos";
import { PREGUNTAS_SOBRE_LA_CUENTA } from "./preguntas";
import { decidirSiPreguntar } from "./reglas";

describe("el registro de las preguntas de datos", () => {
  it("cada una es de un dato que decide una persona y que tiene opciones, con su clave dato:<dato>", () => {
    const claves = PREGUNTAS_DE_DATOS.map((q) => q.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const q of PREGUNTAS_DE_DATOS) {
      const d = datoDeLaEmpresa(q.dato);
      expect(d.manda, q.dato).toBe("persona");
      expect(d.tipo, q.dato).toBe("opcion");
      expect(q.clave).toBe(`dato:${q.dato}`);
      expect(esClaveDeDato(q.clave)).toBe(true);
      expect(q.pregunta).toContain("{cliente}");
    }
    // No chocan con las de Sí o No.
    for (const p of PREGUNTAS_SOBRE_LA_CUENTA) expect(esClaveDeDato(p.clave)).toBe(false);
  });

  it("las respuestas son las opciones del dato y «No sé»; otra cosa no vale", () => {
    const q = preguntaDeDato("dato:trafico")!;
    expect(respuestasDelDato(q).map((r) => r.valor)).toEqual(["menos_10k", "10k_50k", "50k_200k", "200k_1m", "mas_1m", "no_se"]);
    expect(esRespuestaValida(q, "10k_50k")).toBe(true);
    expect(esRespuestaValida(q, "si")).toBe(false);
    expect(textoDeLaPregunta(q, "Wherex")).toBe("¿Cuántas visitas al mes tiene el sitio de Wherex?");
  });
});

describe("qué falta", () => {
  it("vacío falta; lo que dijo una persona (aquí, en HubSpot, la preventa o el test) no; lo que puso la IA, sí", () => {
    expect(faltaElDato({ valor: null, fuente: null })).toBe(true);
    for (const f of ["persona", "hubspot", "preventa", "test"] as const) expect(faltaElDato({ valor: "x", fuente: f })).toBe(false);
    expect(faltaElDato({ valor: "x", fuente: "investigacion" })).toBe(true);
    // Lo que una persona vació a propósito no se vuelve a preguntar.
    expect(faltaElDato({ valor: null, fuente: "persona" })).toBe(false);
  });
});

describe("lo que propone Nexus", () => {
  const q = preguntaDeDato("dato:aQuienVende")!;

  it("la propuesta que espera, con de dónde salió y su cita", () => {
    expect(propuestaDeNexus(q, { valor: null, fuente: null }, [{ valor: "personas", fuente: "investigacion", cita: "Vende en línea a consumidores" }])).toEqual({
      valor: "personas",
      rotulo: "A personas",
      deDonde: "Investigación",
      cita: "Vende en línea a consumidores",
    });
  });

  it("sin propuesta ni valor, nada; un valor que no es una opción no se propone", () => {
    expect(propuestaDeNexus(q, { valor: null, fuente: null }, [])).toBeNull();
    expect(propuestaDeNexus(q, { valor: null, fuente: null }, [{ valor: "a nadie", fuente: "reunion", cita: null }])).toBeNull();
  });
});

describe("cuándo se vuelve a preguntar", () => {
  const q = preguntaDeDato("dato:perfilCierre")!;
  const AHORA = new Date("2026-10-25T15:00:00Z");
  const dias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000);

  it("con «No sé», a las dos semanas; respondida, nunca más", () => {
    expect(decidirSiPreguntar(q, [{ evento: "respondida", valor: "no_se", preguntaVersion: 1, createdAt: dias(13) }], AHORA).preguntar).toBe(false);
    expect(decidirSiPreguntar(q, [{ evento: "respondida", valor: "no_se", preguntaVersion: 1, createdAt: dias(14) }], AHORA).preguntar).toBe(true);
    expect(decidirSiPreguntar(q, [{ evento: "respondida", valor: "mixta", preguntaVersion: 1, createdAt: dias(400) }], AHORA).preguntar).toBe(false);
  });
});
