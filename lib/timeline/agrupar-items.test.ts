/**
 * lib/timeline/agrupar-items.test.ts — LA LISTA SE LEE, O NO SIRVE.
 *
 * Correr: `npx vitest run lib/timeline/agrupar-items.test.ts --project unit`.
 *
 * El caso de la tabla es el REAL del 2026-08-20: Elías pidió unificar dos fases de Wherex y la
 * vista previa le devolvió veinte barras idénticas. La regla que se congela acá es que una
 * DECISIÓN (una fase que se va con sus 7 tareas) no puede verse igual que su ARITMÉTICA (una
 * tarea que pasa de la semana 2 a la 3).
 */
import { describe, it, expect } from "vitest";
import { agruparItems, resumenDeConsecuencias, GRUPO_GLOBAL } from "./agrupar-items";
import type { ItemDeAssist, ClaseDeItem } from "./assist-items";

const item = (
  clase: ClaseDeItem,
  fase: string,
  over: Partial<ItemDeAssist> = {},
): ItemDeAssist => ({
  key: `${clase}:${fase}:${over.titulo ?? Math.round(Math.abs(Math.sin(fase.length)) * 1e6)}`,
  clase,
  titulo: over.titulo ?? `cambio en ${fase}`,
  detalle: "",
  fase,
  pesado: false,
  soloSemana: false,
  ...over,
});

describe("la propuesta se agrupa por fase", () => {
  it("⭐ el caso real: 2 decisiones y 18 consecuencias dejan de ser 20 renglones iguales", () => {
    const items: ItemDeAssist[] = [
      item("fase-cambia", "Marketing Hub", { titulo: "Cambia la fase «Marketing Hub»" }),
      item("fase-se-va", "Configuración Marketing Hub", { titulo: "Elimina la fase", pesado: true }),
      ...Array.from({ length: 18 }, (_, i) =>
        item("tarea-cambia", i < 12 ? "Marketing Hub" : "Reportería y Data", {
          titulo: `tarea ${i}`,
          soloSemana: true,
        }),
      ),
    ];

    const grupos = agruparItems(items);
    expect(grupos.map((g) => g.fase)).toEqual([
      "Configuración Marketing Hub", // lo irreversible primero
      "Marketing Hub",
      "Reportería y Data", // solo consecuencias, al final
    ]);

    const mkt = grupos.find((g) => g.fase === "Marketing Hub")!;
    expect(mkt.decisiones).toHaveLength(1);
    expect(mkt.consecuencias).toHaveLength(12);
    expect(resumenDeConsecuencias(mkt)).toBe("12 tareas se corren de semana");

    const rep = grupos.find((g) => g.fase === "Reportería y Data")!;
    expect(rep.decisiones, "una fase que solo recibe corrimientos no tiene decisiones").toEqual([]);
    expect(rep.consecuencias).toHaveLength(6);
  });

  it("⛔ lo irreversible va primero: una fase que se va antes que una que cambia", () => {
    /* Es lo que el CSE tiene que mirar ANTES de apretar «Aplicar»: una fase que se va se lleva
       sus tareas. La edición que la pone en rojo: sacar el caso `fase-se-va` de `pesoDelGrupo`. */
    const grupos = agruparItems([
      item("fase-cambia", "B"),
      item("tarea-cambia", "C", { soloSemana: true }),
      item("fase-se-va", "A"),
    ]);
    expect(grupos.map((g) => g.fase)).toEqual(["A", "B", "C"]);
  });

  it("y lo que no es de ninguna fase va arriba de todo", () => {
    /* La fecha de arranque redefine TODAS las fechas: no es un cambio de una fase, es del
       cronograma entero, y verlo último sería verlo tarde. */
    const grupos = agruparItems([
      item("fase-se-va", "A"),
      item("ancla", "—", { titulo: "Cambia la fecha de arranque", pesado: true }),
    ]);
    expect(grupos[0].fase).toBe(GRUPO_GLOBAL);
    expect(grupos[0].decisiones).toHaveLength(1);
  });
});

describe("decisión y consecuencia no se confunden", () => {
  it("⛔ un título reescrito es una DECISIÓN, aunque sea de una tarea", () => {
    /* Es el caso que la revisión por ítem existe para atrapar: «pedí atrasar Setup y de paso me
       reescribió tres títulos». Si cayera en consecuencias quedaría plegado y se aplicaría sin
       que nadie lo lea. La edición que la pone en rojo: mandar todo `tarea-cambia` a plegado. */
    const grupos = agruparItems([
      item("tarea-cambia", "Setup", { titulo: "Cambia «A» → «B»", soloSemana: false }),
    ]);
    expect(grupos[0].decisiones).toHaveLength(1);
    expect(grupos[0].consecuencias).toEqual([]);
  });

  it("una tarea que se MUDA de fase es decisión, no corrimiento", () => {
    /* Mudar una tarea la RECREA: pierde su estado. Nunca puede quedar plegada. */
    const grupos = agruparItems([item("tarea-se-muda", "Setup")]);
    expect(grupos[0].decisiones).toHaveLength(1);
  });

  it("⚠ el grupo hereda el peso de sus ítems", () => {
    /* Si una tarea DONE se corre de semana, el grupo lo tiene que gritar aunque el ítem esté
       plegado — si no, plegarlo sería esconderlo. */
    const grupos = agruparItems([
      item("tarea-cambia", "Setup", { soloSemana: true, pesado: true }),
    ]);
    expect(grupos[0].pesado).toBe(true);
    expect(grupos[0].consecuencias).toHaveLength(1);
  });
});

describe("las claves del grupo sirven para resolver el bloque entero", () => {
  it("están TODAS, decisiones y consecuencias", () => {
    /* Es lo que permite un solo ✓/✗ por fase. Si faltara alguna, aceptar el grupo dejaría un
       ítem sin resolver y el usuario no tendría cómo verlo. */
    const items = [
      item("fase-cambia", "A", { titulo: "uno" }),
      item("tarea-cambia", "A", { titulo: "dos", soloSemana: true }),
    ];
    const g = agruparItems(items)[0];
    expect(g.claves).toEqual(items.map((i) => i.key));
  });

  it("sin ítems no hay grupos", () => {
    expect(agruparItems([])).toEqual([]);
  });
});
