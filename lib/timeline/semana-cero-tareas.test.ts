import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tareasFijasDeSemanaCero, proyectoInvolucraHubSpot } from "./semana-cero-tareas";

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
 *
 * ⚠ Desde 2026-08-17 NO aplican siempre: son de una implementación de HubSpot, y se sembraban en
 * todo cronograma nuevo. Por eso casi todos los casos de acá pasan `HUB` en vez de `[]` — sin
 * señal de HubSpot el resultado correcto es CERO tareas, y eso tiene su propio bloque abajo.
 */

const HUB = ["sales_hub"]; // señal de HubSpot SIN punto de partida definido
const DESDE_CERO = "Proporcionar bases de datos a importar";
const EXISTENTE = "Revisar y limpiar la base de datos existente";

describe("las cinco de siempre", () => {
  it("sin nada cargado, se siembran las cinco", () => {
    const r = tareasFijasDeSemanaCero(HUB, []);
    expect(r).toHaveLength(5);
    expect(r.every((t) => t.weekIndex === 0)).toBe(true);
    expect(r.every((t) => t.type === "TASK")).toBe(true);
  });

  it("el orden arranca donde se le diga, para no pisar lo que propuso el agente", () => {
    const r = tareasFijasDeSemanaCero(HUB, [], 7);
    expect(r.map((t) => t.order)).toEqual([7, 8, 9, 10, 11]);
  });

  it("y los responsables no son todos del cliente", () => {
    /* La de HubSpot Academy la hace Smarteam. Si todas salieran party=CLIENTE, la Semana 0 se
       leería como una lista de deberes del cliente, que es exactamente lo que no es. */
    const r = tareasFijasDeSemanaCero(HUB, []);
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
    const r = tareasFijasDeSemanaCero(HUB, []);
    const bd = r.find((t) => t.title === DESDE_CERO);
    expect(bd, "sin tipo definido dejó de sembrarse la tarea de base de datos").toBeDefined();
    expect(bd?.needsValidation, "se sembró como hecho, sin marcar que nadie lo respondió").toBe(true);
  });

  it("⚠ y con el tipo definido NO se marca", () => {
    expect(tareasFijasDeSemanaCero(["implementacion"], []).find((t) => t.title === DESDE_CERO)?.needsValidation).toBe(false);
    expect(tareasFijasDeSemanaCero(["reimplementacion"], []).find((t) => t.title === EXISTENTE)?.needsValidation).toBe(false);
  });

  it("las demás nunca nacen por validar", () => {
    const r = tareasFijasDeSemanaCero(HUB, []);
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
    const r = tareasFijasDeSemanaCero(HUB, ["  ENTREGAR DOCUMENTACIÓN DE PROCESOS INVOLUCRADOS  "]);
    expect(r.map((t) => t.title)).not.toContain("Entregar documentación de procesos involucrados");
    expect(r).toHaveLength(4);
  });

  it("con las cinco ya cargadas no siembra nada", () => {
    const todas = tareasFijasDeSemanaCero(HUB, []).map((t) => t.title);
    expect(tareasFijasDeSemanaCero(HUB, todas)).toEqual([]);
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

describe("⛔ y NO aplican a cualquier proyecto (decisión de negocio, 2026-08-17)", () => {
  /* Las cinco son de una implementación de HubSpot: el portal, los usuarios del CRM, la lista de
     HubSpot Academy. Se sembraban en TODO cronograma nuevo, así que un proyecto que no toca
     HubSpot arrancaba pidiéndole al cliente accesos a un producto que no compró — y la Semana 0 la
     lee el cliente. Medido contra producción el 2026-08-17: de 132 proyectos activos, **85 no
     tienen ninguna señal de HubSpot** en sus tags. */

  it("⭐ sin ninguna señal de HubSpot en los tags, no se siembra nada", () => {
    expect(tareasFijasDeSemanaCero([], [])).toEqual([]);
    expect(tareasFijasDeSemanaCero(["custom_dev"], [])).toEqual([]);
    expect(tareasFijasDeSemanaCero(["sitio_web", "recurrente"], [])).toEqual([]);
  });

  it("alcanza con un hub…", () => {
    for (const hub of ["marketing_hub", "sales_hub", "service_hub", "content_hub", "data_hub", "revenue_hub"]) {
      expect(tareasFijasDeSemanaCero([hub], []).length, `${hub} no alcanzó como señal`).toBe(5);
    }
  });

  it("…o con el punto de partida, aunque no haya hub", () => {
    /* Un proyecto puede estar clasificado como implementación antes de que se sepa qué hubs entran.
       Ahí las tareas aplican igual: el trabajo ES sobre HubSpot. */
    expect(tareasFijasDeSemanaCero(["implementacion"], []).length).toBe(5);
    expect(tareasFijasDeSemanaCero(["reimplementacion"], []).length).toBe(5);
  });

  it("⚠ y una integración CON HubSpot las recibe, aunque la ejecute Desarrollo", () => {
    /* El caso real medido: SAP ↔ HubSpot, Odoo ↔ HubSpot, EnKontrol ↔ HubSpot. La decisión NO se
       toma por pipeline: el pipeline dice QUIÉN lo ejecuta, los tags dicen QUÉ producto toca. Para
       una integración con HubSpot, pedir el acceso al portal es exactamente lo correcto. */
    expect(tareasFijasDeSemanaCero(["custom_dev", "data_hub", "implementacion"], []).length).toBe(5);
  });

  it("el helper del gate se puede preguntar solo", () => {
    expect(proyectoInvolucraHubSpot(["sales_hub"])).toBe(true);
    expect(proyectoInvolucraHubSpot(["implementacion"])).toBe(true);
    expect(proyectoInvolucraHubSpot(["reimplementacion"])).toBe(true);
    expect(proyectoInvolucraHubSpot([])).toBe(false);
    expect(proyectoInvolucraHubSpot(["custom_dev", "sitio_web", "recurrente"])).toBe(false);
    expect(proyectoInvolucraHubSpot(["insider_one"]), "Insider One es app propia, no es HubSpot").toBe(false);
  });
});
