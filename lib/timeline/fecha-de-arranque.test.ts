/**
 * lib/timeline/fecha-de-arranque.test.ts — la fecha de arranque no puede volver a quedar en el año 2,
 * 20 o 26, ni verse como 1926; y sin fecha, la portada PROPONE la reunión de kickoff o hoy.
 *
 * Los años de las pruebas son los que dejó el tipeo en producción (TimelineChange de Cemaco el 5 oct,
 * Spectrum el 12 oct y Cayalá el 15 oct de 2026).
 *
 * Correr: `npx vitest run lib/timeline/fecha-de-arranque.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  arranqueSugerido,
  esFechaDeProyecto,
  esInstanteDeProyecto,
  fechaLocalDeYmd,
  ymdDeFechaLocal,
} from "./fecha-de-arranque";
import { validateTimelinePayload } from "./validate";

const leer = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("solo entran fechas de proyecto", () => {
  it("rechaza los años de un tipeo a medias (0002, 0020, 0026, 0202) y acepta 2026", () => {
    for (const malo of ["0002-10-19", "0020-10-19", "0026-10-19", "0202-10-19", "1926-10-19", "2101-01-01"]) {
      expect(esFechaDeProyecto(malo), malo).toBe(false);
    }
    expect(esFechaDeProyecto("2026-10-26")).toBe(true);
  });

  it("rechaza días que no existen y formatos que no son AAAA-MM-DD", () => {
    expect(esFechaDeProyecto("2026-02-30")).toBe(false);
    expect(esFechaDeProyecto("26/10/2026")).toBe(false);
    expect(esFechaDeProyecto("")).toBe(false);
  });

  it("el PUT del cronograma (el Gantt) rechaza un arranque, un cierre o una tarea del año 26", () => {
    const anclaMala = validateTimelinePayload({ anchorStartDate: "0026-10-19T00:00:00.000Z", phases: [] });
    expect(anclaMala.valid).toBe(false);
    const cierreMalo = validateTimelinePayload({ anchorStartDate: null, closeDateOverride: "0002-01-01T00:00:00.000Z", phases: [] });
    expect(cierreMalo.valid).toBe(false);
    const buena = validateTimelinePayload({ anchorStartDate: "2026-10-26T00:00:00.000Z", phases: [] });
    expect(buena.valid).toBe(true);
    expect(esInstanteDeProyecto("2026-10-26T06:00:00.000Z")).toBe(true);
  });

  it("la ruta de la portada valida el rango antes de escribir el ancla", () => {
    const src = leer("app/api/projects/[projectId]/timeline/arranque/route.ts");
    const i = src.indexOf("esFechaDeProyecto(raw)");
    expect(i, "la ruta dejó de validar el año").toBeGreaterThan(0);
    expect(i).toBeLessThan(src.indexOf("prisma.projectTimeline.update"));
  });
});

describe("un año de dos cifras no se convierte en 19xx", () => {
  it("`fechaLocalDeYmd('0026-10-19')` es el año 26, no 1926 (el «año 1900» del Gantt)", () => {
    // `new Date(26, 9, 19)` da 1926: así se veían las fechas guardadas por el tipeo.
    expect(new Date(26, 9, 19).getFullYear()).toBe(1926);
    expect(fechaLocalDeYmd("0026-10-19")?.getFullYear()).toBe(26);
    expect(fechaLocalDeYmd("2026-10-26")?.getDate()).toBe(26);
  });

  it("ida y vuelta AAAA-MM-DD ↔ fecha local", () => {
    expect(ymdDeFechaLocal(fechaLocalDeYmd("2026-01-05")!)).toBe("2026-01-05");
  });

  it("los dos calendarios internos usan la conversión segura", () => {
    for (const f of ["components/canvas/AnchorDatePicker.tsx", "components/ui/DatePickerField.tsx"]) {
      const src = leer(f);
      expect(src, f).toContain("fechaLocalDeYmd");
      expect(src, f).not.toContain("return new Date(y, m - 1, d)");
    }
  });
});

describe("la fecha por defecto: la reunión de kickoff, o hoy — propuesta, nunca escrita", () => {
  it("con reunión de kickoff propone esa fecha", () => {
    expect(arranqueSugerido("2026-10-26", "2026-10-20")).toEqual({ ymd: "2026-10-26", origen: "kickoff" });
  });

  it("sin reunión (o con una fecha rota) propone hoy", () => {
    expect(arranqueSugerido(null, "2026-10-20")).toEqual({ ymd: "2026-10-20", origen: "hoy" });
    expect(arranqueSugerido("0026-10-19", "2026-10-20").origen).toBe("hoy");
  });

  it("la portada ya no usa un campo de fecha que guarda en cada tecla", () => {
    const src = leer("components/landing/hero-parts.tsx");
    const i = src.indexOf("export function HeroStatFecha");
    const tramo = src.slice(i, src.indexOf("export function FilaDeDatos"));
    expect(tramo.length).toBeGreaterThan(500);
    expect(tramo, "volvió el <input type=date> que guardaba el año a medio escribir").not.toContain('type="date"');
    expect(tramo).toContain("<DayPicker");
    // La sugerida solo se ofrece: se escribe con el clic en «Usar …».
    expect(tramo).toContain("onClick={() => void elegir(sugerida.ymd)}");
  });
});
