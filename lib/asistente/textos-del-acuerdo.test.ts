/**
 * lib/asistente/textos-del-acuerdo.test.ts — LO QUE DICEN EL BOTÓN, LA ESPERA Y EL DESENLACE DE UN
 * ACUERDO SOBRE LA PROPUESTA (E3 P5).
 *
 * Correr: `npx vitest run lib/asistente/textos-del-acuerdo.test.ts --project unit`.
 *
 * Con una propuesta abierta, lo acordado va a la PROPUESTA (o la aplica entera, o la descarta): «Aplicar
 * al cronograma» y «el cronograma ya quedó actualizado» mentirían. Sin propuesta, todo sigue como antes.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import {
  claseDeAcuerdo,
  destinoDelAcuerdo,
  rotuloDelAcuerdoAplicado,
  textoDelAcuerdoAplicado,
  textoDelBoton,
  textoDelDesenlaceDeLaPropuesta,
  textoMientrasAplica,
} from "./textos-del-acuerdo";

const pasar = { borrador: "run-4", operaciones: [{ op: "propuesta.dejar-como-estaba", claves: ["n:1"] }, { op: "fase.duracion" }] };
const aplicar = { borrador: "run-4", operaciones: [{ op: "propuesta.aplicar", version: 3, huella: "h" }] };
const descartar = { borrador: "run-4", operaciones: [{ op: "propuesta.descartar-entera" }] };
const deHoy = { borrador: null, operaciones: [{ op: "fase.duracion" }] };
const viejo = { operaciones: [{ op: "fase.duracion" }] };

describe("⭐ qué hace el botón", () => {
  it("por el acuerdo: pasar, aplicar o descartar; sin propuesta, ninguno de los tres", () => {
    /* La edición que la pone en rojo: tratar un acuerdo sin `borrador` (o con null) como de la propuesta,
       o tomar «aplicar» mezclado como «aplicar». */
    expect(claseDeAcuerdo(pasar)).toBe("pasar");
    expect(claseDeAcuerdo(aplicar)).toBe("aplicar");
    expect(claseDeAcuerdo(descartar)).toBe("descartar");
    expect(claseDeAcuerdo(deHoy)).toBeNull();
    expect(claseDeAcuerdo(viejo)).toBeNull();
    expect(claseDeAcuerdo({ borrador: "run-4", operaciones: [...aplicar.operaciones, { op: "fase.duracion" }] })).toBe("pasar");
  });

  it("los textos, cortos y en tuteo; sin propuesta, null (el cajón usa los de siempre)", () => {
    expect(textoDelBoton(pasar, 2)).toBe("Pasar a la propuesta (2)");
    expect(textoDelBoton(aplicar, 1)).toBe("Aplicar la propuesta al cronograma");
    expect(textoDelBoton(descartar, 1)).toBe("Descartar la propuesta");
    expect(textoMientrasAplica(pasar)).toBe("Pasando a la propuesta…");
    expect(textoMientrasAplica(aplicar)).toBe("Aplicando la propuesta…");
    expect(textoMientrasAplica(descartar)).toBe("Descartando la propuesta…");
    expect(textoDelAcuerdoAplicado(pasar)).toBe("Pasado a la propuesta. ¿Algo más, o la aplicas?");
    expect(textoDelAcuerdoAplicado(aplicar)).toBe("Propuesta aplicada al cronograma.");
    expect(textoDelAcuerdoAplicado(descartar)).toBe("Propuesta descartada.");
    for (const a of [deHoy, viejo]) {
      expect(textoDelBoton(a, 1)).toBeNull();
      expect(textoMientrasAplica(a)).toBeNull();
      expect(textoDelAcuerdoAplicado(a)).toBeNull();
      expect(rotuloDelAcuerdoAplicado(a)).toBeNull();
      expect(destinoDelAcuerdo(a)).toBeNull();
    }
    expect([destinoDelAcuerdo(pasar), destinoDelAcuerdo(aplicar), destinoDelAcuerdo(descartar)]).toEqual([
      "propuesta",
      "cronograma",
      "descarte",
    ]);
  });
});

describe("⭐ el desenlace dice a dónde fue", () => {
  it("a la propuesta, con o sin detalle; el descarte; y el cronograma queda como antes", () => {
    /* La edición que la pone en rojo: escribir «el cronograma ya quedó actualizado» sobre algo que pasó a
       la propuesta (el CSE lo repetiría al cliente). */
    expect(textoDelDesenlaceDeLaPropuesta("propuesta", "")).toBe(
      "✅ Listo, quedó en la propuesta (arriba del Gantt). El cronograma no cambia hasta que la apliques.",
    );
    expect(textoDelDesenlaceDeLaPropuesta("propuesta", "Dejé lo que editaste a mano")).toBe(
      "⚠ Pasó a la propuesta, pero con una parte hice algo distinto:\n\nDejé lo que editaste a mano\n\nRevísala arriba del Gantt.",
    );
    expect(textoDelDesenlaceDeLaPropuesta("descarte", "")).toBe(
      "✅ Listo, se descartó la propuesta: el cronograma queda como estaba.",
    );
    expect(textoDelDesenlaceDeLaPropuesta("cronograma", "")).toBeNull();
    expect(textoDelDesenlaceDeLaPropuesta(undefined, "")).toBeNull();
  });

  it("⛔ el manejador acepta `destino`, lo usa, y sin él deduce como antes", () => {
    /* La edición que la pone en rojo: no aceptar el campo (el zod lo rechaza y el desenlace no se escribe),
       o dejar la vista previa en true con un destino (mandaría a «aceptar los cambios» que no existen). */
    const handler = fs.readFileSync(path.join(RAIZ, "lib/asistente/handler.ts"), "utf8");
    expect(handler).toContain('destino: z.enum(["cronograma", "propuesta", "descarte"]).optional(),');
    expect(handler).toContain("const vistaPrevia = destino ? false : (parsed.data.desenlace.vistaPrevia ?? true);");
    expect(handler).toContain("const deLaPropuesta = ok ? textoDelDesenlaceDeLaPropuesta(destino, detalle) : null;");
  });
});
