import { describe, expect, it } from "vitest";
import { nombreCortoDeLaTarea, recortarTitulo, tareaParaUnaPersona, tituloDelBloque, TOPE_DEL_TITULO_CORTO, TOPE_TOLERADO } from "./titulo-corto";
import { leerTitulosCortos, limpiarNombreCorto, pedidoDeTitulosCortos, HERRAMIENTA_DEL_TITULO_CORTO } from "./ia/titulo-corto";

describe("el nombre de una tarea fuera de Tareas (2026-10-20)", () => {
  it("el bloque dice el cliente, el nombre corto y que es tiempo interno, sin el T-n", () => {
    const t = { titulo: "Preparar y enviar a Marta la propuesta de integraciones", tituloCorto: "Enviar propuesta a Marta", empresa: "Cayalá" };
    expect(tituloDelBloque(t)).toBe("Cayalá – Enviar propuesta a Marta | Espacio interno");
    expect(tareaParaUnaPersona(t)).toBe("Cayalá – Enviar propuesta a Marta");
    expect(tituloDelBloque(t)).not.toMatch(/T-\d/);
  });

  it("sin cliente, el ámbito; sin ninguno, Smarteam", () => {
    expect(tareaParaUnaPersona({ titulo: "Revisar el plan", ambito: "SmartAgro" })).toBe("SmartAgro – Revisar el plan");
    expect(tareaParaUnaPersona({ titulo: "Revisar el plan" })).toBe("Smarteam – Revisar el plan");
  });

  it("sin nombre corto, recorta el título a seis palabras sin cortar una palabra ni dejar un signo colgando", () => {
    expect(nombreCortoDeLaTarea({ titulo: "Preparar y enviar a Marta la propuesta de integraciones" })).toBe("Preparar y enviar a Marta");
    // Nunca termina en una palabra que la deja colgando.
    expect(recortarTitulo("Recordarle a Heilyn y Alejandra que envíen el mapa")).toBe("Recordarle a Heilyn y Alejandra");
    expect(limpiarNombreCorto("Pedirle a Brenda Picado el reporte de matrículas del primer bimestre ya cerrado")).toBe("Pedirle a Brenda Picado el reporte de matrículas");
    expect(recortarTitulo("Llamar a Marco,")).toBe("Llamar a Marco");
    expect(recortarTitulo("Supercalifragilisticoespialidoso ".repeat(3)).length).toBeLessThanOrEqual(TOPE_DEL_TITULO_CORTO);
  });
});

describe("lo que escribe la IA", () => {
  const pedidas = [
    { id: "t1", titulo: "Preparar y enviar a Marta la propuesta", empresa: "Cayalá" },
    { id: "t2", titulo: "Revisar los flujos de leads de las cinco agencias", empresa: null },
  ];

  it("el pedido va con Haiku, la herramienta obligada y cada tarea con su id", () => {
    const p = pedidoDeTitulosCortos(pedidas);
    expect(p.model).toMatch(/haiku/);
    expect(p.tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DEL_TITULO_CORTO });
    const texto = JSON.stringify(p.messages);
    expect(texto).toContain("id: t1");
    expect(texto).toContain("cliente: Cayalá");
  });

  it("toma solo los ids pedidos, limpia comillas y punto final, y descarta lo vacío", () => {
    const respuesta = {
      stop_reason: "tool_use" as const,
      content: [
        {
          type: "tool_use" as const,
          id: "x",
          name: HERRAMIENTA_DEL_TITULO_CORTO,
          input: { nombres: [{ id: "t1", corto: "«Enviar propuesta a Marta.»" }, { id: "t2", corto: "  " }, { id: "otro", corto: "Algo" }] },
        },
      ],
    };
    const m = leerTitulosCortos(respuesta as never, pedidas);
    expect([...m.entries()]).toEqual([["t1", "Enviar propuesta a Marta"]]);
  });

  it("una respuesta cortada no escribe nada", () => {
    expect(leerTitulosCortos({ stop_reason: "max_tokens", content: [] } as never, pedidas).size).toBe(0);
  });

  it("un nombre largo se recorta sin cortar una palabra", () => {
    const largo = limpiarNombreCorto("Revisar con el equipo de marketing los flujos de leads de las cinco agencias externas");
    expect(largo).not.toBeNull();
    expect(largo!.length).toBeLessThanOrEqual(TOPE_TOLERADO);
  });
});
