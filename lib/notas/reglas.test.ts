import { describe, expect, it } from "vitest";
import {
  CANALES,
  CANALES_A_MANO,
  ETIQUETA_DEL_CANAL,
  MAX_TEXTO_DE_LA_NOTA,
  cuerpoParaHubspot,
  diaDeCostaRica,
  diaEnPalabras,
  estadoEnHubspotEnPalabras,
  horaEnHubspot,
  notaSugeridaDeLaMinuta,
  notasDeHubspotSinLasDeNexus,
  reunionConNotaSugerida,
  textosDeLaMinuta,
} from "./reglas";
import { nuevaNotaSchema } from "./schema";

describe("los canales", () => {
  it("todos tienen etiqueta, y a mano no se elige «Reunión» (esa es la nota sugerida)", () => {
    for (const c of CANALES) expect(ETIQUETA_DEL_CANAL[c]).toBeTruthy();
    expect(CANALES_A_MANO).not.toContain("reunion");
  });
});

describe("las fechas", () => {
  it("el día de Costa Rica: a las 23:00 de Costa Rica sigue siendo el mismo día", () => {
    expect(diaDeCostaRica(new Date("2026-10-17T04:59:00.000Z"))).toBe("2026-10-16");
    expect(diaDeCostaRica(new Date("2026-10-17T06:00:00.000Z"))).toBe("2026-10-17");
  });
  it("en palabras, y la hora en HubSpot es el mediodía de Costa Rica (no cae en el día de antes)", () => {
    expect(diaEnPalabras("2026-10-16")).toBe("16 oct 2026");
    expect(horaEnHubspot("2026-10-16")).toBe("2026-10-16T18:00:00.000Z");
  });
});

describe("el cuerpo de la nota en HubSpot", () => {
  it("lleva el canal, el día, quién la escribió y el texto con sus saltos", () => {
    const html = cuerpoParaHubspot({ canal: "whatsapp", fecha: "2026-10-16", texto: "Primera línea\nsegunda\n\nOtro párrafo", autor: "Ana Pérez", proyecto: "Implementación" });
    expect(html).toContain("<strong>WhatsApp · 16 oct 2026</strong>");
    expect(html).toContain("Ana Pérez, desde Nexus");
    expect(html).toContain("proyecto «Implementación»");
    expect(html).toContain("<p>Primera línea<br>segunda</p><p>Otro párrafo</p>");
  });
  it("escapa el HTML que escribió la persona", () => {
    expect(cuerpoParaHubspot({ canal: "otro", fecha: "2026-10-16", texto: "<script>x</script> & más", autor: "<b>Ana</b>" })).not.toContain("<script>");
  });
});

describe("la nota sugerida después de una reunión", () => {
  const base = { titulo: "Seguimiento semanal", fecha: "2026-10-16", resumen: "Se habló del avance." };
  it("lleva lo acordado y lo decidido", () => {
    const t = notaSugeridaDeLaMinuta({ ...base, acuerdos: ["Ana manda la base el lunes", "  "], decisiones: ["Se usa el pipeline nuevo"] })!;
    expect(t).toContain("Reunión «Seguimiento semanal» del 16 oct 2026.");
    expect(t).toContain("Acuerdos:\n- Ana manda la base el lunes");
    expect(t).toContain("Decisiones:\n- Se usa el pipeline nuevo");
    expect(t).not.toContain("Se habló del avance.");
  });
  it("sin acuerdos ni decisiones, el resumen; sin nada, no hay nota", () => {
    expect(notaSugeridaDeLaMinuta({ ...base, acuerdos: [], decisiones: [] })).toContain("Se habló del avance.");
    expect(notaSugeridaDeLaMinuta({ ...base, resumen: " ", acuerdos: [], decisiones: [] })).toBeNull();
  });
  it("nunca pasa del largo de una nota", () => {
    const larga = notaSugeridaDeLaMinuta({ ...base, acuerdos: Array.from({ length: 200 }, (_, i) => `acuerdo ${i} `.repeat(5)), decisiones: [] })!;
    expect(larga.length).toBeLessThanOrEqual(MAX_TEXTO_DE_LA_NOTA);
  });
  it("solo desde el día en que salió la función", () => {
    expect(reunionConNotaSugerida("2026-10-15")).toBe(false);
    expect(reunionConNotaSugerida("2026-10-16")).toBe(true);
  });
  it("lee las listas de la minuta en las dos formas", () => {
    expect(textosDeLaMinuta([{ text: " a " }, "b", { otra: 1 }, ""])).toEqual(["a", "b"]);
    expect(textosDeLaMinuta(null)).toEqual([]);
  });
});

describe("leer HubSpot", () => {
  it("las notas que escribió Nexus no vuelven como «escritas en HubSpot»", () => {
    const notas = [
      { id: "1", texto: "de Nexus", ts: 1 },
      { id: "2", texto: "de alguien en HubSpot", ts: 2 },
    ];
    expect(notasDeHubspotSinLasDeNexus(notas, new Set(["1"])).map((n) => n.id)).toEqual(["2"]);
  });
  it("el estado en palabras dice si se reintenta o ya no", () => {
    expect(estadoEnHubspotEnPalabras("error", 1)).toContain("se reintenta");
    expect(estadoEnHubspotEnPalabras("error", 5)).toBe("No se pudo escribir en HubSpot");
  });
});

describe("lo que entra al anotar", () => {
  it("pide canal, fecha y texto; «Reunión» no se elige a mano", () => {
    expect(nuevaNotaSchema.safeParse({ canal: "llamada", fecha: "2026-10-16", texto: "Hablé con Ana." }).success).toBe(true);
    expect(nuevaNotaSchema.safeParse({ canal: "reunion", fecha: "2026-10-16", texto: "x" }).success).toBe(false);
    expect(nuevaNotaSchema.safeParse({ canal: "llamada", fecha: "16/10/2026", texto: "x" }).success).toBe(false);
    expect(nuevaNotaSchema.safeParse({ canal: "llamada", fecha: "2026-10-16", texto: "   " }).success).toBe(false);
  });
});
