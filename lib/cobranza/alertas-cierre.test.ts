/**
 * lib/cobranza/alertas-cierre.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/alertas-cierre.test.ts --project unit`.
 *
 * Las alertas se cierran solas cuando lo que las abrió deja de pasar, y el refresco de la noche solo
 * abre la deuda del cliente. Los casos salen del feed medido en solo lectura el 2026-09-12, que era
 * una foto del corte del 24-jul: PRIMO, Honda y APRECAP cobrados con la alerta abierta, los
 * catch-up de Kaizen que el plan corrió al futuro, la INCONSISTENCIA_CICLO de Librería
 * Internacional con la factura emitida, la promesa rota de ALMOTEC y las copias de Construtecho.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claveDeRecurrencia, computeAlertSet, type AlertaDraft, type CarteraEngineInput } from "./engine";
import {
  alertasQueYaNoAplican,
  borradoresDelRefresco,
  cuentasEvaluadas,
  mensajeDeCierre,
  TIPOS_QUE_ABRE_EL_REFRESCO,
  type FilaCerrable,
} from "./alertas-cierre";

const HOY = "2026-09-12";
const CORTE_DE_JULIO = new Date("2026-07-24T21:49:39Z");
const AYER = new Date("2026-09-11T03:55:33Z");

type Cuenta = CarteraEngineInput["cuentas"][number];
type Cobro = Cuenta["cobros"][number];

function cobro(cobroId: string, over: Partial<Cobro> = {}): Cobro {
  return {
    cobroId,
    servicioId: "s1",
    estado: "POR_COBRAR",
    origen: "IMPORTACION",
    fechaProgramadaISO: "2026-06-15",
    monto: 1000,
    fechaEmisionISO: "2026-06-15",
    ...over,
  };
}

/** Una cuenta sana: un servicio activo con arranque, sin plan (nada de «sin datos» ni «descuadrado»). */
function cuenta(cuentaId: string, cobros: Cobro[], over: Partial<Cuenta> = {}): Cuenta {
  return {
    cuentaId,
    clienteNombre: cuentaId,
    excluidaOperacion: false,
    tieneCuenta: true,
    servicios: [
      { servicioId: "s1", descripcion: null, estado: "ACTIVO", fechaInicioFacturacion: "2026-01-15", anchorActualISO: null },
    ],
    cobros,
    ...over,
  };
}

function fila(tipo: string, cuentaId: string, cobroId: string | null, over: Partial<FilaCerrable> = {}): FilaCerrable {
  const clave = `${tipo}:${cuentaId}:${cobroId ?? "cuenta"}`;
  return {
    id: clave,
    dedupeKey: clave,
    tipo,
    urgencia: "ALTA",
    cobroId,
    lastDetectedAt: CORTE_DE_JULIO,
    cuentaId,
    mensaje: `${tipo} sobre ${cobroId ?? "la cuenta"}`,
    ...over,
  };
}

function motor(cartera: CarteraEngineInput): AlertaDraft[] {
  return computeAlertSet(cartera, { todayISO: HOY });
}

function cierres(cartera: CarteraEngineInput, vivas: FilaCerrable[]) {
  return alertasQueYaNoAplican(vivas, motor(cartera), cuentasEvaluadas(cartera));
}

describe("se cierra lo que el motor ya no ve", () => {
  it("las alertas del corte del 24-jul sobre cobros ya cobrados se cierran (PRIMO, Honda, APRECAP)", () => {
    const cartera: CarteraEngineInput = {
      cuentas: [
        cuenta("primo", [
          cobro("primo-1", { estado: "COBRADO", fechaEmisionISO: "2026-05-15", fechaCobroISO: "2026-09-04" }),
          cobro("primo-2", { estado: "COBRADO", fechaEmisionISO: "2026-06-15", fechaCobroISO: "2026-09-04" }),
        ]),
        // Honda: cobrado sin fecha de emisión. Sin la regla nueva, «sin facturar» para siempre.
        cuenta("honda", [cobro("honda-1", { estado: "COBRADO", fechaEmisionISO: null, fechaProgramadaISO: "2026-05-15" })]),
        cuenta("aprecap", [cobro("aprecap-2", { estado: "COBRADO", fechaEmisionISO: "2026-07-17", fechaProgramadaISO: "2026-07-30" })]),
      ],
    };
    const vivas = [
      fila("COBRO_VENCIDO", "primo", "primo-1"),
      fila("COBRO_VENCIDO", "primo", "primo-2"),
      fila("FACTURACION_ATRASADA", "honda", "honda-1"),
      fila("COBRO_PROXIMO", "aprecap", "aprecap-2"),
    ];
    const r = cierres(cartera, vivas);
    expect(r.map((c) => c.id).sort()).toEqual(vivas.map((f) => f.id).sort());
    expect(new Set(r.map((c) => c.motivo))).toEqual(new Set(["ya-no-aplica"]));
  });

  it("Kaizen: los 7 catch-up que el plan corrió al futuro dejan de pedir confirmación; la cuota #1 no se cierra, se pone al día", () => {
    const catchUps = ["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15", "2027-04-15"].map(
      (fecha, i) => cobro(`kaizen-${i + 2}`, { estado: "PROGRAMADO", origen: "CATCH_UP", fechaProgramadaISO: fecha, fechaEmisionISO: null, monto: 2000 }),
    );
    const cartera: CarteraEngineInput = {
      cuentas: [
        cuenta("kaizen", [
          // La factura de enero se soltó: la cuota #1 ya no está facturada y cae en la quincena.
          cobro("kaizen-1", { estado: "PROGRAMADO", fechaProgramadaISO: "2026-09-15", fechaEmisionISO: null, monto: 2000 }),
          ...catchUps,
        ]),
      ],
    };
    const inconsistencias = catchUps.map((c) => fila("INCONSISTENCIA_CICLO", "kaizen", c.cobroId, { urgencia: "MEDIA", lastDetectedAt: AYER }));
    const vencidaQueYaNoLoEs = fila("COBRO_VENCIDO", "kaizen", "kaizen-1", { mensaje: "vencido hace 175 día(s)" });
    const vivas = [...inconsistencias, vencidaQueYaNoLoEs];

    const r = cierres(cartera, vivas);
    expect(r.map((c) => c.id).sort()).toEqual(inconsistencias.map((f) => f.id).sort());

    /* La cuota #1 tiene otra situación del mismo cobro (falta facturar, en la quincena): la fila
       no se cierra, se pone al día. Y el refresco no abre nada más. */
    expect(borradoresDelRefresco(motor(cartera), vivas).map((d) => d.dedupeKey)).toEqual(["COBRO_PROXIMO:kaizen:kaizen-1"]);
  });

  it("Librería Internacional: el catch-up ya facturado cierra su INCONSISTENCIA_CICLO", () => {
    const cartera: CarteraEngineInput = {
      cuentas: [
        cuenta("libreria", [
          cobro("libreria-1", { origen: "CATCH_UP", estado: "POR_COBRAR", fechaProgramadaISO: "2026-09-10", fechaEmisionISO: "2026-09-10" }),
        ]),
      ],
    };
    const r = cierres(cartera, [fila("INCONSISTENCIA_CICLO", "libreria", "libreria-1", { urgencia: "MEDIA" })]);
    expect(r).toEqual([
      expect.objectContaining({ id: "INCONSISTENCIA_CICLO:libreria:libreria-1", motivo: "ya-no-aplica" }),
    ]);
  });

  it("⛔ una fila que sube de situación NO se cierra: la de ALMOTEC pasa a promesa incumplida en la misma fila", () => {
    const cartera: CarteraEngineInput = {
      cuentas: [
        cuenta("almotec", [
          cobro("almotec-jun", { estado: "PROGRAMADO", fechaEmisionISO: "2026-08-19", promesaPagoISO: "2026-08-31", monto: 2300 }),
        ]),
      ],
    };
    const vivas = [fila("FACTURACION_ATRASADA", "almotec", "almotec-jun")];
    expect(cierres(cartera, vivas)).toEqual([]);
    expect(borradoresDelRefresco(motor(cartera), vivas).map((d) => d.dedupeKey)).toEqual([
      "PROMESA_INCUMPLIDA:almotec:almotec-jun",
    ]);
  });

  it("de dos filas vivas sobre lo mismo se queda la que elige el merge y la otra se cierra como copia", () => {
    const cartera: CarteraEngineInput = {
      cuentas: [
        cuenta("construtecho", [
          cobro("construtecho-1", { fechaEmisionISO: "2026-03-15", fechaProgramadaISO: "2026-03-15", promesaPagoISO: "2026-08-20" }),
        ]),
        // Sin servicios: su CUENTA_SIN_DATOS sigue en pie, y quedó dos veces.
        cuenta("sin-servicios", [], { servicios: [] }),
      ],
    };
    const vieja = fila("COBRO_VENCIDO", "construtecho", "construtecho-1", { id: "vieja" });
    const nueva = fila("COBRO_VENCIDO", "construtecho", "construtecho-1", {
      id: "nueva",
      lastDetectedAt: new Date(CORTE_DE_JULIO.getTime() + 60_000),
    });
    const sinDatos1 = fila("CUENTA_SIN_DATOS", "sin-servicios", null, { id: "sin-datos-1", urgencia: "MEDIA" });
    const sinDatos2 = fila("CUENTA_SIN_DATOS", "sin-servicios", null, { id: "sin-datos-2", urgencia: "MEDIA", lastDetectedAt: AYER });

    const r = cierres(cartera, [vieja, nueva, sinDatos1, sinDatos2]);
    expect(r.map(({ id, motivo }) => ({ id, motivo })).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: "sin-datos-1", motivo: "copia" },
      { id: "vieja", motivo: "copia" },
    ]);
  });

  it("Seléctrica: ponerle el plan de suscripción cierra su alerta de recurrencia, por la clave (etapa 14)", () => {
    const servicioWeb = { servicioId: "s1", descripcion: null, estado: "ACTIVO", fechaInicioFacturacion: "2026-01-15", anchorActualISO: null, modalidad: "RECURRENTE" };
    const cuotas = [cobro("sel-8", { estado: "COBRADO", fechaProgramadaISO: "2026-08-15", fechaEmisionISO: "2026-09-04", fechaCobroISO: "2026-09-10" })];
    const viva = fila("CUENTA_SIN_DATOS", "selectrica", null, { id: "recurrencia", dedupeKey: claveDeRecurrencia("selectrica", "s1") });

    const sinPlan: CarteraEngineInput = { cuentas: [cuenta("selectrica", cuotas, { servicios: [{ ...servicioWeb, planTemplate: null }] })] };
    expect(cierres(sinPlan, [viva])).toEqual([]);

    const conPlan: CarteraEngineInput = { cuentas: [cuenta("selectrica", cuotas, { servicios: [{ ...servicioWeb, planTemplate: "SUSCRIPCION" }] })] };
    expect(cierres(conPlan, [viva])).toEqual([expect.objectContaining({ id: "recurrencia", motivo: "ya-no-aplica" })]);
  });
});

describe("lo que no se toca", () => {
  it("las alertas del espejo de Odoo no se miden contra el motor: INV24 exige que cada fallo tenga la suya", () => {
    const cartera: CarteraEngineInput = { cuentas: [cuenta("wherex", [])] };
    const vivas = [fila("SYNC_ODOO_FALLIDO", "wherex", null), fila("FACTURA_SIN_COBRO", "wherex", null, { id: "factura" })];
    expect(cierres(cartera, vivas)).toEqual([]);
  });

  it("no decide nada sobre cuentas que no evaluó: excluida de la operación, o fuera de la cartera", () => {
    const cartera: CarteraEngineInput = {
      cuentas: [cuenta("colby", [cobro("colby-1", { estado: "COBRADO" })], { excluidaOperacion: true })],
    };
    const vivas = [fila("COBRO_VENCIDO", "colby", "colby-1"), fila("COBRO_VENCIDO", "otra-cuenta", "otro-cobro")];
    expect(cierres(cartera, vivas)).toEqual([]);
  });
});

describe("el refresco de la noche", () => {
  it("abre solo la deuda del cliente: vencidos y promesas incumplidas", () => {
    const cartera: CarteraEngineInput = {
      cuentas: [
        cuenta("c1", [
          cobro("vencido", { fechaEmisionISO: "2026-08-01" }),
          cobro("incumplida", { fechaEmisionISO: "2026-08-19", promesaPagoISO: "2026-08-31" }),
          cobro("sin-facturar", { estado: "PROGRAMADO", fechaProgramadaISO: "2026-08-15", fechaEmisionISO: null }),
          cobro("catch-up", { estado: "PROGRAMADO", origen: "CATCH_UP", fechaProgramadaISO: "2026-08-01", fechaEmisionISO: null }),
        ]),
        cuenta("c2", [], { servicios: [] }),
      ],
    };
    const set = motor(cartera);
    // El motor ve de todo…
    expect(new Set(set.map((d) => d.tipo))).toEqual(
      new Set(["COBRO_VENCIDO", "PROMESA_INCUMPLIDA", "FACTURACION_ATRASADA", "INCONSISTENCIA_CICLO", "CUENTA_SIN_DATOS"]),
    );
    // …y el refresco, sin filas vivas, solo abre la deuda.
    const abre = borradoresDelRefresco(set, []);
    expect(abre.map((d) => d.dedupeKey).sort()).toEqual(["COBRO_VENCIDO:c1:vencido", "PROMESA_INCUMPLIDA:c1:incumplida"]);
    expect(abre.every((d) => (TIPOS_QUE_ABRE_EL_REFRESCO as readonly string[]).includes(d.tipo))).toBe(true);
  });

  it("⚠ abre también la recurrencia que se apaga, y ningún otro «sin datos» (etapa 14)", () => {
    /* Avisa con 45 días: esperar al corte, apagado en producción, era no avisar nunca. */
    const cartera: CarteraEngineInput = {
      cuentas: [
        cuenta("selectrica", [cobro("sel-8", { estado: "COBRADO", fechaProgramadaISO: "2026-08-15", fechaCobroISO: "2026-09-10" })], {
          servicios: [
            { servicioId: "s1", descripcion: null, estado: "ACTIVO", fechaInicioFacturacion: "2026-01-15", anchorActualISO: null, modalidad: "RECURRENTE", planTemplate: null },
          ],
        }),
        cuenta("sin-servicios", [], { servicios: [] }),
      ],
    };
    const set = motor(cartera);
    expect(set.map((d) => d.dedupeKey).sort()).toEqual(
      [claveDeRecurrencia("selectrica", "s1"), "CUENTA_SIN_DATOS:sin-servicios:cuenta"].sort(),
    );
    expect(borradoresDelRefresco(set, []).map((d) => d.dedupeKey)).toEqual([claveDeRecurrencia("selectrica", "s1")]);
  });

  it("el cierre conserva lo que la alerta decía, sin encadenar si se vuelve a cerrar", () => {
    const una = mensajeDeCierre("ya-no-aplica", "PRIMO: cobro de 1.000 vencido hace 40 día(s).");
    expect(una).toBe("Se cerró sola: lo que la abrió ya no pasa. Decía: «PRIMO: cobro de 1.000 vencido hace 40 día(s).»");
    expect(mensajeDeCierre("copia", una)).toBe(una);
  });
});

// ── Guardas de armado ──────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, "..", "..");
/** Sin comentarios: una guarda que se cumple con el párrafo que explica por qué existe no guarda nada. */
const leer = (rel: string) =>
  readFileSync(join(RAIZ, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** El cuerpo de una función exportada de primer nivel, hasta la siguiente. */
function cuerpo(src: string, nombre: string): string {
  const inicio = src.indexOf(`export async function ${nombre}(`);
  expect(inicio, `no encontré ${nombre}`).toBeGreaterThan(-1);
  const fin = src.indexOf("\nexport ", inicio + 1);
  return src.slice(inicio, fin === -1 ? undefined : fin);
}

describe("dónde se cierra", () => {
  const MUTACIONES = leer("lib/cobranza/mutations.ts");

  it("confirmar un cobro cierra sus alertas en la misma transacción, firmado por el sistema", () => {
    /* La edición que lo pone en rojo: sacar el cierre, o hacerlo con `prisma` en vez de `db` —fuera
       de la transacción, un cobro confirmado podía quedar con su alerta de vencido abierta—. */
    expect(cuerpo(MUTACIONES, "cambiarEstadoCobroTx")).toMatch(
      /if \(patch\.estado === "COBRADO" && cobro\.estado !== "COBRADO"\) \{\s*await cerrarAlertasDeCobros\(db, \[cobroId\], mensajeCobroConfirmado\(byEmail\), RESUELTA_POR_SISTEMA\);/,
    );
  });

  it("⚠ la supresión de 7 días no cuenta lo que cerró el sistema", () => {
    /* Sin esto, un cobro sacado de Cobrado por error se quedaba una semana sin su alerta de vencido:
       la cerró la confirmación, y la supresión la trataba como resuelta por una persona. */
    expect(cuerpo(MUTACIONES, "upsertAlertas")).toMatch(/resueltaPor: \{ not: RESUELTA_POR_SISTEMA \}/);
  });

  it("generar cobros, soltar facturas y guardar un plan cierran lo que dejó de pasar en su cuenta; el corte también", () => {
    for (const nombre of ["generateCobros", "liberarYRegenerar", "setPlanActivo"]) {
      expect(cuerpo(MUTACIONES, nombre), nombre).toMatch(/await cerrarAlertasPorClave\(/);
    }
    expect(leer("lib/cobranza/digest.ts")).toMatch(/await cerrarAlertasQueYaNoAplican\(cartera, alertSet\)/);
  });
});
