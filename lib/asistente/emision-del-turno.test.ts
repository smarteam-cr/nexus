/**
 * lib/asistente/emision-del-turno.test.ts — QUE EL CHAT NO PROMETA UN CAMBIO Y NO LO REGISTRE.
 *
 * ⚠ La guarda que FALTABA, y que habría cazado la clase entera: no había ni un test que ejerciera
 * «el modelo contesta con prosa y sin herramienta». `turno.test.ts` tiene 656 líneas y ninguna
 * cubre ese turno, porque el loop vive dentro de una función que llama a Anthropic y lo único que
 * se podía afirmar eran escaneos de fuente — que sobreviven a cualquier reescritura que conserve
 * la cadena de texto. Estas dos decisiones son puras, así que se prueban de verdad.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { RAIZ } from "@/lib/ui/scan-source";
import { decidirReintento, avisoDeTurnoSinAcuerdo, reclamoDeOmision } from "./emision-del-turno";

const TURNO = fs.readFileSync(path.join(RAIZ, "lib/asistente/turno.ts"), "utf8");
const RAMA = TURNO.slice(
  TURNO.indexOf("if (!esCronograma) {"),
  TURNO.indexOf("} else {", TURNO.indexOf("if (!esCronograma) {")),
);

const turno = (o: Partial<Parameters<typeof decidirReintento>[0]> = {}) => ({
  rechazadas: 0,
  huboTool: true,
  opsUtilizables: 0,
  preguntaAbierta: false,
  ...o,
});

describe("⭐ el reintento deja de ser ciego a la OMISIÓN", () => {
  it("el caso de Elías: llamó la herramienta, no emitió nada, y no preguntó nada", () => {
    /* «Agrego dos objetivos nuevos: la transición desde Pardot y la capacitación del equipo» — y
       ninguna operación. Antes de este arreglo el turno cerraba acá, mudo. */
    expect(decidirReintento(turno())).toBe("por-omision");
  });

  it("y también cuando NI SIQUIERA llamó la herramienta: prosa pura", () => {
    /* Los dos caminos son indistinguibles desde el código y producen la misma pantalla, así que
       los dos tienen que disparar. */
    expect(decidirReintento(turno({ huboTool: false }))).toBe("por-omision");
  });

  it("el error de NOMBRES sigue teniendo prioridad: corregirlos salva más turnos", () => {
    expect(decidirReintento(turno({ rechazadas: 2, opsUtilizables: 0 }))).toBe("por-rechazo");
  });

  it("con operaciones aceptadas no se reintenta nada", () => {
    expect(decidirReintento(turno({ opsUtilizables: 2 }))).toBe("no");
  });

  it("⛔ NO se reintenta cuando el modelo dejó una PREGUNTA abierta", () => {
    /* Preguntar con cero operaciones es legítimo: el pedido era ambiguo y el prompt le pide
       preguntar. Empujarlo ahí sería empujarlo a INVENTAR justo donde tuvo razón en no hacerlo —
       el mismo motivo por el que `tool_choice` está descartado. */
    expect(decidirReintento(turno({ preguntaAbierta: true }))).toBe("no");
    expect(decidirReintento(turno({ preguntaAbierta: true, huboTool: false }))).toBe("no");
  });

  it("⛔ tampoco cuando el turno YA tiene algo que ofrecer del libro de pendientes", () => {
    /* Si algo sigue acordado y sin aplicar, la cajita se va a pintar igual: el turno no está mudo,
       y gastar una llamada para agregarle un renglón no es lo que este arreglo persigue. */
    expect(decidirReintento(turno({ opsUtilizables: 1 }))).toBe("no");
  });

  it("el reclamo le deja la SALIDA de no emitir, en los dos textos", () => {
    /* Sin esa salida el reintento es `tool_choice` con otro nombre: forzaría la herramienta en los
       tres casos donde el prompt le prohíbe emitirla. */
    for (const huboTool of [true, false]) {
      const r = reclamoDeOmision(huboTool);
      expect(r.length).toBeGreaterThan(120);
      expect(r, `el reclamo con huboTool=${huboTool} no deja salir sin emitir`).toMatch(
        /no corresponde|contesta en texto|contesta igual en texto/,
      );
    }
    /* Y son textos DISTINTOS: llamar la herramienta vacía es una contradicción con su propia
       llamada; no llamarla puede ser correcto. */
    expect(reclamoDeOmision(true)).not.toBe(reclamoDeOmision(false));
  });
});

describe("⭐ un turno mudo deja de ser mudo", () => {
  it("llamó la herramienta y no quedó nada: se dice", () => {
    const a = avisoDeTurnoSinAcuerdo({ hayAcuerdo: false, huboTool: true, seReintentoPorOmision: false });
    expect(a).toContain("No dejé registrado ningún cambio");
  });

  it("se le reclamó por omisión y siguió sin emitir: se dice", () => {
    const a = avisoDeTurnoSinAcuerdo({ hayAcuerdo: false, huboTool: false, seReintentoPorOmision: true });
    expect(a).toBeTruthy();
  });

  it("⛔ pero se CALLA en un turno legítimo sin herramienta ni reclamo", () => {
    /* «eso no se toca desde acá», «esto es lo que puedo hacer». Meterle un ⚠ a cada uno enseñaría
       a ignorar el ⚠, que es exactamente cómo muere una alerta. */
    expect(avisoDeTurnoSinAcuerdo({ hayAcuerdo: false, huboTool: false, seReintentoPorOmision: false })).toBeNull();
  });

  it("y se calla siempre que HAY acuerdo", () => {
    expect(avisoDeTurnoSinAcuerdo({ hayAcuerdo: true, huboTool: true, seReintentoPorOmision: true })).toBeNull();
  });

  it("⚠ el aviso está en tuteo neutro: se persiste en el hilo y el modelo lo relee", () => {
    const a = avisoDeTurnoSinAcuerdo({ hayAcuerdo: false, huboTool: true, seReintentoPorOmision: false }) ?? "";
    expect(a).not.toMatch(/\b(pedime|decime|podés|tenés|querés|dale)\b/i);
  });
});

describe("las dos decisiones están CABLEADAS, no solo escritas", () => {
  it("la rama de documentos usa las dos funciones puras", () => {
    expect(RAMA.length, "la guarda no está mirando nada").toBeGreaterThan(500);
    expect(RAMA, "el reintento dejó de consultar la decisión pura").toContain("decidirReintento({");
    expect(RAMA, "el turno mudo volvió a no decir nada").toContain("avisoDeTurnoSinAcuerdo({");
  });

  it("⛔ sigue habiendo UN SOLO reintento: lo que se ensanchó es el disparador", () => {
    /* Un loop sin corte no falla: encadena llamadas que nadie ve hasta que aparecen en la factura.
       La edición que la pone en rojo: un segundo `preguntarleAlModelo` para el caso nuevo. */
    expect((RAMA.match(/await preguntarleAlModelo\(/g) ?? []).length).toBe(1);
  });

  it("⭐ el acuerdo lo deciden las OPERACIONES, no el texto que las acompaña", () => {
    /* El gate exigía `resumenDelModelo` además de las operaciones: un turno con operaciones
       VÁLIDAS y el resumen vacío las tiraba en silencio. El cronograma ya tenía el paracaídas. */
    expect(RAMA, "volvió a exigir el resumen para armar el acuerdo").not.toContain(
      "if (resumenDelModelo && opsDeDoc.length > 0)",
    );
    expect(RAMA).toContain("resumen: resumenDelModelo || RESUMEN_DE_ARRASTRE");
  });

  it("⛔ el turno mudo deja RASTRO en el servidor", () => {
    /* Sin log, «el modelo no emitió» es infalsificable: se discute con hipótesis en vez de con el
       dato. Pasó exactamente eso el 2026-08-23. */
    expect(RAMA).toMatch(/console\.warn\(/);
    expect(RAMA).toContain("turno sin acuerdo");
  });

  it("lo que se cayó solo VIAJA también en el acuerdo de documentos", () => {
    /* La rama de documentos lo calculaba y lo tiraba, mientras la cajita vieja seguía rotulada
       «sigue abajo, en la propuesta vigente» sobre cambios que ya no viajaban. */
    expect(RAMA).toContain("descartadas: soltadas");
  });

  it("⛔ `leerElTurno` no deja estado del intento anterior", () => {
    /* Reseteaba solo `respuesta` e `idDeLaHerramienta`: el intento 2 heredaba el resumen y las
       operaciones del 1, así que un segundo intento en texto armaba un acuerdo con las
       operaciones VIEJAS. Con el reintento por omisión eso pasaría a ser el camino normal. */
    const leer = TURNO.slice(TURNO.indexOf("const leerElTurno ="), TURNO.indexOf("leerElTurno(msg);"));
    expect(leer.length).toBeGreaterThan(300);
    for (const campo of ["resumenDelModelo", "opsNuevas", "descartar", "preguntaAbierta", "instruccionDelModelo"]) {
      expect(leer, `\`${campo}\` sobrevive al reintento`).toMatch(
        new RegExp(`${campo} = (""|\\[\\]|false);`),
      );
    }
  });
});
