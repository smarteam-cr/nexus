/**
 * lib/asistente/turno.test.ts — UNA SOLA HERRAMIENTA, Y NO ESCRIBE.
 *
 * Correr: `npx vitest run lib/asistente/turno.test.ts --project unit`.
 *
 * ── LA GUARDA QUE IMPORTA ────────────────────────────────────────────────────────────────────
 * El chat le da al modelo UNA herramienta: `registrar_cambio_acordado`, que **emite texto**. La
 * tentación —nombrada en el plan como «lo que NO se hace»— es darle un catálogo: `aplicar_cambio`,
 * `mover_tarea`, `crear_fase`. Cada tool que escribe es una puerta nueva que saltea la vista
 * previa y la aceptación por ítem, y que corre con el permiso del chat en vez del permiso del
 * documento. Es el modo de falla de `artifact-gate` multiplicado, y no falla ruidoso: funciona.
 *
 * Por eso el test no dice «la tool no debería escribir» (eso no se puede afirmar sobre un string):
 * dice **cuántas tools hay**. Agregar la segunda es el diff que hay que leer.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { leerAcuerdo, marcaDeAcuerdo, MODELO_DEL_ASISTENTE, MARCA_DE_ACUERDO } from "./turno";

const FUENTE = fs.readFileSync(path.join(RAIZ, "lib/asistente/turno.ts"), "utf8");

describe("el asistente tiene UNA herramienta y no escribe", () => {
  it("⛔ el pedido declara exactamente una tool", () => {
    /* La edición que la pone en rojo: `tools: [TOOL_ACUERDO, TOOL_APLICAR]`. */
    const m = FUENTE.match(/tools:\s*\[([^\]]*)\]/);
    expect(m, "desapareció el arreglo de tools del pedido").not.toBeNull();
    const declaradas = m![1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(
      declaradas,
      "El asistente declaró más de una herramienta. Cada tool extra es una puerta que saltea la " +
        "vista previa y la aceptación por ítem, y que corre con el permiso del chat en vez del " +
        "permiso del documento. La única tool emite TEXTO; aplicar es otro acto, con otro botón.",
    ).toEqual(["TOOL_ACUERDO"]);
  });

  it("⛔ y esa tool solo pide texto: nada que parezca un id para escribir", () => {
    /* Una tool que recibiera `taskId`/`phaseId` ya no sería «registrar lo acordado»: sería la
       primera mitad de un escritor. La edición que la pone en rojo: sumarle `phaseId` al schema. */
    const i = FUENTE.indexOf("const TOOL_ACUERDO");
    const bloque = FUENTE.slice(i, FUENTE.indexOf("};", i));
    for (const sospechoso of ["Id:", "ids:", "phaseId", "taskId", "canvasId", "sectionId"]) {
      expect(
        bloque.includes(sospechoso),
        `la tool del acuerdo pide "${sospechoso}": eso ya no es registrar, es apuntar a qué escribir`,
      ).toBe(false);
    }
  });

  it("y el prompt le prohíbe decir que aplicó algo", () => {
    /* El daño de que lo diga no es cosmético: el CSE cierra la pantalla creyendo que el cambio
       está hecho. La edición que la pone en rojo: sacar esa línea del prompt. */
    expect(FUENTE).toContain("VOS NO APLICÁS NADA");
  });
});

describe("la regla de las fechas está en el prompt", () => {
  it("⭐ toda propuesta que mueva el cierre lo dice — y si no lo mueve, también", () => {
    /* Decisión de Elías. El silencio se lee como «no cambió nada», y así es como alguien se
       entera tres semanas después. La edición que la pone en rojo: borrar el bloque de fechas. */
    expect(FUENTE).toContain("LAS FECHAS SE DICEN SIEMPRE");
    expect(
      FUENTE.includes("el cierre no se corre"),
      "se perdió la mitad de la regla: avisar también cuando la fecha NO se mueve",
    ).toBe(true);
  });
});

describe("el breakpoint de caché está donde cachea", () => {
  it("⚠ va en el bloque de CONTEXTO, nunca en el prompt solo", () => {
    /* Medido el 2026-08-19: el prompt solo son ~700 tokens y cae bajo el mínimo cacheable de
       Sonnet 5 (1.024). Marcarlo ahí sería una escritura de caché PAGADA que nunca se lee — sin
       error y sin log. Juntos llegan a ~1.700 y sí cachean.
       La edición que la pone en rojo: mover el `cache_control` al primer bloque del system. */
    const i = FUENTE.indexOf("system: [");
    const bloque = FUENTE.slice(i, FUENTE.indexOf("tools:", i));
    const posPrompt = bloque.indexOf("promptDelAsistente()");
    const posContexto = bloque.indexOf("ctx.texto");
    const posCache = bloque.indexOf("cache_control");
    expect(posPrompt, "el prompt salió del system").toBeGreaterThan(-1);
    expect(posContexto, "el contexto salió del system").toBeGreaterThan(-1);
    expect(
      posCache > posContexto && posContexto > posPrompt,
      "el breakpoint de caché quedó antes del contexto: a ese tamaño no cachea y se paga igual",
    ).toBe(true);
    expect(
      (bloque.match(/cache_control/g) ?? []).length,
      "hay más de un breakpoint: cada uno es una escritura de caché que se paga",
    ).toBe(1);
  });

  it("⚠ el modelo es el que se midió, no el que suena barato", () => {
    /* Haiku 4.5 exige 4.096 tokens para cachear —el mínimo más alto de la familia— así que a este
       tamaño de prompt NO cachea nunca y paga el prefijo entero en cada turno. Cambiar esta
       constante no es cambiar una constante: hay que volver a medir. */
    expect(MODELO_DEL_ASISTENTE).toBe("claude-sonnet-5");
    expect(FUENTE).toContain("4.096");
  });
});

describe("el acuerdo sobrevive a recargar la pantalla", () => {
  const acuerdo = {
    resumen: "Alargar Setup una semana; el cierre pasa del 8 sep al 15 sep.",
    instruccion: "Alarga la fase «Semana 0» de 1 a 2 semanas.",
  };

  it("va y vuelve entero", () => {
    const contenido = `Listo, te lo dejo armado.\n\n${marcaDeAcuerdo(acuerdo)}`;
    const leido = leerAcuerdo(contenido);
    expect(leido.acuerdo).toEqual(acuerdo);
    expect(leido.texto).toBe("Listo, te lo dejo armado.");
  });

  it("un turno sin acuerdo se lee tal cual", () => {
    expect(leerAcuerdo("¿Querés que alargue Setup o que mueva la tarea?")).toEqual({
      texto: "¿Querés que alargue Setup o que mueva la tarea?",
      acuerdo: null,
    });
  });

  it("⚠ una marca truncada pierde el botón, NUNCA la conversación", () => {
    /* El modo de falla que importa: si el JSON quedó a medias, mostrar el texto igual. Perder la
       respuesta del asistente por un botón que no se pudo pintar sería el peor canje posible. */
    const roto = `Te lo dejo armado.\n\n${MARCA_DE_ACUERDO}{"resumen":"a medi`;
    const leido = leerAcuerdo(roto);
    expect(leido.acuerdo).toBeNull();
    expect(leido.texto).toBe("Te lo dejo armado.");
  });

  it("y un acuerdo sin instrucción no pinta botón", () => {
    /* Un «Aplicar» que no puede hacer nada es peor que no ofrecerlo. */
    const contenido = `ok\n\n${MARCA_DE_ACUERDO}${JSON.stringify({ resumen: "algo" })}`;
    expect(leerAcuerdo(contenido).acuerdo).toBeNull();
  });
});
