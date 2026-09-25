import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MOTIVO_POR_VALIDAR_TIPICA,
  MOTIVO_POR_VALIDAR_TIPO_SIN_DEFINIR,
  motivoDePorValidar,
  tareasFijasDeSemanaCero,
  proyectoInvolucraHubSpot,
} from "./semana-cero-tareas";
import type { ComputedDetailTask } from "./compute-detail-tasks";

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

  it("⭐ el tooltip de «por validar» dice POR QUÉ: la de base de datos no es «la típica del tipo de fase»", () => {
    /* Revisión del paso D2 (2026-09-24): desde que la marca viaja hasta la tarea, el tooltip de la
       curación le decía a la de base de datos «La IA no la sacó del handoff…: es la típica de este
       tipo de fase». No la puso la IA: la puso este archivo, porque falta el tipo del proyecto.
       La edición que la pone en rojo: volver a un tooltip fijo en el panel, o que la fija deje de
       traer su motivo.
       Actualizado en la revisión del 2026-09-24: el motivo se deducía del TÍTULO, y la IA puede
       proponer ella misma una tarea con el título de cualquiera de las dos caras marcada porValidar
       (el dedup no agrega entonces la fija). El tooltip le decía «el proyecto no dice si es
       implementación o re-implementación… desde cero»: falso con el tipo definido, y siempre falso
       para la de la base existente. Ahora el motivo viaja EN la tarea; las aserciones por título
       pasaron a ser por tarea, y el panel pasa la tarea entera. */
    const bd = tareasFijasDeSemanaCero(HUB, []).find((t) => t.needsValidation)!;
    expect(bd.motivoPorValidar).toBe(MOTIVO_POR_VALIDAR_TIPO_SIN_DEFINIR);
    expect(motivoDePorValidar(bd)).toBe(MOTIVO_POR_VALIDAR_TIPO_SIN_DEFINIR);
    expect(motivoDePorValidar(bd)).toContain("implementación o re-implementación");
    expect(motivoDePorValidar({ motivoPorValidar: null })).toBe(MOTIVO_POR_VALIDAR_TIPICA);
    expect(MOTIVO_POR_VALIDAR_TIPICA).toContain("es la típica de este tipo de fase");
    // Las que no están por validar no traen motivo, tampoco la de base de datos con el tipo definido.
    expect(tareasFijasDeSemanaCero(HUB, []).filter((t) => t.motivoPorValidar !== null)).toEqual([bd]);
    expect(tareasFijasDeSemanaCero(["implementacion"], []).every((t) => t.motivoPorValidar === null)).toBe(true);

    /* ⚠ REAPUNTADA en E2b P5b (2026-09-25), con esta razón: miraba el panel de dos columnas
       (PhaseRegenPanel.tsx), que se borró. La tarea de la propuesta lleva su motivo en el borrador y
       `resumir` (lib/timeline/borrador.ts) lo pregunta con `motivoDePorValidar` para el renglón, que
       lo muestra en el chip «por validar» de TareasDeLaPropuesta.tsx. La edición que la pone en rojo:
       volver a un tooltip fijo, o que el renglón deje de preguntar el motivo de SU tarea. */
    const borrador = fs.readFileSync(path.join(process.cwd(), "lib/timeline/borrador.ts"), "utf8");
    expect(borrador, "el renglón dejó de preguntar el motivo de su tarea").toContain(
      "porValidar: motivoDePorValidar(c.tarea)",
    );
    const renglon = fs
      .readFileSync(path.join(process.cwd(), "components/canvas/TareasDeLaPropuesta.tsx"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(renglon, "el chip «por validar» dejó de decir el motivo").toContain("title={t.porValidar}");
    expect(renglon, "volvió el tooltip fijo de «la típica»").not.toContain('title="La IA no la sacó del handoff');
  });

  it("⚠ la tarea que la IA propone CON EL TÍTULO de la de base de datos dice el motivo de la típica", () => {
    /* Revisión del 2026-09-24. El caso: el detalle propone «Proporcionar bases de datos a importar»
       (o la de la base existente) marcada porValidar en un proyecto con el tipo definido. El dedup
       ve el título y no agrega la fija, así que la que llega a la curación es la de la IA, sin
       motivo propio. Decirle «el proyecto no dice si es implementación o re-implementación» es
       falso. La edición que la pone en rojo: volver a deducir el motivo del título. */
    for (const titulo of [DESDE_CERO, EXISTENTE, `  ${EXISTENTE.toUpperCase()} `]) {
      // Como sale del parser del detalle: sin motivo propio.
      const deLaIA: Pick<ComputedDetailTask, "title" | "needsValidation" | "motivoPorValidar"> = {
        title: titulo,
        needsValidation: true,
      };
      expect(motivoDePorValidar(deLaIA), titulo).toBe(MOTIVO_POR_VALIDAR_TIPICA);
    }
    expect(tareasFijasDeSemanaCero(["implementacion"], [DESDE_CERO]), "la fija no se duplica").toHaveLength(4);
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

describe("⭐ y el detalle USA el helper — si no, el refactor es decorativo", () => {
  const leerCodigo = (rel: string) =>
    fs
      .readFileSync(path.join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
  const RUTA = "app/api/clients/[id]/analyze/route.ts";
  const src = leerCodigo(RUTA);
  /* ⚠ REAPUNTADA en E2b P5a (2026-09-25), con esta razón: pedía que analyze llamara al helper. Lo
     llamaban solo sus dos vistas previas, que se borraron. Las fijas de la Semana 0 las siembra el
     borrador del detalle (R7 de lib/timeline/tareas-del-detalle.ts), el único camino de las dos puertas
     y de «Regenerar» de una fase. La edición que la pone en rojo: dejar de llamarlo ahí. */
  const DETALLE = "lib/timeline/tareas-del-detalle.ts";
  const detalle = leerCodigo(DETALLE);

  it("lo llama", () => {
    expect(detalle).toContain("tareasFijasDeSemanaCero(");
  });

  it("⚠ y NO quedó una copia de la lista adentro de la ruta", () => {
    /* La regresión plausible: pegar de nuevo el array «por comodidad» y dejar el helper huérfano.
       Ahí vuelven a existir dos verdades y la que tiene tests deja de ser la que corre. */
    for (const [rel, codigo] of [
      [RUTA, src],
      [DETALLE, detalle],
    ]) {
      expect(codigo, `volvió una copia de la lista en ${rel}`).not.toContain("Proporcionar bases de datos a importar");
      expect(codigo, `volvió la rama de tipo en ${rel}`).not.toContain("esReimplementacion(tagsDelProyecto)");
    }
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
