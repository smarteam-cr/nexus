/**
 * lib/cobranza/guardar-y-generar.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/guardar-y-generar.test.ts --project unit`.
 *
 * El orden de los dos botones del formulario de servicio, que es donde se decide si lo que
 * se materializa es el plan que la persona acaba de escribir o el anterior.
 *
 * ── EL DEFECTO QUE CIERRA ───────────────────────────────────────────────────────
 * El botón de al lado de «Guardar servicio y plan» decía «Generar cobros» y generaba desde el
 * ÚLTIMO PLAN GUARDADO. El aviso vivía en un `title=` — un tooltip, que nadie lee. Editar las
 * cuotas y apretarlo sin guardar antes materializaba el plan viejo, en silencio y con toast
 * de éxito: exactamente el mismo desenlace que el bug que reportó Alexander, por otra puerta.
 *
 * Ahora guarda primero y genera después, en la misma acción.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM = readFileSync(join(__dirname, "..", "..", "components", "cobranza", "ServicioForm.tsx"), "utf8");
/**
 * El mismo archivo SIN comentarios. Hace falta porque el comentario que explica el defecto
 * cita el código defectuoso (`onClick={guardar}`), y una guarda que se matchea a sí misma no
 * guarda nada — falló en la primera corrida por eso.
 */
const CODIGO = FORM.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("los dos botones del formulario de servicio", () => {
  it("el segundo GUARDA y después genera — nunca genera solo", () => {
    expect(FORM).toMatch(/onClick=\{\(\) => guardar\(true\)\}/);
    expect(FORM, "el encadenado se rompió").toMatch(/if \(luegoGenerar\) onGenerar\?\.\(\)/);
  });

  it("y ese `onGenerar` va DESPUÉS del PUT del plan, no antes", () => {
    /* Si se moviera arriba del await del plan, generaría el plan anterior — que es el defecto
       original con otra forma. Se afirma por posición en el archivo. */
    const putDelPlan = FORM.indexOf("/plan`");
    const llamada = FORM.indexOf("if (luegoGenerar) onGenerar");
    expect(putDelPlan).toBeGreaterThan(-1);
    expect(llamada).toBeGreaterThan(putDelPlan);
  });

  it("⚠ el botón de guardar NO le pasa el evento del click a `guardar`", () => {
    /* `onClick={guardar}` le pasa el MouseEvent como primer argumento, y un evento es
       TRUTHY: el botón de guardar a secas habría generado los cobros también. Lo cazó tsc
       —es un error de tipos— pero el caso queda escrito porque el síntoma sería silencioso
       si algún día la firma dejara de ser tipada. */
    expect(CODIGO).not.toMatch(/onClick=\{guardar\}/);
    expect(FORM).toMatch(/onClick=\{\(\) => guardar\(\)\}/);
  });

  it("el rótulo dice las dos cosas que hace", () => {
    /* «Generar cobros» a secas, al lado de un botón de guardar, se lee como "y esto además
       genera lo que acabo de escribir". Decirlo entero es la mitad del arreglo. */
    expect(FORM).toContain("Guardar y generar cobros");
  });
});
