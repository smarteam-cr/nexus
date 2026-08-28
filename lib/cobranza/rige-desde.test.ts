/**
 * lib/cobranza/rige-desde.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/rige-desde.test.ts --project unit`.
 *
 * ── EL DEFECTO QUE ESTA GUARDA EXISTE PARA QUE NO VUELVA ────────────────────────
 * `fechaEfectiva` estuvo en el schema y en la mutación desde el arranque de la fase 4.5.
 * `updateCosto` la respetaba. **El formulario nunca la mandaba.** Nadie se dio cuenta, porque
 * el efecto no es un error: es que todo cambio de monto queda fechado el día en que alguien
 * lo tecleó, y eso se ve exactamente igual que estar bien.
 *
 * Lo que costó: el único aumento del sistema con fecha declarada —Alejandra, efectiva 31-ago,
 * anotada el 18— hubo que meterlo con un script (`script:corregir-nomina-2026-08`). Los dos
 * cambios hechos desde la pantalla el 27-ago quedaron los dos fechados el 27-ago. Un aumento
 * que arranca el 1 de setiembre, anotado hoy, le sube el costo a agosto entero — y ese número
 * sostiene el punto de equilibrio.
 *
 * Es el modo de falla de siempre en esta app: la capacidad EXISTE y falta declararla. Por eso
 * la guarda no mira que el campo compile —compilaba— sino que el formulario lo MANDE.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const FORM = leer("components/cobranza/CostoForm.tsx");
const PANEL = leer("components/cobranza/CostosPanel.tsx");
const SCHEMA = leer("lib/cobranza/schema.ts");
const MUTACIONES = leer("lib/cobranza/mutations.ts");

describe("la cadena entera de «Rige desde», eslabón por eslabón", () => {
  it("el formulario tiene el campo", () => {
    expect(FORM).toContain("Rige desde");
    expect(FORM).toMatch(/type="date"[\s\S]{0,120}value=\{rigeDesde\}/);
  });

  it("⚠ y lo MANDA — este es el eslabón que faltaba y no rompía nada al faltar", () => {
    expect(FORM, "sin esta línea todo cambio vuelve a quedar fechado hoy").toMatch(
      /fechaEfectiva:\s*rigeDesde/,
    );
  });

  it("el schema lo acepta y la mutación lo usa en vez de hoy", () => {
    expect(SCHEMA).toMatch(/fechaEfectiva:\s*isoDateReal\.optional\(\)/);
    expect(MUTACIONES).toMatch(/const cuando = data\.fechaEfectiva \?\? hoy/);
  });
});

describe("de dónde sale «hoy»", () => {
  it("por PROP desde el server, nunca `new Date()` adentro del form", () => {
    /* Un default calculado con el reloj del navegador se renderiza distinto en el server que
       en el cliente: es una diferencia de hidratación, la misma familia que arregló
       `lib/ui/prestamo-de-title.ts`. Y encima el día que manda es el de Costa Rica. */
    expect(PANEL).toMatch(/<CostoForm[\s\S]{0,800}todayISO=\{todayISO\}/);
    expect(FORM).toContain("useState(todayISO)");
    expect(FORM, "el form volvió a leer el reloj del navegador").not.toMatch(/new Date\(\)/);
  });
});
