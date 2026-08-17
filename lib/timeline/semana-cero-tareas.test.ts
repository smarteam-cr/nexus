import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tareasFijasDeSemanaCero } from "./semana-cero-tareas";

/**
 * lib/timeline/semana-cero-tareas.test.ts — LAS CINCO QUE SIEMPRE ARRANCAN, Y LA QUE RAMIFICA.
 *
 * Estas tareas vivían enterradas en una ruta de 3.500 líneas y **sin un solo test**, a pesar de
 * que una de ellas cambia de TEXTO y de RESPONSABLE según el tipo de implementación — y es una
 * fila que el cliente lee en el cronograma publicado. Pedirle a un cliente que «entregue la base
 * a importar» cuando ya usa HubSpot hace quedar mal al equipo en la primera semana.
 *
 * Salieron de ahí porque la primera generación del detalle tiene que poder pasar por la CURACIÓN
 * como todo el resto del cronograma. Si el cálculo se quedaba pegado al camino que escribe,
 * mandarla por revisión habría hecho desaparecer estas cinco sin que nadie lo notara.
 */

const DESDE_CERO = "Proporcionar bases de datos a importar";
const EXISTENTE = "Revisar y limpiar la base de datos existente";

describe("las cinco de siempre", () => {
  it("sin nada cargado, se siembran las cinco", () => {
    const r = tareasFijasDeSemanaCero([], []);
    expect(r).toHaveLength(5);
    expect(r.every((t) => t.weekIndex === 0)).toBe(true);
    expect(r.every((t) => t.type === "TASK")).toBe(true);
  });

  it("el orden arranca donde se le diga, para no pisar lo que propuso el agente", () => {
    const r = tareasFijasDeSemanaCero([], [], 7);
    expect(r.map((t) => t.order)).toEqual([7, 8, 9, 10, 11]);
  });

  it("y los responsables no son todos del cliente", () => {
    /* La de HubSpot Academy la hace Smarteam. Si todas salieran party=CLIENTE, la Semana 0 se
       leería como una lista de deberes del cliente, que es exactamente lo que no es. */
    const r = tareasFijasDeSemanaCero([], []);
    expect(r.some((t) => t.party === "SMARTEAM")).toBe(true);
    expect(r.some((t) => t.party === "CLIENTE")).toBe(true);
  });
});

describe("⛔ la rama de base de datos: TRES estados, no dos", () => {
  it("re-implementación → revisar y limpiar la existente, party AMBOS", () => {
    const r = tareasFijasDeSemanaCero(["reimplementacion"], []);
    const bd = r.find((t) => t.title === EXISTENTE);
    expect(bd, "una re-implementación recibió la tarea de cargar la base desde cero").toBeDefined();
    expect(bd?.party).toBe("AMBOS");
    expect(r.map((t) => t.title)).not.toContain(DESDE_CERO);
  });

  it("implementación desde cero → entregar la base, party CLIENTE", () => {
    const r = tareasFijasDeSemanaCero(["implementacion"], []);
    const bd = r.find((t) => t.title === DESDE_CERO);
    expect(bd).toBeDefined();
    expect(bd?.party).toBe("CLIENTE");
    expect(r.map((t) => t.title)).not.toContain(EXISTENTE);
  });

  it("⭐ SIN tipo definido → el camino de siempre, pero MARCADA por validar", () => {
    /* El tercer estado es el que importa y el que se pierde si alguien «simplifica» a un booleano:
       sin tipo, el enum en null caía en el mismo `false` que «desde cero» y la tarea se sembraba
       afirmando algo que nadie había respondido. Ahora se siembra igual —para no dejar la Semana 0
       coja— pero el CSE ve un pendiente en vez de un hecho. */
    const r = tareasFijasDeSemanaCero([], []);
    const bd = r.find((t) => t.title === DESDE_CERO);
    expect(bd, "sin tipo definido dejó de sembrarse la tarea de base de datos").toBeDefined();
    expect(bd?.needsValidation, "se sembró como hecho, sin marcar que nadie lo respondió").toBe(true);
  });

  it("⚠ y con el tipo definido NO se marca", () => {
    expect(tareasFijasDeSemanaCero(["implementacion"], []).find((t) => t.title === DESDE_CERO)?.needsValidation).toBe(false);
    expect(tareasFijasDeSemanaCero(["reimplementacion"], []).find((t) => t.title === EXISTENTE)?.needsValidation).toBe(false);
  });

  it("las demás nunca nacen por validar", () => {
    const r = tareasFijasDeSemanaCero([], []);
    expect(r.filter((t) => t.needsValidation)).toHaveLength(1);
  });
});

describe("⛔ el dedup mira la GEMELA, no solo el título propio", () => {
  it("un proyecto reclasificado no termina pidiendo las dos cosas a la vez", () => {
    /* El defecto concreto: sembrado como «implementación» y después reclasificado a
       «re-implementación», recibía la segunda conservando la primera — y la Semana 0 pedía cargar
       la base Y limpiar la existente al mismo tiempo. */
    const r = tareasFijasDeSemanaCero(["reimplementacion"], [DESDE_CERO]);
    expect(r.map((t) => t.title)).not.toContain(EXISTENTE);
    expect(r).toHaveLength(4);
  });

  it("y al revés también", () => {
    const r = tareasFijasDeSemanaCero(["implementacion"], [EXISTENTE]);
    expect(r.map((t) => t.title)).not.toContain(DESDE_CERO);
  });

  it("no repite lo que ya está, ignorando mayúsculas y espacios", () => {
    const r = tareasFijasDeSemanaCero([], ["  ENTREGAR DOCUMENTACIÓN DE PROCESOS INVOLUCRADOS  "]);
    expect(r.map((t) => t.title)).not.toContain("Entregar documentación de procesos involucrados");
    expect(r).toHaveLength(4);
  });

  it("con las cinco ya cargadas no siembra nada", () => {
    const todas = tareasFijasDeSemanaCero([], []).map((t) => t.title);
    expect(tareasFijasDeSemanaCero([], todas)).toEqual([]);
  });
});

describe("⭐ y la ruta USA el helper — si no, el refactor es decorativo", () => {
  const RUTA = "app/api/clients/[id]/analyze/route.ts";
  const src = fs
    .readFileSync(path.join(process.cwd(), RUTA), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  it("lo llama", () => {
    expect(src).toContain("tareasFijasDeSemanaCero(");
  });

  it("⚠ y NO quedó una copia de la lista adentro de la ruta", () => {
    /* La regresión plausible: pegar de nuevo el array «por comodidad» y dejar el helper huérfano.
       Ahí vuelven a existir dos verdades y la que tiene tests deja de ser la que corre. */
    expect(src, "volvió una copia de la lista adentro de la ruta").not.toContain(
      "Proporcionar bases de datos a importar",
    );
    expect(src, "volvió la rama de tipo adentro de la ruta").not.toContain("esReimplementacion(tagsDelProyecto)");
  });
});
