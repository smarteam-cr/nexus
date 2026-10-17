/**
 * Los nombres son los que devolvió Drive en producción el 2026-10-05 (solo lectura), incluidos los dos
 * casos que contaminaron a Club de Amantes del Vino y a Smarteam.
 */
import { describe, expect, it } from "vitest";
import {
  consultaDeDrive,
  desfaseDeZona,
  elegirArchivosDeLaReunion,
  leerNombreDeArchivo,
  mismoTitulo,
  palabrasParaBuscar,
  type ArchivoDeDrive,
} from "./drive-candidatos";

const DOC = "application/vnd.google-apps.document";
let n = 0;
const archivo = (name: string, createdTime: string, mimeType = DOC): ArchivoDeDrive => ({ id: `f${++n}`, name, mimeType, createdTime });

describe("leerNombreDeArchivo", () => {
  it("las notas de Gemini: título, hora con su zona y clase", () => {
    const l = leerNombreDeArchivo("Recurrente - CAV: 2026/09/30 10:54 GMT-03:00 - Notas de Gemini");
    expect(l?.titulo).toBe("Recurrente - CAV");
    expect(l?.clase).toBe("notas-gemini");
    expect(l?.momento?.toISOString()).toBe("2026-09-30T13:54:00.000Z");
  });

  it("CST es la hora de Costa Rica (UTC-6)", () => {
    expect(leerNombreDeArchivo("[CAV] Alineación: 2026/10/01 10:59 CST - Notas de Gemini")?.momento?.toISOString()).toBe(
      "2026-10-01T16:59:00.000Z",
    );
  });

  it("un título con dos puntos adentro se corta en el ÚLTIMO «: fecha»", () => {
    const l = leerNombreDeArchivo("Magdalena: Comenzando el camino: 2026/09/17 11:30 GMT-05:00 - Notas de Gemini");
    expect(l?.titulo).toBe("Magdalena: Comenzando el camino");
  });

  it("un título que termina en espacio antes de los dos puntos", () => {
    expect(leerNombreDeArchivo("Bienvenida Liliana 🚀 I Smarteam : 2026/10/01 08:00 CST - Notas de Gemini")?.titulo).toBe(
      "Bienvenida Liliana 🚀 I Smarteam",
    );
  });

  it("la transcripción de Meet", () => {
    const l = leerNombreDeArchivo("Teamnet: Comenzando el camino web - 2026/08/28 10:00 GMT-05:00 - Transcript");
    expect(l).toMatchObject({ titulo: "Teamnet: Comenzando el camino web", clase: "transcripcion" });
    expect(l?.momento?.toISOString()).toBe("2026-08-28T15:00:00.000Z");
  });

  it("las notas que se abren desde el evento no traen hora", () => {
    expect(leerNombreDeArchivo("2026-10-01 - Recurrente Tecnica - CAV")).toEqual({
      titulo: "Recurrente Tecnica - CAV",
      momento: null,
      clase: "notas-calendario",
    });
  });

  it("una zona desconocida deja la hora sin leer, no inventada", () => {
    expect(leerNombreDeArchivo("Sync: 2026/10/01 10:00 XYZ - Notas de Gemini")?.momento).toBeNull();
  });

  it.each([
    ["un chat", "SIR / Caso Hubspot - 2025/11/24 12:54 CST - Chat"],
    ["la transcripción de un chat", "hzg-akwa-ijh (2025-11-21 12:07 GMT-5) - Transcripción del chat"],
    ["una reunión instantánea sin título", "La reunión se inició a las 2026/10/01 19:29 GMT-03:00 - Notas de Gemini"],
    ["un contrato", "Contrato Implementación Ferreteria Noelito & CR Smarteam 2025"],
    ["un documento suelto", "Modelo de Comisiones – Smarteam"],
    ["un documento sin título", "Documento sin título"],
  ])("%s no es un archivo de una reunión", (_, nombre) => {
    expect(leerNombreDeArchivo(nombre)).toBeNull();
  });
});

describe("desfaseDeZona", () => {
  it.each([
    ["GMT-03:00", -180],
    ["GMT-5", -300],
    ["GMT+01:00", 60],
    ["GMT", 0],
    ["CST", -360],
    ["cst", -360],
  ])("%s → %d minutos", (z, m) => expect(desfaseDeZona(z)).toBe(m));
  it("sin zona o desconocida → null", () => {
    expect(desfaseDeZona(undefined)).toBeNull();
    expect(desfaseDeZona("XYZ")).toBeNull();
  });
});

describe("mismoTitulo", () => {
  it("exacto sin tildes, signos ni mayúsculas", () => {
    expect(mismoTitulo("CAYALÁ + SMARTEAM | CONVERSEMOS", "Cayala Smarteam conversemos")).toBe(true);
  });
  it("una palabra de más o de menos es otra reunión", () => {
    expect(mismoTitulo("Recurrente - CAV", "FACO Recurrente")).toBe(false);
    expect(mismoTitulo("ICB + Smarteam", "ICB + Smarteam + Hubspot")).toBe(false);
    expect(mismoTitulo("Reunión de seguimiento 3 | SmartAgro", "Reunión de seguimiento 2 | SmartAgro")).toBe(false);
  });
  it("Gemini corta el título a 99 caracteres: el cortado es el mismo", () => {
    const completo = "Capacitación marketing semana 4 : Administración principal + Activación de canales  | Spectrum & Smarteam";
    expect(mismoTitulo(completo, completo.slice(0, 99))).toBe(true);
  });
  it("un comienzo corto en común no alcanza", () => {
    expect(mismoTitulo("Capacitación semana 2: Estructura de Pipeline de Tickets | AMC", "Capacitación semana 2")).toBe(false);
  });
});

describe("elegirArchivosDeLaReunion", () => {
  it("«Recurrente - CAV»: toma sus notas y NUNCA las de «FACO Recurrente» (el caso del 2026-09-30)", () => {
    const archivos = [
      archivo("Recurrente Tecnica - CAV: 2026/10/01 11:26 GMT-03:00 - Notas de Gemini", "2026-10-01T15:01:09Z"),
      archivo("2026-10-01 - Recurrente Tecnica - CAV", "2026-10-01T14:58:55Z"),
      archivo("Recurrente - CAV: 2026/09/30 10:54 GMT-03:00 - Notas de Gemini", "2026-09-30T15:06:51Z"),
      archivo("FACO Recurrente: 2026/09/29 11:54 GMT-03:00 - Notas de Gemini", "2026-09-29T16:22:04Z"),
      archivo("2026-09-29 - FACO Recurrente", "2026-09-29T16:05:19Z"),
    ];
    const e = elegirArchivosDeLaReunion({ titulo: "Recurrente - CAV", fecha: new Date("2026-09-30T20:00:00Z"), otrasFechas: [] }, archivos);
    expect(e.elegidos.map((x) => x.archivo.name)).toEqual(["Recurrente - CAV: 2026/09/30 10:54 GMT-03:00 - Notas de Gemini"]);
  });

  it("si sus notas no existen, la reunión queda sin archivo: nunca se cae al de otra", () => {
    const archivos = [archivo("FACO Recurrente: 2026/09/29 11:54 GMT-03:00 - Notas de Gemini", "2026-09-29T16:22:04Z")];
    const e = elegirArchivosDeLaReunion({ titulo: "Recurrente - CAV", fecha: new Date("2026-09-30T20:00:00Z"), otrasFechas: [] }, archivos);
    expect(e.elegidos).toEqual([]);
    expect(e.descartados[0].motivo).toBe("es de otra reunión (otro título)");
  });

  it("«ICB + Smarteam»: el evento se movió 2 días después de la reunión y aun así encuentra las suyas, no las de Cayalá", () => {
    const archivos = [
      archivo("ICB + Smarteam + Hubspot: 2026/09/30 17:30 GMT-05:00 - Notas de Gemini", "2026-09-30T22:43:52Z"),
      archivo("CAYALÁ + SMARTEAM | CONVERSEMOS SOBRE POSIBLES PROYECTOS: 2026/09/28 14:30 CST - Notas de Gemini", "2026-09-28T23:22:29Z"),
      archivo("ICB + Smarteam: 2026/09/28 16:30 GMT-05:00 - Notas de Gemini", "2026-09-28T22:37:47Z"),
      archivo("Modelo de Comisiones – Smarteam", "2026-09-28T16:45:11Z"),
    ];
    const e = elegirArchivosDeLaReunion({ titulo: "ICB + Smarteam", fecha: new Date("2026-10-01T04:30:00Z"), otrasFechas: [] }, archivos);
    expect(e.elegidos.map((x) => x.archivo.name)).toEqual(["ICB + Smarteam: 2026/09/28 16:30 GMT-05:00 - Notas de Gemini"]);
  });

  it("una serie diaria: el archivo de ayer es de la reunión de ayer", () => {
    const hoy = new Date("2026-09-28T14:30:00Z");
    const ayer = new Date("2026-09-27T14:30:00Z");
    const archivos = [archivo("Weekly Execution Review: 2026/09/27 08:35 CST - Notas de Gemini", "2026-09-27T14:38:43Z")];
    const e = elegirArchivosDeLaReunion({ titulo: "Weekly Execution Review", fecha: hoy, otrasFechas: [ayer] }, archivos);
    expect(e.elegidos).toEqual([]);
    expect(e.descartados[0].motivo).toMatch(/misma serie/);
  });

  it("fuera de la ventana no se acepta aunque el título sea el mismo", () => {
    const archivos = [archivo("Recurrente - CAV: 2026/09/23 10:54 GMT-03:00 - Notas de Gemini", "2026-09-23T15:06:51Z")];
    const e = elegirArchivosDeLaReunion({ titulo: "Recurrente - CAV", fecha: new Date("2026-09-30T20:00:00Z"), otrasFechas: [] }, archivos);
    expect(e.elegidos).toEqual([]);
    expect(e.descartados[0].motivo).toBe("es de otra fecha");
  });

  it("el orden: notas de Gemini, después la transcripción de Meet, después las notas del calendario", () => {
    const fecha = new Date("2026-08-14T19:00:00Z");
    const archivos = [
      archivo("2026-08-14 - Llantas del pacífico: Caso de negocio", "2026-08-14T19:00:30Z"),
      archivo("Llantas del pacífico: Caso de negocio - 2026/08/14 14:01 GMT-05:00 - Transcript", "2026-08-14T19:29:48Z"),
      archivo("Llantas del pacífico: Caso de negocio: 2026/08/14 14:01 GMT-05:00 - Notas de Gemini", "2026-08-14T19:31:00Z"),
      archivo("Llantas del pacífico: Caso de negocio - 2026/08/14 14:01 GMT-05:00 - Chat", "2026-08-14T19:31:10Z", "text/plain"),
    ];
    const e = elegirArchivosDeLaReunion({ titulo: "Llantas del pacífico: Caso de negocio", fecha, otrasFechas: [] }, archivos);
    expect(e.elegidos.map((x) => x.clase)).toEqual(["notas-gemini", "transcripcion", "notas-calendario"]);
    expect(e.descartados.map((d) => d.motivo)).toEqual(["no es un archivo de una reunión"]);
  });
});

describe("la consulta a Drive", () => {
  it("usa también las siglas cortas («CAV», «ICB»): con «Recurrente» solo, Drive devolvía las notas de FACO", () => {
    expect(palabrasParaBuscar("Recurrente - CAV")).toEqual(["Recurrente", "CAV"]);
    expect(palabrasParaBuscar("ICB + Smarteam")).toEqual(["Smarteam", "ICB"]);
  });
  it("las palabras más largas primero, sin repetir y sin números sueltos", () => {
    expect(palabrasParaBuscar("Semana 1 | Semana 2 | Sfera legal & Smarteam")).toEqual(["Smarteam", "Semana"]);
  });
  it("busca por fecha de CREACIÓN, un apóstrofo no rompe la consulta y sin palabras no busca", () => {
    const q = consultaDeDrive("O'Brien Recurrente", new Date("2026-09-30T20:00:00Z"))!;
    expect(q).toContain("name contains 'Recurrente' and name contains 'Brien'");
    expect(q).toContain("createdTime >= '2026-09-27T20:00:00.000Z'");
    expect(q).toContain("createdTime <= '2026-10-03T20:00:00.000Z'");
    expect(q).not.toContain("modifiedTime");
    expect(consultaDeDrive("1:1", new Date())).toBeNull();
  });
});
