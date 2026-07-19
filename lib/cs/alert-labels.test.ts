/**
 * lib/cs/alert-labels.test.ts
 *
 * ESTE TEST ES EL FIX. El bug fue que `STAGE_STALLED` se agregó al enum `CsAlertCategory` y el
 * diccionario de la UI quedó corto, así que la CSL veía el identificador crudo en pantalla. Agregar
 * la línea que faltaba no arregla nada de fondo: el próximo valor nuevo vuelve a romperlo en
 * silencio, porque un `Record<string, string>` acepta cualquier clave y no se queja de las que faltan.
 *
 * Recorriendo el enum real de Prisma, la desincronización pasa a fallar antes del build, nombrando
 * exactamente cuál falta.
 */
import { test, expect } from "vitest";
import { CsAlertCategory, CsAlertSeverity } from "@prisma/client";
import { CATEGORY_LABEL, SEV_META, SEV_ORDER, relTime } from "./alert-labels";

test("toda categoría del enum tiene etiqueta en español", () => {
  for (const c of Object.values(CsAlertCategory)) {
    expect(CATEGORY_LABEL[c], `falta CATEGORY_LABEL para "${c}"`).toBeTruthy();
  }
});

test("toda severidad del enum tiene chip y orden de triage", () => {
  for (const s of Object.values(CsAlertSeverity)) {
    expect(SEV_META[s], `falta SEV_META para "${s}"`).toBeTruthy();
    expect(SEV_ORDER[s], `falta SEV_ORDER para "${s}"`).toBeTypeOf("number");
  }
});

// Lo grave primero: si esto se invierte, el feed entierra las alertas que importan.
test("el orden de triage pone HIGH arriba", () => {
  expect(SEV_ORDER.HIGH).toBeLessThan(SEV_ORDER.MEDIUM);
  expect(SEV_ORDER.MEDIUM).toBeLessThan(SEV_ORDER.LOW);
});

test("relTime: hoy, ayer, y el resto en días", () => {
  const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  expect(relTime(dias(0))).toBe("hoy");
  expect(relTime(dias(1))).toBe("ayer");
  expect(relTime(dias(5))).toBe("hace 5 días");
  // Una fecha futura no debe decir "hace -3 días".
  expect(relTime(new Date(Date.now() + 3 * 86_400_000).toISOString())).toBe("hoy");
});
