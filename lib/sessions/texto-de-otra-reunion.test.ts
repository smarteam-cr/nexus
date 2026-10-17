/** Los títulos y encabezados son de producción (2026-10-05). */
import { describe, expect, it } from "vitest";
import {
  copiaDeOtraReunion,
  cuantoExplica,
  indexarTextos,
  laBusquedaViejaLaTomaba,
  palabrasDeLaBusquedaVieja,
  palabrasDistintivas,
  procedenciaDelTexto,
  veredictoDeMinuta,
} from "./texto-de-otra-reunion";

describe("procedenciaDelTexto", () => {
  it("el encabezado de Gemini con el título de la reunión: propia", () => {
    expect(procedenciaDelTexto("Recurrente - CAV", "Recurrente - CAV - Transcripción\n00:00:00\n\nCaroline Bersot: …")).toEqual({ tipo: "propia" });
  });
  it("el encabezado nombra otra reunión: es de esa otra", () => {
    expect(procedenciaDelTexto("Implementación HubSpot Ventas | CAV & Smarteam", "Grupo Inve & Smarteam | Implementación HubSpot Ventas - Transcripción\n…")).toEqual({
      tipo: "otra-reunion",
      encabezado: "Grupo Inve & Smarteam | Implementación HubSpot Ventas",
    });
  });
  it("la misma serie, otra semana, también es otra reunión", () => {
    expect(procedenciaDelTexto("Reunión de seguimiento 3 | SmartAgro & Smarteam", "Reunión de seguimiento 2 | SmartAgro & Smarteam - Transcripción").tipo).toBe("otra-reunion");
  });
  it("el título que Gemini cortó a 99 caracteres sigue siendo el propio", () => {
    const titulo = "Capacitación marketing semana 4 : Administración principal + Activación de canales  | Spectrum & Smarteam";
    expect(procedenciaDelTexto(titulo, `${titulo.slice(0, 99)} - Transcripción\n…`)).toEqual({ tipo: "propia" });
  });
  it("notas sin pestaña de transcripción que abren con el título: propia", () => {
    expect(procedenciaDelTexto("Gestión de campaña Renovaciones Kôlbi", "Gestión de campaña Renovaciones Kôlbi\n…").tipo).toBe("propia");
  });
  it("un contrato o un brief no es la transcripción de una reunión", () => {
    expect(procedenciaDelTexto("SMARTAGRO", "Cédula jurídica: 3-101-813655Dirección: San Carlos")).toMatchObject({ tipo: "no-es-una-reunion" });
    expect(procedenciaDelTexto("BP HONDURAS", "\n\nalgo")).toMatchObject({ tipo: "no-es-una-reunion", primeraLinea: "" });
  });
});

describe("copiaDeOtraReunion: el mismo texto en dos reuniones", () => {
  const r = (id: string, title: string, date: string, conDoc = false) => ({ id, title, date: new Date(date), conDoc });
  const diaria18 = r("d18", "Daily I Ángeles Alvarado", "2026-03-18T20:15:00Z");

  it("la diaria que se quedó con el texto de otro día: es de esa otra (la que lo tiene adjunto)", () => {
    const grupo = [r("d17", "Daily I Ángeles Alvarado", "2026-03-17T20:15:00Z", true), diaria18, r("d19", "Daily I Ángeles Alvarado", "2026-03-19T20:15:00Z")];
    expect(copiaDeOtraReunion(diaria18, grupo)?.id).toBe("d17");
  });
  it("otro título: es de esa otra", () => {
    const yo = r("a", "Implementación HubSpot Ventas | CAV & Smarteam", "2025-11-20T16:00:00Z");
    const grupo = [yo, r("b", "Grupo Inve & Smarteam | Implementación HubSpot Ventas", "2025-11-20T15:00:00Z", true)];
    expect(copiaDeOtraReunion(yo, grupo)?.id).toBe("b");
  });
  it("dos eventos de la MISMA reunión (mismo título, misma hora): el texto es suyo", () => {
    const yo = r("a", "Sprint planning de marketing", "2026-10-05T15:00:00Z");
    expect(copiaDeOtraReunion(yo, [yo, r("b", "Sprint planning de marketing", "2026-10-05T15:30:00Z", true)])).toBeNull();
  });
  it("sin otras: null", () => expect(copiaDeOtraReunion(diaria18, [diaria18])).toBeNull());
});

describe("la búsqueda vieja", () => {
  it("usaba las dos primeras palabras de 4+ letras: «CAV» e «ICB» quedaban afuera", () => {
    expect(palabrasDeLaBusquedaVieja("Recurrente - CAV")).toEqual(["Recurrente"]);
    expect(palabrasDeLaBusquedaVieja("ICB + Smarteam")).toEqual(["Smarteam"]);
  });
  it("por eso tomaba «FACO Recurrente» para «Recurrente - CAV» y la reunión de Cayalá para «ICB + Smarteam»", () => {
    expect(laBusquedaViejaLaTomaba("Recurrente - CAV", "FACO Recurrente")).toBe(true);
    expect(laBusquedaViejaLaTomaba("ICB + Smarteam", "CAYALÁ + SMARTEAM | CONVERSEMOS SOBRE POSIBLES PROYECTOS")).toBe(true);
  });
  it("una reunión sin esas palabras no la tomaba", () => {
    expect(laBusquedaViejaLaTomaba("Recurrente - CAV", "Kick off - CAV")).toBe(false);
    expect(laBusquedaViejaLaTomaba("1:1", "1:1 semanal")).toBe(false);
  });
});

describe("¿de qué reunión salió una minuta?", () => {
  // Tres reuniones de esos días: la propia (CAV), la que leyó por error (FACO) y una tercera.
  const indice = indexarTextos([
    { id: "cav", texto: "Caroline Bersot Rafaella Dañino mapa SAP propiedades flujos bienvenida subdominios remitentes encuestas" },
    { id: "faco", texto: "Randall Alan Mairena plantillas Lip Moto Usados Honda Nuevos campañas automatización activos marketing" },
    { id: "otra", texto: "Kaizen Kapital radisson breeze invitación ajuste" },
    { id: "ruido1", texto: "plantillas campañas marketing flujos" },
    { id: "ruido2", texto: "marketing campañas propiedades" },
  ]);
  const minutaDeFaco = palabrasDistintivas(
    "Crear las tres plantillas de correo automatizado (Lip Moto, Usados, Honda Nuevos) y notificar a Randall; Alan Mairena revisa campañas.",
  );

  it("la minuta escrita con el texto de FACO la explica FACO y casi nada la reunión propia", () => {
    const propia = cuantoExplica(indice, minutaDeFaco, "cav");
    const faco = cuantoExplica(indice, minutaDeFaco, "faco");
    expect(faco).toBeGreaterThan(0.8);
    expect(propia).toBeLessThan(0.2);
    expect(veredictoDeMinuta(propia, { explica: faco, laBusquedaViejaLaTomaba: true })).toBe("otra-reunion");
  });

  it("si la búsqueda vieja no podía haber tomado esa otra reunión, no se concluye: queda dudosa", () => {
    expect(veredictoDeMinuta(0.15, { explica: 0.9, laBusquedaViejaLaTomaba: false })).toBe("dudosa");
  });

  it("una minuta de la misma reunión con un documento más completo: propia", () => {
    const minuta = palabrasDistintivas("Caroline revisa el mapa de SAP y las propiedades; Rafaella entrega los assets de bienvenida.");
    expect(veredictoDeMinuta(cuantoExplica(indice, minuta, "cav"), { explica: cuantoExplica(indice, minuta, "faco"), laBusquedaViejaLaTomaba: true })).toBe("propia");
  });

  it("las palabras que no aparecen en ningún texto no cuentan, y un texto ausente explica 0", () => {
    expect(cuantoExplica(indice, ["zzzz"], "cav")).toBe(0);
    expect(cuantoExplica(indice, minutaDeFaco, "no-existe")).toBe(0);
  });

  it("los umbrales: hace falta ventaja clara sobre la propia", () => {
    expect(veredictoDeMinuta(0.45, { explica: 0.5, laBusquedaViejaLaTomaba: true })).toBe("propia");
    expect(veredictoDeMinuta(0.2, { explica: 0.3, laBusquedaViejaLaTomaba: true })).toBe("dudosa");
    expect(veredictoDeMinuta(0.6, null)).toBe("propia");
  });
});
