import { describe, expect, it } from "vitest";
import { CONFIG_DE_FABRICA, type ConfigCarga } from "./config";
import { aplicarPropuesta, descartarPropuesta, propuestasDeCalibracion, type CuentaParaCalibrar, type RespuestaAlTerminar } from "./calibracion";

const C = (): ConfigCarga => structuredClone(CONFIG_DE_FABRICA);
const veces = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));

describe("por tipo de fase", () => {
  it("con 20 respuestas propone supuesto × la mediana de las razones (cada una contra su propio estimado)", () => {
    // Configuración supone 2 h. Cada tarea tenía su estimado con el factor de su cuenta; todas tomaron 1,3 veces eso.
    const r: RespuestaAlTerminar[] = veces(20, (i) => ({ tipoFase: "CONFIGURACION", titulo: `Ajustar vistas ${i}`, estimado: 120 + i * 10, minutos: Math.round((120 + i * 10) * 1.3) }));
    const [p] = propuestasDeCalibracion(C(), r, [], []);
    expect(p).toMatchObject({ clave: "tipo:CONFIGURACION", que: "Configuración", actual: 2, propuesto: 2.5, unidad: "h", respuestas: 20, fuente: "al-terminar", descartada: false });
    expect(p.porque).toContain("20 respuestas");
  });

  it("con 19 no propone, y una diferencia chica tampoco", () => {
    const pocas = veces(19, (i) => ({ tipoFase: "CONFIGURACION", titulo: `Ajustar ${i}`, estimado: 120, minutos: 200 }));
    expect(propuestasDeCalibracion(C(), pocas, [], [])).toEqual([]);
    const parecidas = veces(25, (i) => ({ tipoFase: "CONFIGURACION", titulo: `Ajustar ${i}`, estimado: 120, minutos: 125 }));
    expect(propuestasDeCalibracion(C(), parecidas, [], [])).toEqual([]);
  });
});

describe("por tarea clave", () => {
  it("con 3 respuestas del arranque propone la mediana, aunque hoy cuente como su tipo de fase", () => {
    const arranque = [
      { familia: "integracion", minutos: 480 },
      { familia: "integracion", minutos: 960 },
      { familia: "integracion", minutos: 960 },
      { familia: "pipeline", minutos: 120 },
    ];
    const ps = propuestasDeCalibracion(C(), [], arranque, []);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ clave: "familia:integracion", que: "Integración", actual: null, propuesto: 16, fuente: "arranque", respuestas: 3 });
  });

  it("con 10 al terminar manda sobre el arranque y descuenta la parte y el factor de cada cuenta", () => {
    // Tareas «Configurar el pipeline» (Configuración, 2 h): con factor 2 se estimaban 240 min y tomaron 360 → base 3 h.
    const r = veces(10, () => ({ tipoFase: "CONFIGURACION", titulo: "Configurar el pipeline de ventas", estimado: 240, minutos: 360 }));
    const arranque = veces(5, () => ({ familia: "pipeline", minutos: 60 }));
    const [p] = propuestasDeCalibracion(C(), r, arranque, []);
    expect(p).toMatchObject({ clave: "familia:pipeline", propuesto: 3, fuente: "al-terminar", respuestas: 10 });
  });
});

describe("por variable del factor", () => {
  const cuenta = (factor: number, horasSemana: number, integracion: boolean): CuentaParaCalibrar => ({
    horasSemana,
    factor: {
      factor,
      variables: [
        { clave: "integracion", nombre: "Integración", valor: integracion ? "Sí" : "No", suma: integracion ? 0.3 : 0, fuente: "", estado: "parcial" },
      ],
    },
  });

  it("si las cuentas con la variable piden más de lo que predice su factor que las demás, propone subir su peso", () => {
    const con = veces(5, () => cuenta(1.3, 1.3 * 1.5, true)); // piden 1,5× lo que predice su factor
    const sin = veces(5, () => cuenta(1, 1, false));
    const ps = propuestasDeCalibracion(C(), [], [], [...con, ...sin]);
    const p = ps.find((x) => x.clave === "peso:integracion")!;
    expect(p.actual).toBe(0.3);
    expect(p.propuesto).toBeGreaterThan(0.3);
    expect(p.porque).toContain("Su peso se queda corto");
  });

  it("con menos de 5 cuentas por grupo no propone", () => {
    const ps = propuestasDeCalibracion(C(), [], [], [...veces(4, () => cuenta(1.3, 3, true)), ...veces(8, () => cuenta(1, 1, false))]);
    expect(ps.filter((x) => x.clase === "peso")).toEqual([]);
  });
});

describe("usar y descartar", () => {
  it("usar cambia el valor y borra su descarte; descartar lo recuerda con su número", () => {
    const d = descartarPropuesta(C(), "familia:integracion", 16);
    expect(d.descartes).toEqual({ "familia:integracion": 16 });
    const ps = propuestasDeCalibracion(d, [], veces(3, () => ({ familia: "integracion", minutos: 960 })), []);
    expect(ps[0].descartada).toBe(true);
    // Otro número vuelve a proponerse.
    expect(propuestasDeCalibracion(d, [], veces(3, () => ({ familia: "integracion", minutos: 480 })), [])[0].descartada).toBe(false);

    const u = aplicarPropuesta(d, "familia:integracion", 16);
    expect(u.horasPorFamilia.integracion).toBe(16);
    expect(u.descartes).toEqual({});
    expect(aplicarPropuesta(C(), "tipo:ADOPCION", 1.5).horasPorTipo.ADOPCION).toBe(1.5);
    expect(aplicarPropuesta(C(), "peso:integracion", 0.45).pesos.integracion).toBe(0.45);
    expect(() => aplicarPropuesta(C(), "tipo:NADA", 1)).toThrow();
  });
});
