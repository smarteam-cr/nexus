import { describe, it, expect } from "vitest";
import {
  reglaParaCobro,
  devengarComisiones,
  periodoDeFecha,
  quincenaDePagoDeComision,
  periodoSiguiente,
  finDeMesISO,
  POLITICAS_PAGO_COMISION,
  POLITICA_PAGO_COMISION,
  POLITICA_PAGO_COMISION_LABEL,
  type ReglaComision,
  type CobroComisionable,
} from "./comisiones";

const regla = (p: Partial<ReglaComision> & { id: string }): ReglaComision => ({
  teamMemberId: "tm-marco",
  vendedorNombre: "Marco",
  clientId: null,
  porcentaje: 10,
  vigenteDesde: "2026-01-01",
  vigenteHasta: null,
  ...p,
});

const cobro = (p: Partial<CobroComisionable> & { id: string }): CobroComisionable => ({
  clientId: "cli-1",
  clienteNombre: "Wherex",
  fechaCobro: "2026-03-10",
  monto: 1000,
  moneda: "USD",
  ...p,
});

describe("reglaParaCobro — la más específica gana", () => {
  it("R1 · sin reglas devuelve null (sin regla no hay comisión, no hay default)", () => {
    expect(reglaParaCobro([], "cli-1", "2026-03-10")).toBeNull();
  });

  it("R2 · la regla general aplica cuando no hay una del cliente", () => {
    const r = reglaParaCobro([regla({ id: "a" })], "cli-1", "2026-03-10");
    expect(r?.id).toBe("a");
  });

  it("R3 · la del cliente le gana a la general aunque la general sea más nueva", () => {
    const r = reglaParaCobro(
      [
        regla({ id: "general", vigenteDesde: "2026-03-01", porcentaje: 5 }),
        regla({ id: "delCliente", clientId: "cli-1", vigenteDesde: "2026-01-01", porcentaje: 13 }),
      ],
      "cli-1",
      "2026-03-10",
    );
    expect(r?.id).toBe("delCliente");
    expect(r?.porcentaje).toBe(13);
  });

  it("R4 · la regla de OTRO cliente no aplica: cae a la general", () => {
    const r = reglaParaCobro(
      [regla({ id: "general" }), regla({ id: "otro", clientId: "cli-9", porcentaje: 30 })],
      "cli-1",
      "2026-03-10",
    );
    expect(r?.id).toBe("general");
  });

  it("R5 · entre dos de la misma especificidad manda la de vigenteDesde más reciente", () => {
    const r = reglaParaCobro(
      [
        regla({ id: "vieja", vigenteDesde: "2026-01-01", porcentaje: 8 }),
        regla({ id: "nueva", vigenteDesde: "2026-03-01", porcentaje: 12 }),
      ],
      "cli-1",
      "2026-03-10",
    );
    expect(r?.porcentaje).toBe(12);
  });

  it("R6 · una regla que todavía no arrancó no aplica", () => {
    expect(reglaParaCobro([regla({ id: "a", vigenteDesde: "2026-04-01" })], "cli-1", "2026-03-10")).toBeNull();
  });

  it("R7 · una regla vencida no aplica; el borde (hasta === fecha) SÍ", () => {
    const vencida = [regla({ id: "a", vigenteHasta: "2026-03-09" })];
    expect(reglaParaCobro(vencida, "cli-1", "2026-03-10")).toBeNull();
    const alBorde = [regla({ id: "a", vigenteHasta: "2026-03-10" })];
    expect(reglaParaCobro(alBorde, "cli-1", "2026-03-10")?.id).toBe("a");
  });

  it("R8 · el borde de arranque (desde === fecha) SÍ aplica", () => {
    expect(reglaParaCobro([regla({ id: "a", vigenteDesde: "2026-03-10" })], "cli-1", "2026-03-10")?.id).toBe("a");
  });

  it("R9 · con la del cliente VENCIDA cae a la general vigente, no a nada", () => {
    const r = reglaParaCobro(
      [
        regla({ id: "general", porcentaje: 5 }),
        regla({ id: "delCliente", clientId: "cli-1", vigenteHasta: "2026-02-01", porcentaje: 13 }),
      ],
      "cli-1",
      "2026-03-10",
    );
    expect(r?.id).toBe("general");
  });

  it("R10 · el desempate es estable: mismo input, misma regla", () => {
    const reglas = [
      regla({ id: "aaa", vigenteDesde: "2026-01-01" }),
      regla({ id: "zzz", vigenteDesde: "2026-01-01" }),
    ];
    const uno = reglaParaCobro(reglas, "cli-1", "2026-03-10")?.id;
    const dos = reglaParaCobro([...reglas].reverse(), "cli-1", "2026-03-10")?.id;
    expect(uno).toBe(dos);
  });
});

describe("devengarComisiones — lo devengado sale de los cobros, no de una fila", () => {
  it("D1 · sin reglas no devenga nada (nunca se inventa un porcentaje)", () => {
    expect(devengarComisiones([cobro({ id: "c1" })], [])).toEqual([]);
  });

  it("D2 · el caso simple: 10% de 1.000 son 100", () => {
    const [d] = devengarComisiones([cobro({ id: "c1" })], [regla({ id: "r" })]);
    expect(d.base).toBe(1000);
    expect(d.monto).toBe(100);
    expect(d.porcentaje).toBe(10);
    expect(d.periodo).toBe("2026-03");
    expect(d.cobroIds).toEqual(["c1"]);
  });

  it("D3 · CRC y USD NO se suman: una persona con las dos monedas devenga dos comisiones", () => {
    const res = devengarComisiones(
      [
        cobro({ id: "c1", monto: 1000, moneda: "USD" }),
        cobro({ id: "c2", monto: 500000, moneda: "CRC" }),
      ],
      [regla({ id: "r" })],
    );
    expect(res).toHaveLength(2);
    expect(res.map((r) => r.moneda).sort()).toEqual(["CRC", "USD"]);
    expect(res.find((r) => r.moneda === "CRC")!.monto).toBe(50000);
  });

  it("D4 · agrupa por período: dos meses son dos comisiones", () => {
    const res = devengarComisiones(
      [cobro({ id: "c1", fechaCobro: "2026-03-10" }), cobro({ id: "c2", fechaCobro: "2026-04-02" })],
      [regla({ id: "r" })],
    );
    expect(res.map((r) => r.periodo)).toEqual(["2026-04", "2026-03"]);
  });

  it("D5 · dos vendedores con reglas distintas no se mezclan", () => {
    const res = devengarComisiones(
      [cobro({ id: "c1", clientId: "cli-1" }), cobro({ id: "c2", clientId: "cli-2" })],
      [
        regla({ id: "r1", clientId: "cli-1", teamMemberId: "tm-a", vendedorNombre: "Ana" }),
        regla({ id: "r2", clientId: "cli-2", teamMemberId: "tm-b", vendedorNombre: "Beto" }),
      ],
    );
    expect(res).toHaveLength(2);
    expect(res.map((r) => r.vendedorNombre).sort()).toEqual(["Ana", "Beto"]);
  });

  it("D6 · un cobro ya liquidado no se devenga de nuevo", () => {
    const cobros = [cobro({ id: "c1" }), cobro({ id: "c2" })];
    const res = devengarComisiones(cobros, [regla({ id: "r" })], new Set(["c1"]));
    expect(res[0].cobroIds).toEqual(["c2"]);
    expect(res[0].monto).toBe(100);
  });

  it("D7 · liquidar TODO deja el grupo fuera, no en cero", () => {
    const res = devengarComisiones([cobro({ id: "c1" })], [regla({ id: "r" })], new Set(["c1"]));
    expect(res).toEqual([]);
  });

  it("D8 · el redondeo es POR COBRO, así la suma del detalle es la que se paga", () => {
    // 3 cobros de 33.33 al 13% → 4.33 cada uno (4.3329 redondeado) = 12.99.
    // Sumando primero y redondeando al final darían 13.00: el detalle no cerraría.
    const res = devengarComisiones(
      [
        cobro({ id: "c1", monto: 33.33 }),
        cobro({ id: "c2", monto: 33.33 }),
        cobro({ id: "c3", monto: 33.33 }),
      ],
      [regla({ id: "r", porcentaje: 13 })],
    );
    expect(res[0].monto).toBe(12.99);
    expect(res[0].base).toBe(99.99);
  });

  it("D9 · con un solo porcentaje, porcentajesDistintos es 1 y el porcentaje es exacto", () => {
    const res = devengarComisiones([cobro({ id: "c1" }), cobro({ id: "c2" })], [regla({ id: "r", porcentaje: 7.5 })]);
    expect(res[0].porcentajesDistintos).toBe(1);
    expect(res[0].porcentaje).toBe(7.5);
  });

  it("D10 · si la regla cambió a mitad de período, el porcentaje es el efectivo y se declara", () => {
    const res = devengarComisiones(
      [
        cobro({ id: "c1", clientId: "cli-1", monto: 1000 }),
        cobro({ id: "c2", clientId: "cli-2", monto: 1000 }),
      ],
      [
        regla({ id: "r1", clientId: "cli-1", porcentaje: 10 }),
        regla({ id: "r2", clientId: "cli-2", porcentaje: 20 }),
      ],
    );
    expect(res[0].porcentajesDistintos).toBe(2);
    expect(res[0].monto).toBe(300);
    expect(res[0].porcentaje).toBe(15); // efectivo: 300 de 2000
  });

  it("D11 · un cobro sin regla vigente ese día no entra, aunque la persona tenga otras", () => {
    const res = devengarComisiones(
      [cobro({ id: "viejo", fechaCobro: "2026-01-05" }), cobro({ id: "nuevo", fechaCobro: "2026-03-10" })],
      [regla({ id: "r", vigenteDesde: "2026-02-01" })],
    );
    expect(res).toHaveLength(1);
    expect(res[0].cobroIds).toEqual(["nuevo"]);
  });

  it("D12 · un monto en cero o negativo no devenga", () => {
    expect(devengarComisiones([cobro({ id: "c1", monto: 0 })], [regla({ id: "r" })])).toEqual([]);
    expect(devengarComisiones([cobro({ id: "c1", monto: -50 })], [regla({ id: "r" })])).toEqual([]);
  });

  it("D13 · el detalle va ordenado por fecha y trae con qué explicarse solo", () => {
    const res = devengarComisiones(
      [
        cobro({ id: "c2", fechaCobro: "2026-03-20", clienteNombre: "Honda" }),
        cobro({ id: "c1", fechaCobro: "2026-03-05", clienteNombre: "Wherex" }),
      ],
      [regla({ id: "r" })],
    );
    expect(res[0].detalle.map((d) => d.clienteNombre)).toEqual(["Wherex", "Honda"]);
    expect(res[0].detalle[0]).toMatchObject({ cobroId: "c1", fechaCobro: "2026-03-05", monto: 1000 });
  });

  it("D14 · el reloj es fechaCobro (cuándo entró la plata), no la fecha programada", () => {
    // Un cobro programado en febrero que entró en marzo se paga con la planilla
    // de marzo, no con la de febrero.
    const res = devengarComisiones([cobro({ id: "c1", fechaCobro: "2026-03-01" })], [regla({ id: "r" })]);
    expect(res[0]).toMatchObject({ periodo: "2026-03", quincena: 2, fechaPago: "2026-03-31" });
  });

  it("D15 · dos cobros del MISMO mes en planillas distintas son DOS grupos", () => {
    // La corrección de Alexander en una línea: el 31 de marzo ya no alcanza la
    // planilla de marzo, así que su comisión NO puede ir en la misma línea que
    // la del 10. Agrupar por mes de devengo las juntaba y prometía un pago que
    // la planilla no podía hacer.
    const res = devengarComisiones(
      [
        cobro({ id: "c1", fechaCobro: "2026-03-10" }),
        cobro({ id: "c2", fechaCobro: "2026-03-31" }),
      ],
      [regla({ id: "r" })],
    );
    expect(res).toHaveLength(2);
    expect(res.map((d) => d.fechaPago).sort()).toEqual(["2026-03-31", "2026-04-30"]);
    expect(res.find((d) => d.fechaPago === "2026-03-31")!.cobroIds).toEqual(["c1"]);
    expect(res.find((d) => d.fechaPago === "2026-04-30")!.cobroIds).toEqual(["c2"]);
  });

  it("D16 · el último día del mes NO se paga ese mismo día (es el SIGUIENTE 30)", () => {
    // 17 de los 101 cobros reales caen el último día de su mes: con «mismo mes»
    // la comisión se programaría el día en que entró la plata.
    const res = devengarComisiones([cobro({ id: "c1", fechaCobro: "2026-04-30" })], [regla({ id: "r" })]);
    expect(res[0].fechaPago).toBe("2026-05-31");
  });
});

describe("periodoDeFecha", () => {
  it("P1 · corta el ISO al mes", () => {
    expect(periodoDeFecha("2026-08-14")).toBe("2026-08");
    expect(periodoDeFecha("2026-12-31")).toBe("2026-12");
  });
});

describe("quincenaDePagoDeComision — CUÁNDO se paga (política aislada)", () => {
  it("Q1 · el default es el SIGUIENTE fin de mes después de que el cliente pague", () => {
    // La regla de Alexander: «los pagos de comisiones se hacen los 30 de acuerdo
    // al pago de los clientes». Elías: «el siguiente 30 después de que pague».
    expect(quincenaDePagoDeComision("2026-03-10")).toEqual({
      periodo: "2026-03",
      quincena: 2,
      fechaProgramada: "2026-03-31",
    });
  });

  it("Q2 · ESTRICTAMENTE posterior: el último día del mes salta al siguiente", () => {
    // El caso que hace que esto NO sea la vieja «Q2_MISMO_MES»: pagar la
    // comisión el mismo día en que entró la plata no es «el SIGUIENTE 30».
    expect(quincenaDePagoDeComision("2026-04-30").fechaProgramada).toBe("2026-05-31");
    expect(quincenaDePagoDeComision("2026-03-31").fechaProgramada).toBe("2026-04-30");
  });

  it("Q3 · un cobro del 30 en un mes de 31 días SÍ alcanza ese mes", () => {
    // No es una excepción: el 31 todavía es «el siguiente 30» respecto del 30.
    expect(quincenaDePagoDeComision("2026-03-30").fechaProgramada).toBe("2026-03-31");
  });

  it("Q4 · diciembre salta de año", () => {
    expect(quincenaDePagoDeComision("2026-12-31")).toEqual({
      periodo: "2027-01",
      quincena: 2,
      fechaProgramada: "2027-01-31",
    });
  });

  it("Q5 · «siguiente quincena» usa el 15 cuando el cobro entra antes", () => {
    expect(quincenaDePagoDeComision("2026-03-05", "SIGUIENTE_QUINCENA")).toEqual({
      periodo: "2026-03",
      quincena: 1,
      fechaProgramada: "2026-03-15",
    });
    expect(quincenaDePagoDeComision("2026-03-15", "SIGUIENTE_QUINCENA").quincena).toBe(2);
    expect(quincenaDePagoDeComision("2026-03-31", "SIGUIENTE_QUINCENA")).toEqual({
      periodo: "2026-04",
      quincena: 1,
      fechaProgramada: "2026-04-15",
    });
  });

  it("Q6 · «fin del mes siguiente» siempre deja un mes de colchón", () => {
    expect(quincenaDePagoDeComision("2026-03-01", "FIN_DE_MES_SIGUIENTE").fechaProgramada).toBe(
      "2026-04-30",
    );
  });

  it("Q7 · las 3 políticas están etiquetadas (una sin label sale vacía en pantalla)", () => {
    for (const p of POLITICAS_PAGO_COMISION) {
      expect(POLITICA_PAGO_COMISION_LABEL[p]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("Q8 · la política vigente es una de las declaradas", () => {
    expect(POLITICAS_PAGO_COMISION).toContain(POLITICA_PAGO_COMISION);
  });

  it("Q9 · un período basura no revienta ni inventa un mes", () => {
    expect(periodoSiguiente("no-es-un-periodo")).toBe("no-es-un-periodo");
    expect(periodoSiguiente("2026-13")).toBe("2026-13");
  });
});

describe("finDeMesISO — el «30» de cada mes, sin Date", () => {
  it("F1 · los meses de 30 y 31, y febrero bisiesto y común", () => {
    expect(finDeMesISO("2026-01")).toBe("2026-01-31");
    expect(finDeMesISO("2026-04")).toBe("2026-04-30");
    expect(finDeMesISO("2026-02")).toBe("2026-02-28");
    expect(finDeMesISO("2028-02")).toBe("2028-02-29");
    // El siglo que NO es bisiesto y el que sí — la regla completa, no la mitad.
    expect(finDeMesISO("2100-02")).toBe("2100-02-28");
    expect(finDeMesISO("2000-02")).toBe("2000-02-29");
  });
});

describe("periodoSiguiente", () => {
  it("P2 · avanza un mes y rellena el cero", () => {
    expect(periodoSiguiente("2026-01")).toBe("2026-02");
    expect(periodoSiguiente("2026-08")).toBe("2026-09");
    expect(periodoSiguiente("2026-09")).toBe("2026-10");
  });
});
