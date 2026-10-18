/**
 * lib/landing/modulos-biblioteca.test.ts — la biblioteca de módulos y «Adaptar a esta empresa».
 *
 * Correr: `npx vitest run lib/landing/modulos-biblioteca.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { isBlank } from "./is-blank";
import {
  CLAVE_DEL_MODULO,
  dataParaCopiar,
  hallazgosDelCliente,
  leerHallazgos,
  moduloVacio,
  palabrasDistintivas,
  resumenDeHallazgos,
  textosDelModulo,
  tipoGuardable,
} from "./modulos-biblioteca";
import {
  armarPedidoDeAdaptacion,
  cambiosElegidos,
  leerRespuestaDeAdaptacion,
  resumenDeLaPropuesta,
  segmentosDelPedido,
} from "./adaptar-modulo";
import { aplicarTextos, extraerTextos } from "./html-textos";

const HTML_REMPRO = `<h2>Arquitectura de REMPRO</h2>
<p>Escríbenos a ventas@rempro.com o al +506 8888-1234.</p>
<p>Inversión: USD 12,500 en cinco pagos.</p>
<script>const C = { titulo: "Grupo Rempro conecta su ERP" };</script>`;

describe("⛔ un módulo no lleva datos del cliente original sin avisar", () => {
  const textos = textosDelModulo("html", { html: HTML_REMPRO, notaPdf: "" });

  it("encuentra el nombre, el dominio, el correo, el teléfono y el monto", () => {
    const h = hallazgosDelCliente(textos, { nombre: "REMPRO", dominios: ["rempro.com"] });
    const tipos = new Set(h.map((x) => x.tipo));
    expect(tipos).toEqual(new Set(["cliente", "dominio", "correo", "telefono", "monto"]));
    // El nombre aparece en el título, en el correo y en la cadena del script, sin importar mayúsculas.
    expect(h.find((x) => x.tipo === "cliente")?.veces).toBe(3);
    expect(resumenDeHallazgos(h)).toMatch(/^Nombra a «REMPRO»/);
  });

  it("busca por las palabras distintivas, no por las genéricas", () => {
    expect(palabrasDistintivas("Grupo Monge Internacional")).toEqual(["monge"]);
    expect(palabrasDistintivas("Costa Rica Group")).toEqual([]);
    const h = hallazgosDelCliente(["El equipo de MONGE vende"], { nombre: "Grupo Monge" });
    expect(h).toEqual([{ tipo: "cliente", texto: "monge", veces: 1 }]);
  });

  it("⚠ por palabra completa y sin tildes: «Monge» no es «Mongerito», «Ferretería» sí es «FERRETERIA»", () => {
    expect(hallazgosDelCliente(["Mongerito"], { nombre: "Monge" })).toEqual([]);
    expect(hallazgosDelCliente(["FERRETERIA Noelito"], { nombre: "Ferretería Noelito" }).length).toBeGreaterThan(0);
  });

  it("un año o un rango no es un teléfono", () => {
    expect(hallazgosDelCliente(["De 2024 - 2026"], { nombre: "" })).toEqual([]);
  });

  it("un módulo limpio no tiene hallazgos", () => {
    expect(hallazgosDelCliente(["Ordena tu proceso comercial con HubSpot"], { nombre: "REMPRO", dominios: ["rempro.com"] })).toEqual([]);
  });

  it("en una sección estructurada lee sus textos, sin la presentación ni las claves __*", () => {
    const t = textosDelModulo("tabla", {
      intro: "Comparamos para REMPRO",
      columnas: [{ titulo: "Plan", alineacion: "izquierda" }],
      moneda: "USD",
      [CLAVE_DEL_MODULO]: "mod_123",
    });
    expect(t).toContain("Comparamos para REMPRO");
    expect(t).not.toContain("USD");
    expect(t).not.toContain("mod_123");
  });
});

describe("qué se guarda y qué se copia", () => {
  it("solo las secciones personalizadas, con su tipo", () => {
    expect(tipoGuardable("custom:tabla:abc")).toBe("tabla");
    expect(tipoGuardable("custom:0f9a1b2c-3d4e")).toBe("html"); // las viejas son HTML pegado
    expect(tipoGuardable("inversion")).toBeNull();
    expect(tipoGuardable("custom:un_tipo_raro:abc")).toBeNull();
  });

  it("la copia no lleva las claves __* (la marca de otro módulo, el idioma)", () => {
    const original = { html: "<p>Hola</p>", notaPdf: "", [CLAVE_DEL_MODULO]: "viejo", __lang: "es" };
    const copia = dataParaCopiar(original);
    expect(copia).toEqual({ html: "<p>Hola</p>", notaPdf: "" });
    // Y es una copia: cambiar una no toca la otra.
    (copia as { html: string }).html = "<p>Otro</p>";
    expect(original.html).toBe("<p>Hola</p>");
  });

  it("⚠ la marca del módulo no vuelve no-blank a una sección vaciada", () => {
    expect(isBlank({ html: "", notaPdf: "", altoEmbed: "", [CLAVE_DEL_MODULO]: "mod_1" })).toBe(true);
  });

  it("un módulo vacío no se guarda", () => {
    expect(moduloVacio("html", { html: "  ", notaPdf: "" })).toBe(true);
    expect(moduloVacio("html", { html: "<div class='x'></div>", notaPdf: "" })).toBe(false);
    expect(moduloVacio("tabla", { intro: "", columnas: [], filas: [] })).toBe(true);
  });

  it("los avisos guardados se leen sin confiar en su forma", () => {
    expect(leerHallazgos([{ tipo: "cliente", texto: "REMPRO", veces: 2 }, { tipo: "raro", texto: "x" }, null, "x"])).toEqual([
      { tipo: "cliente", texto: "REMPRO", veces: 2 },
    ]);
    expect(leerHallazgos(null)).toEqual([]);
  });
});

describe("«Adaptar a esta empresa»", () => {
  const segs = extraerTextos(HTML_REMPRO);
  const id = (t: string) => segs.find((s) => s.texto === t)!.id;

  it("el pedido lleva las dos empresas y los textos numerados — nunca el HTML", () => {
    const pedido = armarPedidoDeAdaptacion(
      { clienteNuevo: "Acme", clienteOrigen: "REMPRO", propuesta: "[hero] Acme ordena su venta" },
      segs,
    );
    expect(pedido).toContain("EMPRESA NUEVA: Acme");
    expect(pedido).toContain("EMPRESA PARA LA QUE SE ARMÓ: REMPRO");
    expect(pedido).toContain(JSON.stringify({ id: id("Arquitectura de REMPRO"), t: "Arquitectura de REMPRO" }));
    expect(pedido).not.toContain("<h2>");
    expect(pedido).not.toContain("<script>");
  });

  it("⛔ descarta ids que no existen, textos iguales y textos con etiquetas", () => {
    const respuesta = "```json\n" + JSON.stringify({
      cambios: [
        { id: id("Arquitectura de REMPRO"), texto: "Arquitectura de Acme" },
        { id: 999, texto: "inventado" },
        { id: id("Grupo Rempro conecta su ERP"), texto: "Grupo Rempro conecta su ERP" },
        { id: id("Inversión: USD 12,500 en cinco pagos."), texto: "<b>Inversión</b>" },
      ],
      notas: ["Revisa el monto: es de REMPRO."],
    }) + "\n```";
    const p = leerRespuestaDeAdaptacion(respuesta, segs);
    expect(p.cambios.map((c) => c.despues)).toEqual(["Arquitectura de Acme"]);
    expect(p.notas).toEqual(["Revisa el monto: es de REMPRO."]);
  });

  it("marca el voseo en vez de aplicarlo callado", () => {
    const p = leerRespuestaDeAdaptacion(JSON.stringify({ cambios: [{ id: 0, texto: "Ahora podés vender más" }] }), segs);
    expect(p.cambios[0].aviso).toMatch(/voseo/);
  });

  it("una respuesta que no es JSON no propone nada", () => {
    expect(leerRespuestaDeAdaptacion("no puedo", segs)).toEqual({ cambios: [], notas: [], sinRevisar: 0 });
  });

  it("⭐ aplicar lo elegido cambia solo esos textos y deja el diseño igual", () => {
    const p = leerRespuestaDeAdaptacion(
      JSON.stringify({
        cambios: [
          { id: id("Arquitectura de REMPRO"), texto: "Arquitectura de Acme" },
          { id: id("Grupo Rempro conecta su ERP"), texto: "Acme conecta su ERP" },
        ],
      }),
      segs,
    );
    const soloElPrimero = cambiosElegidos(p, new Set([id("Arquitectura de REMPRO")]));
    const nuevo = aplicarTextos(HTML_REMPRO, segs, soloElPrimero);
    expect(nuevo).toContain("<h2>Arquitectura de Acme</h2>");
    expect(nuevo).toContain('titulo: "Grupo Rempro conecta su ERP"'); // desmarcado: no cambia
    expect(nuevo.replace("Acme", "REMPRO")).toBe(HTML_REMPRO);
  });

  it("lo que no entra en el pedido se cuenta, no se pierde en silencio", () => {
    const muchos = Array.from({ length: 3000 }, (_, i) => ({
      id: i, texto: `Texto número ${i} con varias palabras`, donde: "texto" as const, inicio: i, fin: i + 1,
    }));
    const { entran, sinRevisar } = segmentosDelPedido(muchos);
    expect(entran.length).toBeLessThan(3000);
    expect(entran.length + sinRevisar).toBe(3000);
  });

  it("el contexto de la propuesta sale de la portada y los dolores, nunca de la Inversión", () => {
    const r = resumenDeLaPropuesta([
      { key: "hero", data: { headline: "Acme ordena su venta", coverImageUrl: "https://x/y.png", __lang: "es" } },
      { key: "dolores", data: { items: [{ title: "Leads perdidos", detail: "Nadie los sigue" }] } },
      { key: "inversion", data: { lineas: [{ concepto: "Implementación", monto: "USD 9.000" }] } },
    ]);
    expect(r).toContain("Acme ordena su venta");
    expect(r).toContain("Leads perdidos");
    expect(r).not.toContain("9.000");
    expect(r).not.toContain("https://");
  });
});
