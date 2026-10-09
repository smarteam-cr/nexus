/**
 * lib/escala/datos/editar.test.ts — los cambios del editor sobre el borrador.
 *
 * Cada cambio toca solo lo que dice (la bitácora lo confirma con `cambiosEntre`), un criterio nuevo
 * toma el número que sigue sin repetir uno en uso ni uno retirado, y lo que cambiaría cómo se lee la
 * escala (un salto de línea, una etiqueta a mano, una pregunta que empieza como lista o título) no entra.
 */
import { describe, expect, it } from "vitest";
import { cambiosEntre } from "./diferencias";
import { aplicarCambioDelEditor, nuevoIdDeCriterio, type CambioDelEditor } from "./editar";
import { generarMarkdown } from "./generar";
import { importarEscala } from "./importar";
import { MINI_EN_UNA_FORMA } from "./mini.fixture";
import { ErrorDelBorrador } from "./versiones";

const BASE = importarEscala(MINI_EN_UNA_FORMA);
const F1 = { texto: "Hay un pipeline configurado.", verificacion: "comprobable" as const, riesgo: false, habito: false, perfil: null, requiere: [] as string[] };
const aplicar = (cambio: CambioDelEditor, retirados: string[] = []) => aplicarCambioDelEditor(BASE, cambio, { retirados });

describe("el editor del borrador", () => {
  it("cambia el texto y las marcas de un criterio, y nada más", () => {
    const { datos } = aplicar({ tipo: "criterio", id: "1.1.F1", ...F1, texto: "Hay un pipeline con sus etapas.", riesgo: true, requiere: ["1.2.F1"] });
    expect(cambiosEntre(BASE, datos).map((c) => `${c.ancla} ${c.campo}`)).toEqual(["1.1.F1 texto", "1.1.F1 riesgo", "1.1.F1 requiere"]);
    expect(generarMarkdown(datos)).toContain("- Hay un pipeline con sus etapas. `[1.1.F1 · comprobable · riesgo · requiere 1.2.F1]`");
  });

  it("no toca los datos que recibe", () => {
    const antes = JSON.stringify(BASE);
    aplicar({ tipo: "criterio", id: "1.1.F1", ...F1, texto: "Otro texto." });
    expect(JSON.stringify(BASE)).toBe(antes);
  });

  it("da igual el orden de las claves (los datos que vuelven de la base, en JSONB, las traen en otro)", () => {
    const alReves = JSON.parse(
      JSON.stringify(BASE, (_, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)),
    );
    const { datos } = aplicarCambioDelEditor(alReves, { tipo: "criterio", id: "1.1.F1", ...F1, texto: "Otro texto." }, { retirados: [] });
    expect(cambiosEntre(BASE, datos).map((c) => c.ancla)).toEqual(["1.1.F1"]);
  });

  it("los espacios de más y los saltos de línea se juntan en una línea", () => {
    const { datos } = aplicar({ tipo: "criterio", id: "1.1.F1", ...F1, texto: "  Hay un pipeline\n   configurado.  " });
    expect(cambiosEntre(BASE, datos)).toEqual([]);
  });

  it("la frase y el resultado de un nivel; y una dimensión", () => {
    const nivel = aplicar({ tipo: "nivel", id: "1.1.F", frase: "La maquinaria base.", resultado: "Nada depende de nadie." }).datos;
    expect(cambiosEntre(BASE, nivel).map((c) => `${c.ancla} ${c.campo} ${c.despues}`)).toEqual(["1.1.F frase La maquinaria base.", "1.1.F resultado Nada depende de nadie."]);
    const dim = aplicar({
      tipo: "dimension",
      id: "1.2",
      nombre: "Tracción del Deal",
      pregunta: "¿Qué pasa cuando un negocio se detiene?",
      descripcion: "",
      costoDeQuedarse: "Los negocios mueren en silencio.",
    }).datos;
    expect(cambiosEntre(BASE, dim).map((c) => `${c.ancla} ${c.campo}`)).toEqual(["1.2 pregunta", "1.2 descripcion"]);
  });

  it("un criterio nuevo toma el número que sigue, sin repetir uno en uso ni uno retirado", () => {
    expect(nuevoIdDeCriterio(BASE, "1.1.F", [])).toBe("1.1.F4");
    expect(nuevoIdDeCriterio(BASE, "1.1.F", ["1.1.F4", "1.1.F5"])).toBe("1.1.F6");
    const { datos, id } = aplicar({ tipo: "nuevo-criterio", nivel: "1.1.F", ...F1, texto: "El pipeline tiene dueño.", verificacion: "declarado" }, ["1.1.F4"]);
    expect(id).toBe("1.1.F5");
    expect(cambiosEntre(BASE, datos)).toEqual([
      { ancla: "1.1.F5", tipoDeAncla: "criterio", accion: "agregado", campo: null, antes: null, despues: "- El pipeline tiene dueño. `[1.1.F5 · declarado]`" },
    ]);
  });

  it.each([
    ["el texto vacío", { tipo: "criterio", id: "1.1.F1", ...F1, texto: "   " }, "Falta el texto"],
    ["una etiqueta escrita a mano", { tipo: "criterio", id: "1.1.F1", ...F1, texto: "Algo `[1.1.F9 · declarado]`" }, "«`»"],
    ["un criterio que no existe", { tipo: "criterio", id: "1.1.F9", ...F1 }, "no tiene el criterio 1.1.F9"],
    ["un requerido que no es un identificador", { tipo: "criterio", id: "1.1.F1", ...F1, requiere: ["F1"] }, "no es un identificador"],
    ["una pregunta que empieza como lista", { tipo: "dimension", id: "1.2", nombre: "Tracción del Deal", pregunta: "- ¿Qué pasa?", descripcion: null, costoDeQuedarse: "Se pierde." }, "no se pueda leer"],
    ["una pregunta que empieza como título", { tipo: "dimension", id: "1.2", nombre: "Tracción del Deal", pregunta: "### ¿Qué pasa?", descripcion: null, costoDeQuedarse: "Se pierde." }, "escala"],
  ] as [string, CambioDelEditor, string][])("no entra: %s", (_, cambio, dice) => {
    expect(() => aplicar(cambio)).toThrow(ErrorDelBorrador);
    expect(() => aplicar(cambio)).toThrow(dice);
  });
});
