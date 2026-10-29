/**
 * lib/exploraciones/posicionamiento.test.ts — el position statement del prospecto se valida contra la base (K3, «validarse
 * con eso», 2026-10-28): casos que pasan y casos que no.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { Posicionamiento } from "@/lib/smarteam/posicionamiento";
import {
  calceDe,
  entradaDeLaRespuesta,
  hayQuePedirlo,
  hechosDisponibles,
  pedidoDelPosicionamiento,
  prometeDeMas,
  textoDelPosicionamientoDelProspecto,
  validarElPosicionamiento,
  type ContextoDelPosicionamiento,
} from "./posicionamiento";
import { leerPropuesta } from "./esquemas";

/** La base de Elías (28 oct), recortada a lo que miran las pruebas. */
const BASE: Posicionamiento = {
  frase: "Acompañamos a empresas que están creciendo, pero sienten que su operación comercial no da lo que debería.",
  frentes: [
    {
      clave: "estructura",
      nombre: "Estructura",
      herramienta: "HubSpot",
      promesa: "Ordenar procesos, datos y equipos en un solo lugar",
      titulo: "HubSpot: ordenar la relación con cada cliente",
      queLogra: [
        { titulo: "Un solo lugar por cliente", detalle: "toda su historia, visible para el equipo" },
        { titulo: "Ventas con seguimiento", detalle: "ningún prospecto se pierde" },
      ],
      cuandoCabe: ["La venta toma semanas o meses", "Cada cliente vale mucho"],
      nota: "Ejemplo: “tenemos CRM, pero nadie lo ve”",
    },
    {
      clave: "activacion",
      nombre: "Activación",
      herramienta: "Insider One",
      promesa: "Que miles de clientes compren, vuelvan y recompren",
      titulo: "Insider One: activar a miles de clientes",
      queLogra: [
        { titulo: "Ver al cliente completo", detalle: "web, app, tienda y call center" },
        { titulo: "Rescatar al que abandona", detalle: "carritos y solicitudes a medias" },
        { titulo: "Anticipar qué hará", detalle: "quién va a comprar y quién se va" },
      ],
      cuandoCabe: ["Le vende a personas, no solo a empresas", "Mucho tráfico en su web o su app", "Una base grande que aceptó recibir mensajes"],
      nota: "Sin volumen, la IA no tiene de qué aprender",
    },
    { clave: "acompanamiento", nombre: "Acompañamiento", herramienta: null, promesa: "Que lo implementado se use y siga dando resultados", titulo: null, queLogra: [], cuandoCabe: [], nota: null },
  ],
};

const HECHOS = hechosDisponibles({
  datos: { aQuienVende: "personas", trafico: "mas_1m" },
  radiografia: {
    resumen: "Cadena de tiendas de electrónica con venta en línea.",
    modelos: ["retail", "ecommerce"],
    hitos: [{ texto: "Abrió su tienda en línea en Guatemala", fecha: "2026-03", url: "https://noticias.example/tienda" }],
  },
  contrataciones: [{ puesto: "Gerente de CRM", url: "https://empleos.example/crm" }],
});
const CTX: ContextoDelPosicionamiento = { empresa: "Tiendas Prueba", base: BASE, hechos: HECHOS };
const id = (texto: string) => HECHOS.find((h) => h.texto.includes(texto))!.id;
const validar = (entrada: unknown) => validarElPosicionamiento(entrada, CTX, { corridaId: "run1", ahora: new Date("2026-10-28T12:00:00Z") })!;

describe("los hechos que se ofrecen", () => {
  it("los datos de la empresa primero, después la investigación, las noticias y las vacantes, cada uno con su fuente", () => {
    expect(HECHOS.map((h) => [h.id, h.texto, h.fuente, h.url ?? null])).toEqual([
      ["P1", "A quién le vende: A personas", "Los datos de la empresa", null],
      ["P2", "Tráfico del sitio: Más de 1 millón de visitas al mes", "Los datos de la empresa", null],
      ["P3", "Cadena de tiendas de electrónica con venta en línea.", "La investigación de la empresa", null],
      ["P4", "Cómo vende: Retail, E-commerce", "La investigación de la empresa", null],
      ["P5", "Abrió su tienda en línea en Guatemala", "Noticia", "https://noticias.example/tienda"],
      ["P6", "Está contratando: Gerente de CRM", "Vacante publicada", "https://empleos.example/crm"],
    ]);
  });

  it("sin frase o sin hechos no se pide nada", () => {
    expect(hayQuePedirlo(CTX)).toBe(true);
    expect(hayQuePedirlo({ ...CTX, base: { ...BASE, frase: "  " } })).toBe(false);
    expect(hayQuePedirlo({ ...CTX, hechos: [] })).toBe(false);
    expect(validarElPosicionamiento({}, { ...CTX, base: { ...BASE, frase: null } }, { corridaId: "x" })).toBeNull();
  });

  it("el pedido numera la base y los hechos, y marca el frente pendiente", () => {
    const p = pedidoDelPosicionamiento(CTX);
    const texto = (p.messages[0].content as string) + p.system;
    expect(texto).toContain("Frente «Activación · Insider One» (clave: activacion)");
    expect(texto).toContain("2. Mucho tráfico en su web o su app");
    expect(texto).toContain("P6. Está contratando: Gerente de CRM — Vacante publicada");
    expect(texto).toMatch(/Acompañamiento.*\n {2}Sin condiciones escritas/);
    expect(p.tool_choice).toEqual({ type: "tool", name: "posicionamiento" });
  });
});

describe("casos que pasan", () => {
  it("calza: cumple todas las condiciones, cada una con su hecho; la frase y lo que logra salen de la base", () => {
    const r = validar({
      hechos: [id("A quién"), id("Tráfico"), id("Gerente de CRM")],
      frente: "activacion",
      condiciones: [
        { numero: 1, estado: "cumple", hechos: [id("A quién")], razon: "Le vende a personas." },
        { numero: 2, estado: "cumple", hechos: [id("Tráfico")], razon: "Más de un millón de visitas al mes." },
        { numero: 3, estado: "cumple", hechos: [id("tienda en línea")], razon: "Su tienda en línea junta clientes." },
      ],
      logros: [2, 1],
      razon: "Vende a personas y tiene mucho tráfico.",
    });
    expect(r.frase).toBe(BASE.frase);
    expect(r.hechos.map((h) => h.texto)).toEqual(["A quién le vende: A personas", "Tráfico del sitio: Más de 1 millón de visitas al mes", "Está contratando: Gerente de CRM"]);
    expect(r.hechos[2]).toMatchObject({ fuente: "Vacante publicada", url: "https://empleos.example/crm" });
    expect(r.frente).toMatchObject({ clave: "activacion", nombre: "Activación · Insider One", calce: "calza", razon: "Vende a personas y tiene mucho tráfico." });
    expect(r.frente!.logros.map((l) => l.titulo)).toEqual(["Rescatar al que abandona", "Ver al cliente completo"]);
    expect(r.frente!.condiciones[2].hechos[0].url).toBe("https://noticias.example/tienda");
    expect(r.descartes).toEqual([]);
  });

  it("a medias: cumple una y la otra queda sin dato; lo dice y la guía nombra lo que falta confirmar", () => {
    const r = validar({
      hechos: [id("A quién"), id("Tráfico")],
      frente: "activacion",
      condiciones: [
        { numero: 1, estado: "cumple", hechos: [id("A quién")] },
        { numero: 2, estado: "cumple", hechos: [id("Tráfico")] },
        { numero: 3, estado: "sin_dato", hechos: [] },
      ],
      logros: [1],
    });
    expect(r.frente!.calce).toBe("a_medias");
    // Sin razón del agente, la arma Nexus con las condiciones que se cumplen.
    expect(r.frente!.razon).toBe("Calza con Activación · Insider One: le vende a personas, no solo a empresas; mucho tráfico en su web o su app.");
    const texto = textoDelPosicionamientoDelProspecto(r, "Tiendas Prueba");
    expect(texto).toContain("Frente que calza A MEDIAS: Activación · Insider One");
    expect(texto).toContain("Falta confirmar: una base grande que aceptó recibir mensajes.");
  });

  it("ningún frente: se dice por qué y la frase queda con sus hechos", () => {
    const r = validar({ hechos: [id("Cadena")], sinFrente: "No hay datos de su venta." });
    expect(r.frente).toBeNull();
    expect(r.sinFrente).toBe("No hay datos de su venta.");
    expect(r.hechos).toHaveLength(1);
  });
});

describe("casos que no pasan", () => {
  it("un hecho inventado o de más se descarta: nunca más de tres", () => {
    const r = validar({ hechos: ["P99", "inventado", id("A quién"), id("Tráfico"), id("Cadena"), id("Gerente")] });
    expect(r.hechos).toHaveLength(3);
    expect(r.descartes[0]).toBe("2 hecho(s) que no estaban en la lista de Nexus");
  });

  it("un frente que la base no tiene no se propone", () => {
    const r = validar({ hechos: [id("A quién")], frente: "consultoria-erp", condiciones: [{ numero: 1, estado: "cumple", hechos: [id("A quién")] }] });
    expect(r.frente).toBeNull();
    expect(r.sinFrente).toContain("no está en el position statement");
  });

  it("un frente pendiente (sin «cuándo cabe») no se propone aunque el agente lo elija", () => {
    const r = validar({ hechos: [id("A quién")], frente: "acompanamiento", logros: [1] });
    expect(r.frente).toBeNull();
    expect(r.sinFrente).toContain("Acompañamiento todavía no tiene");
  });

  it("«se cumple» sin un hecho que lo respalde queda sin dato; si así no se cumple ninguna, el frente no se propone", () => {
    const r = validar({
      hechos: [id("A quién")],
      frente: "activacion",
      condiciones: [
        { numero: 1, estado: "cumple", hechos: [] },
        { numero: 2, estado: "cumple", hechos: ["P77"] },
        { numero: 3, estado: "cumple" },
      ],
    });
    expect(r.frente).toBeNull();
    expect(r.sinFrente).toContain("no se cumple ninguna");
    expect(r.descartes.filter((d) => d.includes("sin un hecho que lo respalde"))).toHaveLength(3);
  });

  it("fallan más condiciones de las que se cumplen: no se propone", () => {
    const r = validar({
      hechos: [id("A quién")],
      frente: "activacion",
      condiciones: [
        { numero: 1, estado: "cumple", hechos: [id("A quién")] },
        { numero: 2, estado: "no_cumple", hechos: [id("Cadena")] },
        { numero: 3, estado: "no_cumple", hechos: [id("Cadena")] },
      ],
    });
    expect(r.frente).toBeNull();
    expect(r.sinFrente).toContain("fallan más condiciones de las que se cumplen");
  });

  it("una condición que el agente no revisó queda sin dato (no se da por cumplida)", () => {
    const r = validar({ hechos: [id("A quién")], frente: "activacion", condiciones: [{ numero: 1, estado: "cumple", hechos: [id("A quién")] }, { numero: 7, estado: "cumple", hechos: [id("A quién")] }] });
    expect(r.frente!.calce).toBe("a_medias");
    expect(r.frente!.condiciones.map((c) => c.estado)).toEqual(["cumple", "sin_dato", "sin_dato"]);
    expect(r.descartes).toContain("la condición 7, que el frente no tiene");
  });

  it("un «qué logra» que la base no tiene se descarta: la promesa sale de la base", () => {
    const r = validar({ hechos: [id("A quién")], frente: "estructura", condiciones: [1, 2].map((n) => ({ numero: n, estado: "cumple", hechos: [id("Cadena")] })), logros: [9, 2] });
    expect(r.frente!.logros).toEqual([{ titulo: "Ventas con seguimiento", detalle: "ningún prospecto se pierde" }]);
    expect(r.descartes).toContain("1 «qué logra» que el frente no tiene");
  });

  it("una razón que promete un resultado o una cifra que nadie dijo se reemplaza", () => {
    const r = validar({
      hechos: [id("A quién")],
      frente: "estructura",
      condiciones: [
        { numero: 1, estado: "cumple", hechos: [id("Cadena")], razon: "Les vamos a duplicar las ventas." },
        { numero: 2, estado: "cumple", hechos: [id("Cadena")] },
      ],
      razon: "Con HubSpot venderán 40% más en seis meses.",
    });
    expect(r.frente!.razon).toBe("Calza con Estructura · HubSpot: la venta toma semanas o meses; cada cliente vale mucho.");
    expect(r.frente!.condiciones[0].razon).toBeNull();
    expect(r.descartes.filter((d) => d.includes("prometía"))).toHaveLength(2);
  });
});

describe("lo que encontró la revisión (2026-10-28)", () => {
  it("una cifra inventada no pasa aunque sus dígitos estén dentro de una fecha de un hecho, ni «veces más», ni un futuro que promete", () => {
    const permitido = ["Abrió su tienda en línea en Guatemala 2026-03", "Tráfico del sitio: Más de 1 millón de visitas al mes"];
    expect(prometeDeMas("Con HubSpot venderán 20% más.", permitido)).toBe(true);
    expect(prometeDeMas("Tendrán 20 por ciento más clientes.", permitido)).toBe(true);
    expect(prometeDeMas("Venden 3 veces más en 6 meses.", permitido)).toBe(true);
    expect(prometeDeMas("Con Insider recuperarán los carritos.", permitido)).toBe(true);
    expect(prometeDeMas("Abrió en 2026 y tiene más de 1 millón de visitas.", permitido)).toBe(false);
    const r = validar({
      hechos: [id("tienda en línea")],
      frente: "estructura",
      condiciones: [1, 2].map((n) => ({ numero: n, estado: "cumple", hechos: [id("Cadena")] })),
      razon: "Con HubSpot venderán 20% más.",
    });
    expect(r.frente!.razon).toBe("Calza con Estructura · HubSpot: la venta toma semanas o meses; cada cliente vale mucho.");
  });

  it("«no se cumple» sin un hecho se respeta: una que se cumple y dos que no, el frente no se propone", () => {
    const r = validar({
      hechos: [id("A quién")],
      frente: "activacion",
      condiciones: [
        { numero: 1, estado: "cumple", hechos: [id("A quién")] },
        { numero: 2, estado: "no_cumple", hechos: [] },
        { numero: 3, estado: "no_cumple" },
      ],
    });
    expect(r.frente).toBeNull();
    expect(r.sinFrente).toContain("fallan más condiciones de las que se cumplen");
  });

  it("lo que ya se sabe que no se cumple no se dice «falta confirmar»: van por separado", () => {
    const r = validar({
      hechos: [id("A quién")],
      frente: "activacion",
      condiciones: [
        { numero: 1, estado: "cumple", hechos: [id("A quién")] },
        { numero: 2, estado: "no_cumple", hechos: [id("Cadena")] },
        { numero: 3, estado: "sin_dato", hechos: [] },
      ],
    });
    expect(r.frente!.calce).toBe("a_medias");
    const texto = textoDelPosicionamientoDelProspecto(r, "Tiendas Prueba");
    expect(texto).toContain("Falta confirmar: una base grande que aceptó recibir mensajes.");
    expect(texto).toContain("Ya se sabe que no se cumple: mucho tráfico en su web o su app. No lo prometas.");
    expect(texto).not.toContain("Falta confirmar: mucho tráfico");
  });

  it("el «ningún frente calza» del agente también pasa por el filtro", () => {
    const r = validar({ hechos: [id("Cadena")], sinFrente: "Ninguno calza, pero con HubSpot duplicarían sus ventas." });
    expect(r.sinFrente).toBe("Ningún frente calza con lo que se sabe de la empresa.");
    expect(r.descartes.some((d) => d.includes("prometía"))).toBe(true);
  });

  it("un hecho largo se recorta al armar: lo guardado siempre se vuelve a leer", () => {
    const largo = "Una empresa grande. ".repeat(45); // ~900 caracteres
    const hechos = hechosDisponibles({ radiografia: { resumen: largo } });
    expect(hechos[0].texto.length).toBeLessThanOrEqual(600);
    const r = validarElPosicionamiento({ hechos: ["P1"], razon: "x".repeat(900) }, { ...CTX, hechos }, { corridaId: "run1" })!;
    expect(leerPropuesta({ posicionamiento: r }).posicionamiento).toEqual(r);
  });
});

describe("las reglas sueltas", () => {
  it("el calce", () => {
    const c = (...e: ("cumple" | "a_medias" | "no_cumple" | "sin_dato")[]) => calceDe(e.map((estado) => ({ estado })));
    expect(c("cumple", "cumple")).toBe("calza");
    expect(c("cumple", "a_medias")).toBe("a_medias");
    expect(c("cumple", "cumple", "no_cumple")).toBe("a_medias");
    expect(c("cumple", "no_cumple", "no_cumple")).toBeNull();
    expect(c("a_medias", "sin_dato")).toBeNull();
    expect(c()).toBeNull();
  });

  it("qué es prometer de más", () => {
    const permitido = ["Tráfico del sitio: Más de 1 millón de visitas al mes", "Abrió en 2026"];
    expect(prometeDeMas("Tiene más de 1 millón de visitas.", permitido)).toBe(false);
    expect(prometeDeMas("Abrió su tienda en 2026.", permitido)).toBe(false);
    expect(prometeDeMas("Subirá un 30% su recompra.", permitido)).toBe(true);
    expect(prometeDeMas("Le garantizamos el resultado.", permitido)).toBe(true);
  });

  it("lee el input de su herramienta en la respuesta", () => {
    const contenido = [
      { type: "text", text: "listo" },
      { type: "tool_use", id: "t", name: "posicionamiento", input: { hechos: ["P1"] } },
    ] as unknown as Anthropic.Messages.ContentBlock[];
    expect(entradaDeLaRespuesta(contenido)).toEqual({ hechos: ["P1"] });
    expect(entradaDeLaRespuesta([])).toBeNull();
  });
});
