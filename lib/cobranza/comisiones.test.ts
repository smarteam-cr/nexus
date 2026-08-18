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
  servicioId: null,
  porcentaje: 10,
  vigenteDesde: "2026-01-01",
  vigenteHasta: null,
  ...p,
});

/**
 * El cobro por defecto viene CON la venta atribuida a Marco, que es el dueño de
 * la `regla` por defecto. Antes no hacía falta —la regla decidía sola a quién se
 * le pagaba— y desde el 2026-08-17 la atribución es lo que manda: sin ella
 * ningún caso devengaría y los tests probarían el vacío.
 */
const cobro = (p: Partial<CobroComisionable> & { id: string }): CobroComisionable => ({
  clientId: "cli-1",
  clienteNombre: "Wherex",
  fechaCobro: "2026-03-10",
  monto: 1000,
  moneda: "USD",
  servicioId: "svc-1",
  servicioNombre: "Implementación",
  vendedorTeamMemberId: "tm-marco",
  vendedorNombre: "Marco",
  comisiona: true,
  ...p,
});

/** Atajo: casi todos los casos miran solo lo devengado. */
const devengar = (...args: Parameters<typeof devengarComisiones>) =>
  devengarComisiones(...args).devengadas;

describe("reglaParaCobro — la más específica gana", () => {
  it("R1 · sin reglas devuelve null (sin regla no hay comisión, no hay default)", () => {
    expect(reglaParaCobro([], cobro({ id: "c", clientId: "cli-1" }), "2026-03-10")).toBeNull();
  });

  it("R2 · la regla general aplica cuando no hay una del cliente", () => {
    const r = reglaParaCobro([regla({ id: "a" })], cobro({ id: "c", clientId: "cli-1" }), "2026-03-10");
    expect(r?.id).toBe("a");
  });

  it("R3 · la del cliente le gana a la general aunque la general sea más nueva", () => {
    const r = reglaParaCobro(
      [
        regla({ id: "general", vigenteDesde: "2026-03-01", porcentaje: 5 }),
        regla({ id: "delCliente", clientId: "cli-1", vigenteDesde: "2026-01-01", porcentaje: 13 }),
      ],
      cobro({ id: "c", clientId: "cli-1" }),
      "2026-03-10",
    );
    expect(r?.id).toBe("delCliente");
    expect(r?.porcentaje).toBe(13);
  });

  it("R4 · la regla de OTRO cliente no aplica: cae a la general", () => {
    const r = reglaParaCobro(
      [regla({ id: "general" }), regla({ id: "otro", clientId: "cli-9", porcentaje: 30 })],
      cobro({ id: "c", clientId: "cli-1" }),
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
      cobro({ id: "c", clientId: "cli-1" }),
      "2026-03-10",
    );
    expect(r?.porcentaje).toBe(12);
  });

  it("R6 · una regla que todavía no arrancó no aplica", () => {
    expect(reglaParaCobro([regla({ id: "a", vigenteDesde: "2026-04-01" })], cobro({ id: "c", clientId: "cli-1" }), "2026-03-10")).toBeNull();
  });

  it("R7 · una regla vencida no aplica; el borde (hasta === fecha) SÍ", () => {
    const vencida = [regla({ id: "a", vigenteHasta: "2026-03-09" })];
    expect(reglaParaCobro(vencida, cobro({ id: "c", clientId: "cli-1" }), "2026-03-10")).toBeNull();
    const alBorde = [regla({ id: "a", vigenteHasta: "2026-03-10" })];
    expect(reglaParaCobro(alBorde, cobro({ id: "c", clientId: "cli-1" }), "2026-03-10")?.id).toBe("a");
  });

  it("R8 · el borde de arranque (desde === fecha) SÍ aplica", () => {
    expect(reglaParaCobro([regla({ id: "a", vigenteDesde: "2026-03-10" })], cobro({ id: "c", clientId: "cli-1" }), "2026-03-10")?.id).toBe("a");
  });

  it("R9 · con la del cliente VENCIDA cae a la general vigente, no a nada", () => {
    const r = reglaParaCobro(
      [
        regla({ id: "general", porcentaje: 5 }),
        regla({ id: "delCliente", clientId: "cli-1", vigenteHasta: "2026-02-01", porcentaje: 13 }),
      ],
      cobro({ id: "c", clientId: "cli-1" }),
      "2026-03-10",
    );
    expect(r?.id).toBe("general");
  });

  it("R10 · el desempate es estable: mismo input, misma regla", () => {
    const reglas = [
      regla({ id: "aaa", vigenteDesde: "2026-01-01" }),
      regla({ id: "zzz", vigenteDesde: "2026-01-01" }),
    ];
    const uno = reglaParaCobro(reglas, cobro({ id: "c", clientId: "cli-1" }), "2026-03-10")?.id;
    const dos = reglaParaCobro([...reglas].reverse(), cobro({ id: "c", clientId: "cli-1" }), "2026-03-10")?.id;
    expect(uno).toBe(dos);
  });
});

describe("devengarComisiones — lo devengado sale de los cobros, no de una fila", () => {
  it("D1 · sin reglas no devenga nada (nunca se inventa un porcentaje)", () => {
    expect(devengar([cobro({ id: "c1" })], [])).toEqual([]);
  });

  it("D2 · el caso simple: 10% de 1.000 son 100", () => {
    const [d] = devengar([cobro({ id: "c1" })], [regla({ id: "r" })]);
    expect(d.base).toBe(1000);
    expect(d.monto).toBe(100);
    expect(d.porcentaje).toBe(10);
    expect(d.periodo).toBe("2026-03");
    expect(d.cobroIds).toEqual(["c1"]);
  });

  it("D3 · CRC y USD NO se suman: una persona con las dos monedas devenga dos comisiones", () => {
    const res = devengar(
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
    const res = devengar(
      [cobro({ id: "c1", fechaCobro: "2026-03-10" }), cobro({ id: "c2", fechaCobro: "2026-04-02" })],
      [regla({ id: "r" })],
    );
    expect(res.map((r) => r.periodo)).toEqual(["2026-04", "2026-03"]);
  });

  it("D5 · a cada quien lo que VENDIÓ: dos ventas atribuidas a dos personas", () => {
    // ⚠ Reescrito el 2026-08-17. Antes este caso daba dos vendedores con dos
    // reglas por cliente distintas, o sea afirmaba que la REGLA decide a quién
    // se le paga. Ahora lo decide la venta: la regla solo pone el porcentaje.
    const res = devengar(
      [
        cobro({ id: "c1", servicioId: "svc-a", vendedorTeamMemberId: "tm-a", vendedorNombre: "Ana" }),
        cobro({ id: "c2", servicioId: "svc-b", vendedorTeamMemberId: "tm-b", vendedorNombre: "Beto" }),
      ],
      [
        regla({ id: "r1", teamMemberId: "tm-a", vendedorNombre: "Ana" }),
        regla({ id: "r2", teamMemberId: "tm-b", vendedorNombre: "Beto" }),
      ],
    );
    expect(res).toHaveLength(2);
    expect(res.map((r) => r.vendedorNombre).sort()).toEqual(["Ana", "Beto"]);
  });

  it("D5b · el MISMO cliente con dos ventas de dos personas se reparte bien", () => {
    // El caso real que el modelo viejo no podía expresar: hay 9 clientes con más
    // de un servicio, y con la regla por cliente el primero que tuviera regla se
    // llevaba todo lo que ese cliente pagara, para siempre.
    const res = devengar(
      [
        cobro({ id: "c1", clientId: "cli-1", servicioId: "svc-a", vendedorTeamMemberId: "tm-a", vendedorNombre: "Ana" }),
        cobro({ id: "c2", clientId: "cli-1", servicioId: "svc-b", vendedorTeamMemberId: "tm-b", vendedorNombre: "Beto" }),
      ],
      [
        regla({ id: "r1", teamMemberId: "tm-a", vendedorNombre: "Ana", porcentaje: 10 }),
        regla({ id: "r2", teamMemberId: "tm-b", vendedorNombre: "Beto", porcentaje: 5 }),
      ],
    );
    expect(res).toHaveLength(2);
    expect(res.find((r) => r.vendedorNombre === "Ana")!.monto).toBe(100);
    expect(res.find((r) => r.vendedorNombre === "Beto")!.monto).toBe(50);
  });

  it("D6 · un cobro ya liquidado no se devenga de nuevo", () => {
    const cobros = [cobro({ id: "c1" }), cobro({ id: "c2" })];
    const res = devengar(cobros, [regla({ id: "r" })], new Set(["c1"]));
    expect(res[0].cobroIds).toEqual(["c2"]);
    expect(res[0].monto).toBe(100);
  });

  it("D7 · liquidar TODO deja el grupo fuera, no en cero", () => {
    const res = devengar([cobro({ id: "c1" })], [regla({ id: "r" })], new Set(["c1"]));
    expect(res).toEqual([]);
  });

  it("D8 · el redondeo es POR COBRO, así la suma del detalle es la que se paga", () => {
    // 3 cobros de 33.33 al 13% → 4.33 cada uno (4.3329 redondeado) = 12.99.
    // Sumando primero y redondeando al final darían 13.00: el detalle no cerraría.
    const res = devengar(
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
    const res = devengar([cobro({ id: "c1" }), cobro({ id: "c2" })], [regla({ id: "r", porcentaje: 7.5 })]);
    expect(res[0].porcentajesDistintos).toBe(1);
    expect(res[0].porcentaje).toBe(7.5);
  });

  it("D10 · si la regla cambió a mitad de período, el porcentaje es el efectivo y se declara", () => {
    const res = devengar(
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
    const res = devengar(
      [cobro({ id: "viejo", fechaCobro: "2026-01-05" }), cobro({ id: "nuevo", fechaCobro: "2026-03-10" })],
      [regla({ id: "r", vigenteDesde: "2026-02-01" })],
    );
    expect(res).toHaveLength(1);
    expect(res[0].cobroIds).toEqual(["nuevo"]);
  });

  it("D12 · un monto en cero o negativo no devenga", () => {
    expect(devengar([cobro({ id: "c1", monto: 0 })], [regla({ id: "r" })])).toEqual([]);
    expect(devengar([cobro({ id: "c1", monto: -50 })], [regla({ id: "r" })])).toEqual([]);
  });

  it("D13 · el detalle va ordenado por fecha y trae con qué explicarse solo", () => {
    const res = devengar(
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
    const res = devengar([cobro({ id: "c1", fechaCobro: "2026-03-01" })], [regla({ id: "r" })]);
    expect(res[0]).toMatchObject({ periodo: "2026-03", quincena: 2, fechaPago: "2026-03-31" });
  });

  it("D15 · dos cobros del MISMO mes en planillas distintas son DOS grupos", () => {
    // La corrección de Alexander en una línea: el 31 de marzo ya no alcanza la
    // planilla de marzo, así que su comisión NO puede ir en la misma línea que
    // la del 10. Agrupar por mes de devengo las juntaba y prometía un pago que
    // la planilla no podía hacer.
    const res = devengar(
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
    const res = devengar([cobro({ id: "c1", fechaCobro: "2026-04-30" })], [regla({ id: "r" })]);
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

describe("devengarComisiones · la venta decide a quién se le paga (2026-08-17)", () => {
  it("A1 · sin vendedor atribuido NO devenga, y NO cae a la regla del cliente", () => {
    // ⚠ ESTE es el bug que se cerró. Antes, la regla del cliente decidía sola:
    // quien tuviera regla para ese cliente cobraba todo lo que el cliente pagara,
    // para siempre, aunque la venta la hubiera ganado otro. Si alguien "arregla"
    // la pantalla vacía agregando un fallback acá, el bug vuelve entero.
    const { devengadas, sinComisionar } = devengarComisiones(
      [cobro({ id: "c1", vendedorTeamMemberId: null, vendedorNombre: null })],
      [regla({ id: "r", clientId: "cli-1" })],
    );
    expect(devengadas).toEqual([]);
    expect(sinComisionar).toHaveLength(1);
    expect(sinComisionar[0]).toMatchObject({ motivo: "SIN_VENDEDOR", monto: 1000 });
  });

  it("A2 · «no comisiona» es un estado PROPIO, distinto de «sin atribuir»", () => {
    // Elías: «el CEO es el director de ventas también, y a veces él no comisiona,
    // por eso debe validarse por el usuario el histórico de deals». Si fueran el
    // mismo estado, un deal ya revisado seguiría contando como trabajo pendiente
    // y el aviso de «faltan N por atribuir» nunca llegaría a cero.
    const { devengadas, sinComisionar } = devengarComisiones(
      [cobro({ id: "c1", comisiona: false })],
      [regla({ id: "r" })],
    );
    expect(devengadas).toEqual([]);
    expect(sinComisionar[0]!.motivo).toBe("NO_COMISIONA");
  });

  it("A3 · con vendedor pero sin regla vigente, el motivo lo distingue", () => {
    const { sinComisionar } = devengarComisiones(
      [cobro({ id: "c1", vendedorTeamMemberId: "tm-otro", vendedorNombre: "Otro" })],
      [regla({ id: "r", teamMemberId: "tm-marco" })],
    );
    expect(sinComisionar[0]!.motivo).toBe("SIN_REGLA");
  });

  it("A4 · la regla de OTRA persona no le paga a quien vendió", () => {
    // La regla ya no elige al cobrador: se filtra por la persona atribuida ANTES
    // de mirar especificidad.
    const { devengadas } = devengarComisiones(
      [cobro({ id: "c1", vendedorTeamMemberId: "tm-a", vendedorNombre: "Ana" })],
      [regla({ id: "r", teamMemberId: "tm-b", vendedorNombre: "Beto", porcentaje: 50 })],
    );
    expect(devengadas).toEqual([]);
  });

  it("A5 · una regla del DEAL le gana a la del cliente, aunque sea más vieja", () => {
    const { devengadas } = devengarComisiones(
      [cobro({ id: "c1", servicioId: "svc-1", clientId: "cli-1" })],
      [
        regla({ id: "delCliente", clientId: "cli-1", vigenteDesde: "2026-03-01", porcentaje: 10 }),
        regla({ id: "delDeal", servicioId: "svc-1", vigenteDesde: "2026-01-01", porcentaje: 20 }),
      ],
    );
    expect(devengadas[0]!.monto).toBe(200);
  });

  it("A6 · sin regla del deal cae a la del cliente, y sin ésa a la general", () => {
    const soloGeneral = devengarComisiones(
      [cobro({ id: "c1" })],
      [regla({ id: "gen", porcentaje: 7 })],
    ).devengadas;
    expect(soloGeneral[0]!.monto).toBe(70);

    const conCliente = devengarComisiones(
      [cobro({ id: "c1", clientId: "cli-1" })],
      [regla({ id: "gen", porcentaje: 7 }), regla({ id: "cli", clientId: "cli-1", porcentaje: 9 })],
    ).devengadas;
    expect(conCliente[0]!.monto).toBe(90);
  });

  it("A7 · lo no comisionado se agrupa por venta y moneda, con su total", () => {
    // Es lo que convierte un cero mudo en «faltan N ventas por atribuir, $X».
    const { sinComisionar } = devengarComisiones(
      [
        cobro({ id: "c1", servicioId: "svc-a", monto: 500, vendedorTeamMemberId: null, vendedorNombre: null }),
        cobro({ id: "c2", servicioId: "svc-a", monto: 300, vendedorTeamMemberId: null, vendedorNombre: null }),
        cobro({ id: "c3", servicioId: "svc-b", monto: 900, vendedorTeamMemberId: null, vendedorNombre: null }),
      ],
      [regla({ id: "r" })],
    );
    expect(sinComisionar).toHaveLength(2);
    // Ordenado por monto: la venta más cara primero, que es por donde se empieza.
    expect(sinComisionar[0]).toMatchObject({ servicioId: "svc-b", monto: 900, cobros: 1 });
    expect(sinComisionar[1]).toMatchObject({ servicioId: "svc-a", monto: 800, cobros: 2 });
  });
});
