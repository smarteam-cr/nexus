/**
 * lib/tests-diagnostico/resultado-anterior.test.ts — un resultado de la aplicación vieja se reabre en Nexus (O6 etapa
 * 1): la dirección vieja se lee, se reduce a área, letras y fecha, y el resultado se arma con la escala de hoy. Lo que
 * no tiene la forma exacta no se muestra.
 */
import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { MINI_ESCALA } from "@/lib/escala/documento/mini-escala.fixture";
import { leerResultadoDelTest, PAGINA_DEL_RESULTADO_VIEJO } from "./enlace-leido";
import { direccionDelResultadoAnterior, leerNivelesDelResultadoAnterior, resultadoDelTestAnterior, RUTA_DEL_RESULTADO_ANTERIOR } from "./resultado-anterior";

const escala = parsearEscala(MINI_ESCALA);
const area = escala.areas[0];

const viejo = (payload: unknown) => `${PAGINA_DEL_RESULTADO_VIEJO}#${compressToEncodedURIComponent(JSON.stringify(payload))}`;

const PAYLOAD = {
  v: 1,
  area: "ventas",
  contexto: { industria: "Software", dominio: "ejemplo.com", empresa: "Empresa <script>" },
  dims: { procesos: { nivel: 2 }, tecnologia: { nivel: 3 }, datos: { nivel: 1 }, equipo: { nivel: 2 }, express: { nivel: 2 }, tailor: { nivel: 3 }, amplify: { nivel: 2 }, evolve: { nivel: 1 } },
  qa: [{ dim: "datos", pares: [{ q: "¿Confías?", a: "Texto que escribió la persona" }] }],
  fecha: "2026-09-25T18:00:00.000Z",
};

const params = (dir: string) => Object.fromEntries(new URL(dir, "https://x").searchParams);

describe("la dirección vieja se reduce a área, letras y fecha", () => {
  it("una letra por posición, en el orden de la escala de hoy, y nada de lo que escribió la persona", () => {
    const dir = direccionDelResultadoAnterior(leerResultadoDelTest(viejo(PAYLOAD))!)!;
    expect(dir.startsWith(`${RUTA_DEL_RESULTADO_ANTERIOR}?`)).toBe(true);
    expect(params(dir)).toEqual({ a: "1", n: "IFDIIFID", f: "2026-09-25" });
    expect(dir).not.toMatch(/Empresa|Texto|ejemplo/);
  });

  it("una dimensión que falta queda como «-» y no corre a las demás", () => {
    const sinDatos = { ...PAYLOAD, dims: { ...PAYLOAD.dims, datos: undefined } };
    expect(params(direccionDelResultadoAnterior(leerResultadoDelTest(viejo(sinDatos))!)!).n).toBe("IF-IIFID");
  });

  it("lee también la del test nuevo (v: 2), por si alguien la pega en la dirección vieja", () => {
    const v2 = viejo({ v: 2, area: "2", fecha: "2026-10-26", dims: { "2.1": "E", "2.3": "O" }, qa: [] });
    expect(params(direccionDelResultadoAnterior(leerResultadoDelTest(v2)!)!)).toEqual({ a: "2", n: "E-O", f: "2026-10-26" });
  });
});

describe("la dirección corta se lee sin confiar en nada", () => {
  it("la forma exacta se lee", () => {
    expect(leerNivelesDelResultadoAnterior({ a: "1", n: "IF-", f: "2026-09-25" })).toEqual({
      areaId: "1",
      niveles: { "1.1": "I", "1.2": "F" },
      fecha: "2026-09-25",
    });
  });

  it("lo demás es null: otra área, otras letras, demasiadas, ninguna, o un arreglo", () => {
    for (const q of [{ a: "4", n: "IF" }, { a: "1", n: "IX" }, { a: "1", n: "I".repeat(13) }, { a: "1", n: "---" }, { a: ["1"], n: "IF" }, {}]) {
      expect(leerNivelesDelResultadoAnterior(q)).toBeNull();
    }
  });

  it("una fecha que no es fecha se ignora sin tumbar el resultado", () => {
    expect(leerNivelesDelResultadoAnterior({ a: "1", n: "I", f: "2026-13-45" })?.fecha).toBeNull();
    expect(leerNivelesDelResultadoAnterior({ a: "1", n: "I", f: "<b>" })?.fecha).toBeNull();
  });
});

describe("el resultado se arma con la escala de hoy y el cálculo del test nuevo", () => {
  it("cada letra cuenta como contestada y el área sale del chequeo", () => {
    const letras = area.dimensiones.map((_, i) => (i === 0 ? "F" : "I")).join("");
    const r = resultadoDelTestAnterior(escala, leerNivelesDelResultadoAnterior({ a: area.id, n: letras })!)!;
    expect(r.areaId).toBe(area.id);
    expect(r.preguntadas).toBe(area.dimensiones.length);
    expect(r.dimensiones[0].nivel).toBe("F");
    expect(r.nivel).not.toBeNull();
  });

  it("lo que la escala de hoy no tiene no cuenta; sin nada que cuente, no hay resultado", () => {
    const masAlla = "-".repeat(area.dimensiones.length) + "O";
    expect(resultadoDelTestAnterior(escala, leerNivelesDelResultadoAnterior({ a: area.id, n: masAlla })!)).toBeNull();
    expect(resultadoDelTestAnterior(escala, { areaId: "9", niveles: { "9.1": "F" }, fecha: null })).toBeNull();
  });
});
