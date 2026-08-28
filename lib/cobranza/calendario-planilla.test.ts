/**
 * lib/cobranza/calendario-planilla.test.ts
 *
 * El caso que motiva el módulo, textual del pedido: *"si se hace un aumento esta
 * quincena que viene, de aquí adelante debe mantenerse el aumento, pero hacia atrás
 * debe verse el monto antiguo"*.
 *
 * Los datos de abajo son los REALES de Alejandra Ortega al 2026-08-21: 17 quincenas
 * registradas a $500 y un aumento de $1.000 a $1.200 mensuales con fecha efectiva
 * 2026-08-31 — o sea, la Q2 de agosto.
 */
import { describe, expect, it } from "vitest";
import {
  calendarioDePersona,
  salarioVigenteEn,
  type MovimientoDeSalario,
  type PagoRegistrado,
} from "./calendario-planilla";
import { quincenasDelPeriodo } from "./planilla";

/**
 * ⚠ La fecha sale de `quincenasDelPeriodo`, NO de `${periodo}-30`. La primera versión
 * de este helper fabricaba "2026-02-30", que no existe — y el caso que lo cazó fue
 * justamente el que verifica que febrero cierra el 28.
 */
const pago = (periodo: string, quincena: 1 | 2, monto: number, estado = "PAGADO"): PagoRegistrado => {
  const fecha = quincenasDelPeriodo(periodo).find((q) => q.quincena === quincena)!.fechaProgramada;
  return {
    periodo,
    quincena,
    fechaProgramada: fecha,
    monto,
    moneda: "USD",
    estado,
    fechaPago: estado === "PAGADO" ? fecha : null,
  };
};

const mov = (
  fechaEfectiva: string,
  tipo: string,
  monto: number,
  montoAnterior: number | null = null,
): MovimientoDeSalario => ({ tipo, fechaEfectiva, monto, montoAnterior, moneda: "USD" });

/** Alejandra: ocho meses a $500 la quincena, y el aumento el 31 de agosto. */
const PAGOS_ALEJANDRA: PagoRegistrado[] = [
  ...["01", "02", "03", "04", "05", "06", "07"].flatMap((m) => [
    pago(`2026-${m}`, 1, 500),
    pago(`2026-${m}`, 2, 500),
  ]),
  pago("2026-08", 1, 500),
];
const MOVS_ALEJANDRA: MovimientoDeSalario[] = [
  mov("2026-07-12", "ALTA", 1000),
  mov("2026-08-31", "CAMBIO_MONTO", 1200, 1000),
];

describe("qué salario regía en una fecha", () => {
  it("antes del aumento, el viejo; desde la fecha efectiva, el nuevo", () => {
    expect(salarioVigenteEn(MOVS_ALEJANDRA, "2026-08-15")!.monto).toBe(1000);
    expect(salarioVigenteEn(MOVS_ALEJANDRA, "2026-08-30")!.monto).toBe(1000);
    // La fecha efectiva CUENTA desde ese mismo día.
    expect(salarioVigenteEn(MOVS_ALEJANDRA, "2026-08-31")!.monto).toBe(1200);
    expect(salarioVigenteEn(MOVS_ALEJANDRA, "2026-12-31")!.monto).toBe(1200);
  });

  it("sin ningún movimiento anterior devuelve null — no cero", () => {
    // El catálogo se sembró en julio de 2026: preguntar por marzo no tiene respuesta.
    // Un cero diría "ganaba nada", que es una afirmación distinta y falsa.
    expect(salarioVigenteEn(MOVS_ALEJANDRA, "2026-03-15")).toBeNull();
    expect(salarioVigenteEn([], "2026-08-15")).toBeNull();
  });

  it("una baja apaga el salario, y no lo pone en cero", () => {
    // Un cero se sumaría a los totales y diría que esa quincena costó nada.
    const m = [mov("2026-01-01", "ALTA", 1836), mov("2026-08-15", "BAJA", 1836)];
    expect(salarioVigenteEn(m, "2026-08-14")!.monto).toBe(1836);
    expect(salarioVigenteEn(m, "2026-08-16")).toBeNull();
  });

  it("LA ASIMETRÍA: la baja apaga DESPUÉS de su fecha, el aumento rige DESDE la suya", () => {
    // Datos reales de Lorena Osorio: baja el 2026-08-15, y esa quincena SÍ se le pagó —
    // está en el libro, $918. El último día trabajado se cobra.
    const lorena = [mov("2026-01-01", "ALTA", 1836), mov("2026-08-15", "BAJA", 1836)];
    expect(salarioVigenteEn(lorena, "2026-08-15")!.monto).toBe(1836);

    // El aumento de Alejandra, en cambio, es efectivo el 31 y esa quincena ya va con el
    // monto nuevo. Con el mismo borde para los dos, uno de los dos casos queda mal.
    expect(salarioVigenteEn(MOVS_ALEJANDRA, "2026-08-31")!.monto).toBe(1200);
  });

  it("una pausa apaga y una reactivación vuelve a encender", () => {
    const m = [
      mov("2026-01-01", "ALTA", 1200),
      mov("2026-06-01", "PAUSA", 1200),
      mov("2026-09-01", "REACTIVACION", 1200),
    ];
    expect(salarioVigenteEn(m, "2026-05-31")!.monto).toBe(1200);
    expect(salarioVigenteEn(m, "2026-07-01")).toBeNull();
    expect(salarioVigenteEn(m, "2026-09-01")!.monto).toBe(1200);
  });

  it("el orden de entrada no manda: manda la fecha efectiva", () => {
    // Las fechas efectivas son retroactivas — el aumento se registra el 18 y rige el 31.
    const desordenado = [mov("2026-08-31", "CAMBIO_MONTO", 1200, 1000), mov("2026-07-12", "ALTA", 1000)];
    expect(salarioVigenteEn(desordenado, "2026-12-01")!.monto).toBe(1200);
  });

  it("un tipo de movimiento desconocido NO cambia la plata en silencio", () => {
    const m = [mov("2026-01-01", "ALTA", 1000), mov("2026-06-01", "ALGO_NUEVO", 99_999)];
    expect(salarioVigenteEn(m, "2026-12-01")!.monto).toBe(1000);
  });
});

describe("el calendario del año", () => {
  const cal = calendarioDePersona(PAGOS_ALEJANDRA, MOVS_ALEJANDRA, 2026, "2026-08-21");

  it("EL CASO DEL PEDIDO: hacia atrás el monto viejo, hacia adelante el aumento", () => {
    const q = (periodo: string, quincena: number) =>
      cal.quincenas.find((x) => x.periodo === periodo && x.quincena === quincena)!;

    // Registrada: intocable, con el monto congelado del salario viejo.
    expect(q("2026-08", 1).clase).toBe("registrada");
    expect(q("2026-08", 1).monto).toBe(500);

    // Proyectada: el aumento del 31 ya rige → la mitad de $1.200.
    expect(q("2026-08", 2).clase).toBe("proyectada");
    expect(q("2026-08", 2).monto).toBe(600);
    expect(q("2026-08", 2).salarioMensual).toBe(1200);

    // Y se mantiene de ahí en adelante.
    expect(q("2026-12", 2).monto).toBe(600);
  });

  it("un aumento NO reescribe lo ya registrado", () => {
    // Es la razón de ser de la frontera: lo escrito es la verdad y no se toca.
    const registradas = cal.quincenas.filter((x) => x.clase === "registrada");
    expect(registradas).toHaveLength(15);
    expect(registradas.every((x) => x.monto === 500)).toBe(true);
  });

  it("siempre devuelve las 24 quincenas del año", () => {
    // Una fila que falta parece que el mes no existió; un hueco que se ve es un dato.
    expect(cal.quincenas).toHaveLength(24);
    expect(cal.quincenas.filter((x) => x.periodo === "2026-02")).toHaveLength(2);
  });

  it("las quincenas de febrero caen el 15 y el 28", () => {
    const feb = cal.quincenas.filter((x) => x.periodo === "2026-02");
    expect(feb.map((x) => x.fechaProgramada)).toEqual(["2026-02-15", "2026-02-28"]);
  });

  it("separa lo registrado de lo proyectado, y no los suma en un número solo", () => {
    // 15 registradas × $500 = $7.500 · 9 proyectadas × $600 = $5.400
    expect(cal.registradas).toBe(15);
    expect(cal.proyectadas).toBe(9);
    expect(cal.totalRegistrado).toBe(7_500);
    expect(cal.totalProyectado).toBe(5_400);
  });

  it("lista los cambios del año, para poder ver POR QUÉ cambia el monto", () => {
    expect(cal.cambios).toEqual([
      { fecha: "2026-07-12", de: null, a: 1000, tipo: "ALTA" },
      { fecha: "2026-08-31", de: 1000, a: 1200, tipo: "CAMBIO_MONTO" },
    ]);
  });

  it("marca qué quincenas ya pasaron según la fecha que ENTRA por parámetro", () => {
    const alPrincipio = calendarioDePersona(PAGOS_ALEJANDRA, MOVS_ALEJANDRA, 2026, "2026-03-01");
    expect(alPrincipio.quincenas.filter((x) => x.pasada)).toHaveLength(4);
    // Al 21 de agosto: las 14 de enero a julio, más la Q1 del 15 de agosto. La Q2 cae
    // el 31 y todavía no pasó.
    expect(cal.quincenas.filter((x) => x.pasada)).toHaveLength(15);
  });
});

describe("una persona que se fue", () => {
  it("sus quincenas posteriores a la baja no se proyectan", () => {
    // Lorena: baja el 2026-08-15. Proyectar septiembre diría que le seguimos pagando.
    const cal = calendarioDePersona(
      [pago("2026-08", 1, 918)],
      [mov("2026-01-01", "ALTA", 1836), mov("2026-08-15", "BAJA", 1836)],
      2026,
      "2026-08-21",
    );
    const sep = cal.quincenas.find((x) => x.periodo === "2026-09" && x.quincena === 1)!;
    expect(sep.monto).toBeNull();
    expect(sep.clase).toBe("fuera");
    expect(cal.totalProyectado).toBe(0);
  });

  it("EL CASO QUE CORRIGIÓ EL DISEÑO: lo pasado sin fila es un HUECO, no una proyección", () => {
    // La primera versión proyectaba cualquier quincena sin fila, incluidas las pasadas:
    // catorce quincenas de enero a julio que nadie anotó salían con $918 cada una y
    // sumaban $12.852 al total, como si se hubieran pagado. Eso tapa el problema en vez
    // de mostrarlo — y el módulo ya tenía la regla contraria escrita en `coberturaDe`.
    const cal = calendarioDePersona(
      [pago("2026-08", 1, 918)],
      [mov("2026-01-01", "ALTA", 1836), mov("2026-08-15", "BAJA", 1836)],
      2026,
      "2026-08-21",
    );
    expect(cal.faltantes).toBe(14);
    expect(cal.totalRegistrado).toBe(918);
    expect(cal.totalProyectado).toBe(0);
    // Y la casilla lo dice: sin monto, marcada como faltante.
    const ene = cal.quincenas[0]!;
    expect(ene.clase).toBe("faltante");
    expect(ene.monto).toBeNull();
  });
});

describe("aritmética de la quincena", () => {
  it("un salario impar reparte el centavo sin perderlo", () => {
    const cal = calendarioDePersona([], [mov("2026-01-01", "ALTA", 1000.01)], 2026, "2026-01-01");
    const [q1, q2] = cal.quincenas;
    expect(q1!.monto! + q2!.monto!).toBe(1000.01);
  });
});

describe("una quincena solo FALTA si la persona estaba", () => {
  it("EL FALSO POSITIVO QUE CORRIGIÓ ESTO: a quien entró en agosto no le faltan enero a julio", () => {
    // Alexander Vanegas entró el 2026-08-01. La primera versión le marcaba quince
    // quincenas faltantes hacia atrás, y una lista de pendientes con catorce falsos
    // positivos no se revisa.
    const cal = calendarioDePersona([], [mov("2026-08-01", "ALTA", 2500)], 2026, "2026-08-21");
    const antes = cal.quincenas.filter((x) => x.periodo < "2026-08");
    // Ninguna es «faltante», que es lo que importa: no van a la lista de pendientes.
    expect(antes.some((x) => x.clase === "faltante")).toBe(false);
    // Y son «sin dato» y no «fuera»: el catálogo no llega tan atrás, no es que se fue.
    expect(antes.every((x) => x.clase === "sinDato")).toBe(true);
    // Pero la del 15 de agosto SÍ falta: ya estaba y nadie la anotó.
    const agoQ1 = cal.quincenas.find((x) => x.periodo === "2026-08" && x.quincena === 1)!;
    expect(agoQ1.clase).toBe("faltante");
    expect(cal.faltantes).toBe(1);
  });

  it("a quien ya se fue no le faltan las de después de la baja", () => {
    const cal = calendarioDePersona(
      [],
      [mov("2026-01-01", "ALTA", 1000), mov("2026-03-31", "BAJA", 1000)],
      2026,
      "2026-08-21",
    );
    // Enero a marzo sí faltan; de abril en adelante no corresponde.
    expect(cal.faltantes).toBe(6);
    expect(cal.quincenas.filter((x) => x.clase === "fuera")).toHaveLength(18);
  });
});

describe("«no estaba» y «no se sabe» son cosas distintas", () => {
  it("EL CASO DE BREINER: el catálogo no llega tan atrás, y eso no es una baja", () => {
    // Su alta en el catálogo es del 2026-07-01 —el día del sembrado— pero tiene pagos
    // registrados desde abril, o sea que estaba. Marcar enero como "no estaba" sería
    // afirmar algo falso; lo cierto es que el sistema no puede saberlo.
    const cal = calendarioDePersona(
      [pago("2026-04", 1, 325_000, "PAGADO")],
      [mov("2026-07-01", "ALTA", 650_000)],
      2026,
      "2026-08-21",
    );
    const ene = cal.quincenas[0]!;
    expect(ene.clase).toBe("sinDato");
    expect(ene.monto).toBeNull();
    // Nadie puede "cargar" lo que nadie sabe si ocurrió: enero a junio NO son pendientes.
    const antesDelAlta = cal.quincenas.filter((x) => x.fechaProgramada < "2026-07-01");
    expect(antesDelAlta.some((x) => x.clase === "faltante")).toBe(false);
    // Desde el alta sí: julio y la Q1 de agosto ocurrieron y no están en el libro.
    expect(cal.faltantes).toBe(3);
  });

  it("con una baja de por medio SÍ es «fuera», que es una afirmación", () => {
    const cal = calendarioDePersona(
      [],
      [mov("2026-01-01", "ALTA", 1000), mov("2026-03-31", "BAJA", 1000)],
      2026,
      "2026-08-21",
    );
    expect(cal.quincenas.at(-1)!.clase).toBe("fuera");
    // Y antes del alta no hay historia: eso sigue siendo "no se sabe".
    expect(cal.quincenas.every((q) => q.clase !== "sinDato")).toBe(true);
  });
});

