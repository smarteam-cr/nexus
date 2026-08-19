/**
 * lib/ventas/respaldo-de-factura.test.ts
 *
 * Los casos de acá salieron de datos reales de 2026, no de ejemplos inventados: cuando el
 * reporte dijo "$131.064 facturados sin ninguna venta", la mitad resultó ser gente que sí
 * había comprado — por Shared Selling, o a nombre de la empresa madre. Estos casos fijan
 * esa distinción para que no se vuelva a leer como un hueco.
 */
import { describe, expect, it } from "vitest";
import { auditarRespaldoDeFactura, palabrasDistintivas, seParecen } from "./respaldo-de-factura";

const cliente = (nombre: string, facturado: number, cobrado = 0, clientId = nombre) => ({
  clientId,
  nombre,
  facturado,
  cobrado,
});

describe("palabras que distinguen a una empresa", () => {
  it("descarta las que están en todos los tratos", () => {
    // Si "Implementación" y "HubSpot" contaran, todos los tratos serían el mismo.
    expect(palabrasDistintivas("Implementación HubSpot - Multiquímica")).toEqual(["MULTIQUIMICA"]);
  });

  it("ignora las tildes: el CRM y cobranza no las escriben igual", () => {
    expect(palabrasDistintivas("Multiquímica")).toEqual(palabrasDistintivas("Multiquimica"));
  });

  it("descarta lo corto, que empareja cualquier cosa", () => {
    // "TEC" emparejaría con "Tecnoservicios", "Tecapro", "Bitec"... Mejor no proponer nada
    // que proponer basura: quien lea la lista tiene que poder confiar en ella.
    expect(palabrasDistintivas("TEC AE")).toEqual([]);
    expect(palabrasDistintivas("IIA S.A.")).toEqual([]);
  });

  it("no toma los números por nombre", () => {
    expect(palabrasDistintivas("Proyecto 2026 Colby")).toEqual(["COLBY"]);
  });
});

describe("seParecen", () => {
  it("el caso que motivó todo: la hija factura, el trato dice la madre", () => {
    expect(seParecen("Analisalab", "Grupo Inve - AnalisaLab - Proyecto de implementación")).toBe(true);
    expect(seParecen("Corrugando", "CORRUGANDO - CRM Implementation")).toBe(true);
  });

  it("dos empresas distintas del mismo rubro NO se parecen", () => {
    expect(seParecen("Iberorutas", "Implementación HubSpot - Multiquímica")).toBe(false);
  });

  it("EL RUIDO QUE MOTIVÓ LA REGLA: compartir una palabra genérica no es ser del mismo grupo", () => {
    // Con "una palabra en común" alcanzaba, y el panel llegó a proponer que Amvac Latam y
    // Forestales LATAM eran la misma empresa. Coincidían en "LATAM".
    expect(seParecen("Amvac Latam", "Sitio web - Forestales LATAM")).toBe(false);
    // Y la contraparte: el nombre entero del cliente adentro sí es evidencia.
    expect(seParecen("Amvac Latam", "AMVAC LATAM | CRECIMIENTO WEB")).toBe(true);
  });

  it("es asimétrico: el trato lleva el nombre del cliente y además adornos", () => {
    expect(seParecen("Corrugando", "CORRUGANDO - CRM Implementation")).toBe(true);
    // Al revés no: el cliente no tiene por qué llamarse como el servicio que compró.
    expect(seParecen("CORRUGANDO - CRM Implementation", "Corrugando")).toBe(false);
  });

  it("un nombre sin ninguna palabra distintiva no empareja con nada", () => {
    // Devolver false es la respuesta correcta: no hay evidencia, no hay propuesta.
    expect(seParecen("IIA", "IIA - Soporte")).toBe(false);
  });
});

describe("auditarRespaldoDeFactura", () => {
  it("separa 'no vendió nada' de 'vendió por un pipeline que no cuenta'", () => {
    const r = auditarRespaldoDeFactura(
      [cliente("Iberorutas", 15100, 5000), cliente("Wherex", 8500, 0)],
      [
        { nombre: "Iberorutas - Shared Selling", clientId: "Iberorutas", esVentaPropia: false },
        { nombre: "Wherex - Shared Selling", clientId: "Wherex", esVentaPropia: false },
      ],
    );
    expect(r.soloFueraDePipeline.cuantas).toBe(2);
    expect(r.soloFueraDePipeline.facturado).toBe(23600);
    // La caja va aparte de la factura: es lo que convierte esto en un argumento.
    expect(r.soloFueraDePipeline.cobrado).toBe(5000);
    expect(r.deGrupo.cuantas).toBe(0);
  });

  it("un cliente con venta propia no aparece, aunque también tenga una compartida", () => {
    const r = auditarRespaldoDeFactura(
      [cliente("Colby", 40000)],
      [
        { nombre: "Colby - Implementación", clientId: "Colby", esVentaPropia: true },
        { nombre: "Colby - Shared", clientId: "Colby", esVentaPropia: false },
      ],
    );
    expect(r.soloFueraDePipeline.cuantas).toBe(0);
    expect(r.deGrupo.cuantas).toBe(0);
  });

  it("detecta que la venta está a nombre de otra empresa del grupo", () => {
    const r = auditarRespaldoDeFactura(
      [cliente("Analisalab", 12500)],
      [{ nombre: "Grupo Inve - AnalisaLab - Proyecto", clientId: "INVE", esVentaPropia: true }],
    );
    expect(r.deGrupo.cuantas).toBe(1);
    expect(r.deGrupo.facturado).toBe(12500);
    expect(r.deGrupo.items[0]).toContain("Analisalab");
    expect(r.deGrupo.items[0]).toContain("Grupo Inve");
  });

  it("una venta huérfana NO se reporta como caso de grupo", () => {
    // Sin dueño, el problema es otro ("venta sin cliente") y se arregla de otra manera:
    // dar de alta la empresa, no ligar dos que ya existen.
    const r = auditarRespaldoDeFactura(
      [cliente("Amvac Latam", 9240)],
      [{ nombre: "AMVAC | CRECIMIENTO WEB", clientId: null, esVentaPropia: true }],
    );
    expect(r.deGrupo.cuantas).toBe(0);
  });

  it("un cliente que factura y de verdad no tiene ninguna venta no aparece en ningún lado", () => {
    // Ese es el hueco de verdad, y lo reporta otra cuenta. Acá su ausencia es la respuesta.
    const r = auditarRespaldoDeFactura([cliente("Fantasma", 5000)], []);
    expect(r.soloFueraDePipeline.cuantas).toBe(0);
    expect(r.deGrupo.cuantas).toBe(0);
  });

  it("ordena por plata: la lista es la agenda de la reunión", () => {
    const r = auditarRespaldoDeFactura(
      [cliente("Chico", 100), cliente("Grande", 90000), cliente("Medio", 5000)],
      ["Chico", "Grande", "Medio"].map((n) => ({ nombre: `${n} deal`, clientId: n, esVentaPropia: false })),
    );
    expect(r.soloFueraDePipeline.items.map((i) => i.split(" ·")[0])).toEqual(["Grande", "Medio", "Chico"]);
  });

  it("no inventa centavos al sumar", () => {
    const r = auditarRespaldoDeFactura(
      [cliente("A", 0.1), cliente("B", 0.2)],
      ["A", "B"].map((n) => ({ nombre: n, clientId: n, esVentaPropia: false })),
    );
    expect(r.soloFueraDePipeline.facturado).toBe(0.3);
  });
});
