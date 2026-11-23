/**
 * lib/exploraciones/lo-que-confirmo-el-equipo.test.ts — el corte de «Lo que confirmó el equipo» por alcance (etapa 1 del
 * plan maestro de «Hablar con Nexus», 23 nov). Correr: `npx vitest run lib/exploraciones/lo-que-confirmo-el-equipo.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import {
  bloqueDeLoQueConfirmoElEquipo,
  confirmadoParaLosCasos,
  esHechoParaElCliente,
  MAX_HECHOS_PARA_EL_CLIENTE,
  paraElAlcance,
  type NotaConfirmada,
} from "./lo-que-confirmo-el-equipo";

const S = (que: string) => `SECRETO-${que}`;

const nota = (o: Partial<NotaConfirmada> = {}): NotaConfirmada => ({
  clave: "sabido:1",
  texto: `Andrés me contó por WhatsApp que el presupuesto no pasa de US$ 15.000 ${S("texto")}`,
  autor: S("autor"),
  en: "2026-11-20T15:00:00.000Z",
  preventa: { id: "e1", archivada: false },
  hechos: [
    { tipo: "cuenta", tema: null, frase: "Crédito y cobro contacta a 4.800 clientes al mes" },
    { tipo: "acuerdo", tema: "integracion", frase: "Conectar WhatsApp a la bandeja de cobro" },
    { tipo: "persona", tema: null, frase: S("quien-decide") },
    { tipo: "queja", tema: null, frase: S("queja") },
    { tipo: "riesgo", tema: null, frase: S("riesgo") },
    { tipo: "resultado", tema: null, frase: `Bajar la mora con un descuento del 10 % ${S("negociacion")}` },
  ],
  ...o,
});

describe("⛔ el corte para el cliente", () => {
  it("cliente y handoff: sin el texto, sin el autor, sin personas, quejas, riesgos ni lo que trae un monto o una negociación", () => {
    for (const alcance of ["cliente", "sin-lo-interno"] as const) {
      const [n] = paraElAlcance([nota()], alcance);
      expect(n.texto, alcance).toBe("");
      expect(n.autor, alcance).toBeNull();
      expect(n.hechos.map((h) => h.tipo), alcance).toEqual(["cuenta", "acuerdo"]);
      const bloque = bloqueDeLoQueConfirmoElEquipo([nota()], alcance);
      expect(bloque.match(/SECRETO-[\w-]+/g) ?? [], alcance).toEqual([]);
      expect(bloque, alcance).not.toContain("15.000");
      expect(bloque, alcance).toContain("- De la cuenta: Crédito y cobro contacta a 4.800 clientes al mes");
      expect(bloque, alcance).toContain("- Acuerdo · Integración");
    }
  });

  it("una nota que se queda sin hechos para el cliente no llega", () => {
    const soloInterna = nota({ hechos: [{ tipo: "persona", tema: null, frase: S("quien-decide") }] });
    expect(paraElAlcance([soloInterna], "cliente")).toEqual([]);
    expect(bloqueDeLoQueConfirmoElEquipo([soloInterna], "cliente")).toBe("");
  });

  it("interno: todo, con el día, quién lo escribió y si la preventa está archivada", () => {
    const bloque = bloqueDeLoQueConfirmoElEquipo([nota({ preventa: { id: "e1", archivada: true } })], "interno");
    for (const s of ["texto", "autor", "quien-decide", "queja", "riesgo", "negociacion"]) expect(bloque, s).toContain(S(s));
    expect(bloque).toContain("[2026-11-20 · SECRETO-autor · preventa archivada]");
    expect(bloque).toContain("INTERNO");
  });

  it("al cliente, cada hecho una vez y con tope", () => {
    const muchas = Array.from({ length: 4 }, (_, i) =>
      nota({ clave: `sabido:${i}`, hechos: Array.from({ length: 6 }, (_, k) => ({ tipo: "cuenta", tema: null, frase: k === 0 ? "Usan Excel para cobrar" : `Dato ${i}-${k}` })) }),
    );
    const lineas = bloqueDeLoQueConfirmoElEquipo(muchas, "cliente").split("\n").filter((l) => l.startsWith("- "));
    expect(lineas.filter((l) => l.includes("Usan Excel para cobrar"))).toHaveLength(1);
    expect(lineas.length).toBe(MAX_HECHOS_PARA_EL_CLIENTE);
  });

  it("⛔ lo de la compra no pasa aunque venga como dato de la cuenta y sin la moneda pegada (revisión del 23 nov)", () => {
    for (const frase of [
      "El presupuesto aprobado es de 20 mil dólares",
      "Tienen un presupuesto de 15k para el proyecto",
      "El presupuesto no está aprobado hasta enero",
      "Pagan 300 mensuales de licencia",
      "Andrés Pérez, gerente de cobro, es quien firma",
      "Están cotizando también con la competencia",
      "El dueño no confía en el equipo de TI",
      "Facturan 2 millones al año",
      "Acordamos dejar el descuento para el segundo año",
    ]) {
      expect(esHechoParaElCliente({ tipo: "cuenta", tema: null, frase }), frase).toBe(false);
    }
    // Lo que describe a la empresa sigue pasando.
    for (const frase of ["Crédito y cobro contacta a 4.800 clientes al mes", "Cobran con un Excel compartido", "Atienden por WhatsApp y por correo"]) {
      expect(esHechoParaElCliente({ tipo: "cuenta", tema: null, frase }), frase).toBe(true);
    }
  });

  it("qué tipos pasan al cliente", () => {
    expect(esHechoParaElCliente({ tipo: "proceso_hoy", tema: null, frase: "Cobran por teléfono" })).toBe(true);
    expect(esHechoParaElCliente({ tipo: "senal_etapa", tema: null, frase: "Firmaron" })).toBe(false);
    expect(esHechoParaElCliente({ tipo: "cuenta", tema: null, frase: "Pagan US$ 300 al mes por la licencia" })).toBe(false);
  });
});

describe("para los casos de uso", () => {
  it("junta lo confirmado (cortado para el cliente) y lo aceptado; vacío si no hay nada", () => {
    const t = confirmadoParaLosCasos([nota()], "Lo que el cliente ACEPTÓ de su escala el 18 nov.");
    expect(t.match(/SECRETO-[\w-]+/g) ?? []).toEqual([]);
    expect(t).toContain("4.800 clientes al mes");
    expect(t).toContain("ACEPTÓ de su escala");
    expect(confirmadoParaLosCasos([], "")).toBe("");
  });
});
