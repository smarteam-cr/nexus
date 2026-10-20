import { describe, expect, it } from "vitest";
import {
  accionDelNegocio,
  cierresMasCerca,
  empresaDesdeElNombre,
  empresasDeLaCartera,
  fechaLarga,
  motivoParaLimpiar,
  saludo,
  vistasDeCartera,
  fechaCorta,
  montoCorto,
  ponderadoDelAnio,
  preguntaDelNegocio,
  senalesDelNegocio,
  temperaturaDelNegocio,
  tieneSiguientePasoDeVentas,
  type NegocioVisto,
} from "./negocios";
import type { SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";

const HOY = "2026-10-14";
const AHORA = new Date("2026-10-14T16:00:00Z");
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();
const enDias = (d: number) => new Date(AHORA.getTime() + d * 86_400_000).toISOString();

const PASO: SiguientePasoVisto = {
  id: "p1",
  objeto: "negocio",
  objetoId: "n1",
  equipo: "ventas",
  que: "Coordinar la reunión con Luis",
  fecha: "2026-10-20",
  responsableEmail: "apinzon@smarteamcr.com",
  responsableNombre: "Andrés Pinzón",
  escritoPor: "apinzon@smarteamcr.com",
  escritoPorNombre: "Andrés Pinzón",
  fuente: "persona",
  creadoAt: "2026-10-13T16:00:00.000Z",
  hubspotEstado: "escrito",
  hubspotError: null,
};

function negocio(p: Partial<NegocioVisto> = {}): NegocioVisto {
  return {
    id: "n1",
    hubspotDealId: "1",
    nombre: "ECOQUINTAS - Optimización comercial",
    pipeline: "Pipeline de ventas",
    etapa: "Propuesta",
    probabilidad: 0.5,
    fechaCierre: "2026-10-31",
    monto: 4500,
    moneda: "USD",
    siguientePasoHubspot: "Coordinar la reunión con Luis",
    proximaActividad: null,
    ultimaActividad: haceDias(1),
    ultimaReunion: null,
    empresa: "Ecoquintas",
    sinEmpresa: false,
    tipoDeEmpresa: "PROSPECTO",
    clientId: "c1",
    hubspotCompanyId: "h1",
    pospuestaHasta: null,
    propuesta: null,
    pasos: [PASO],
    ...p,
  };
}

describe("señales de un negocio", () => {
  it("un negocio completo y trabajado no tiene señales", () => {
    expect(senalesDelNegocio(negocio(), HOY, AHORA)).toEqual([]);
  });
  it("nombra lo que le falta", () => {
    const s = senalesDelNegocio(negocio({ fechaCierre: "2026-05-31", monto: null, pasos: [], ultimaActividad: haceDias(40) }), HOY, AHORA);
    expect(s).toEqual(["cierre-vencido", "sin-monto", "sin-siguiente-paso", "sin-actividad"]);
    expect(senalesDelNegocio(negocio({ fechaCierre: null }), HOY, AHORA)).toContain("sin-fecha");
  });
  it("una reunión de Nexus cuenta como actividad aunque HubSpot no tenga nada", () => {
    expect(senalesDelNegocio(negocio({ ultimaActividad: null, ultimaReunion: haceDias(3) }), HOY, AHORA)).not.toContain("sin-actividad");
  });
});

describe("temperatura", () => {
  it("caliente: probabilidad alta, actividad de la semana y cierre cerca", () => {
    expect(temperaturaDelNegocio(negocio({ probabilidad: 0.8 }), HOY, AHORA)).toBe("caliente");
  });
  it("frío: sin actividad en 21 días o con el cierre vencido hace más de 30", () => {
    expect(temperaturaDelNegocio(negocio({ ultimaActividad: haceDias(30) }), HOY, AHORA)).toBe("frio");
    expect(temperaturaDelNegocio(negocio({ fechaCierre: "2026-06-30" }), HOY, AHORA)).toBe("frio");
  });
  it("en movimiento: el resto", () => {
    expect(temperaturaDelNegocio(negocio({ probabilidad: 0.2 }), HOY, AHORA)).toBe("en-movimiento");
  });
});

describe("la pregunta de la fecha de cierre y el monto", () => {
  it("no pregunta lo que el negocio ya tiene", () => {
    expect(preguntaDelNegocio(negocio(), HOY, AHORA)).toBeNull();
  });
  it("pregunta lo que falta, y la fecha vencida, si se está trabajando", () => {
    expect(preguntaDelNegocio(negocio({ monto: null }), HOY, AHORA)).toEqual({ fecha: false, monto: true, vencida: false });
    expect(preguntaDelNegocio(negocio({ fechaCierre: "2026-06-30" }), HOY, AHORA)).toEqual({ fecha: true, monto: false, vencida: true });
  });
  it("no pregunta por un negocio que nadie trabaja hace más de 14 días", () => {
    expect(preguntaDelNegocio(negocio({ monto: null, ultimaActividad: haceDias(20) }), HOY, AHORA)).toBeNull();
  });
  it("una reunión agendada en los próximos 14 días también es interacción", () => {
    const n = negocio({ monto: null, ultimaActividad: haceDias(40), proximaActividad: enDias(3) });
    expect(preguntaDelNegocio(n, HOY, AHORA)).not.toBeNull();
  });
  it("«Ahora no» la calla hasta su fecha", () => {
    expect(preguntaDelNegocio(negocio({ monto: null, pospuestaHasta: enDias(2) }), HOY, AHORA)).toBeNull();
    expect(preguntaDelNegocio(negocio({ monto: null, pospuestaHasta: haceDias(1) }), HOY, AHORA)).not.toBeNull();
  });
});

describe("cierres más cerca y lo ponderado", () => {
  it("solo los que cierran de hoy a 60 días, el más cercano primero", () => {
    const lista = cierresMasCerca(
      [
        negocio({ id: "a", fechaCierre: "2026-11-30" }),
        negocio({ id: "b", fechaCierre: "2026-10-20" }),
        negocio({ id: "c", fechaCierre: "2026-10-01" }),
        negocio({ id: "d", fechaCierre: "2026-12-31" }),
        negocio({ id: "e", fechaCierre: null }),
      ],
      HOY,
    );
    expect(lista.map((n) => n.id)).toEqual(["b", "a"]);
  });
  it("pondera solo los dólares que cierran en el año, y cuenta aparte lo demás", () => {
    const r = ponderadoDelAnio(
      [
        negocio({ monto: 10000, probabilidad: 0.5 }),
        negocio({ monto: 2000, probabilidad: 0.3, fechaCierre: "2027-02-28" }),
        negocio({ monto: 500000, moneda: "CRC" }),
        negocio({ monto: null }),
      ],
      2026,
    );
    expect(r).toEqual({ usd: 5000, pipelineUsd: 12000, activos: 4, pausados: 0, enOtraMoneda: 1, sinMonto: 1, fueraDelAnio: 1 });
  });
});

describe("la cartera", () => {
  const propia = (clientId: string, nombre: string, tipo: "CLIENTE" | "PROSPECTO" = "CLIENTE") => ({
    clientId,
    nombre,
    hubspotCompanyId: `h-${clientId}`,
    tipo,
    ultimaReunion: null,
  });

  it("junta los negocios de una misma empresa y marca si es el dueño", () => {
    const empresas = empresasDeLaCartera(
      [negocio({ id: "1" }), negocio({ id: "2", monto: 1000 }), negocio({ id: "3", clientId: null, hubspotCompanyId: "h9", empresa: "Ajena" })],
      [propia("c1", "Ecoquintas")],
      HOY,
      AHORA,
    );
    const eco = empresas.find((e) => e.clientId === "c1")!;
    expect(eco.negocios).toHaveLength(2);
    expect(eco.esDueno).toBe(true);
    expect(eco.montoUsd).toBe(5500);
    expect(empresas.find((e) => e.nombre === "Ajena")!.esDueno).toBe(false);
  });

  it("reparte en las cuatro vistas: mover hoy, pipeline, por limpiar y sin negocio", () => {
    const empresas = empresasDeLaCartera(
      [
        negocio({ id: "completo", clientId: "c1", empresa: "Uno" }),
        negocio({ id: "sin-monto", clientId: "c2", empresa: "Dos", monto: null }),
        negocio({ id: "pausado", clientId: "c3", empresa: "Tres", etapa: "Pausados", fechaCierre: "2026-02-28" }),
        negocio({ id: "olvidado", clientId: "c4", empresa: "Cuatro", fechaCierre: "2026-05-31", ultimaActividad: haceDias(90) }),
      ],
      [propia("c5", "Cinco")],
      HOY,
      AHORA,
    );
    const v = vistasDeCartera(empresas, HOY, AHORA);
    expect(v.pipeline.completos.map((n) => n.id)).toEqual(["completo"]);
    expect(v.pipeline.incompletos.map((n) => n.id)).toEqual(["sin-monto"]);
    expect(v.porLimpiar.map((x) => x.negocio.id).sort()).toEqual(["olvidado", "pausado"]);
    expect(v.sinNegocio.map((e) => e.nombre)).toEqual(["Cinco"]);
    expect(v.moverHoy.map((m) => [m.empresa.nombre, m.accion.clave])).toEqual([["Dos", "completar"]]);
  });

  it("la acción de cada negocio, lo más urgente primero", () => {
    expect(accionDelNegocio(negocio({ monto: null }), HOY, AHORA)?.clave).toBe("completar");
    expect(accionDelNegocio(negocio({ proximaActividad: new Date(AHORA.getTime() + 3 * 3_600_000).toISOString() }), HOY, AHORA)?.clave).toBe("preparar");
    expect(accionDelNegocio(negocio({ ultimaActividad: haceDias(18) }), HOY, AHORA)?.clave).toBe("retomar");
    expect(accionDelNegocio(negocio({ pasos: [] }), HOY, AHORA)?.clave).toBe("definir");
    expect(accionDelNegocio(negocio(), HOY, AHORA)).toBeNull();
  });

  it("el siguiente paso es el de Nexus: el de HubSpot solo se sugiere", () => {
    const sinPaso = accionDelNegocio(negocio({ pasos: [], siguientePasoHubspot: "Mandar la propuesta" }), HOY, AHORA);
    expect(sinPaso?.clave).toBe("definir");
    expect(sinPaso?.motivo).toContain("Mandar la propuesta");
    expect(senalesDelNegocio(negocio({ pasos: [] }), HOY, AHORA)).toContain("sin-siguiente-paso");
    // El de otro equipo no cuenta como el de Ventas.
    expect(accionDelNegocio(negocio({ pasos: [{ ...PASO, equipo: "cs" }] }), HOY, AHORA)?.clave).toBe("definir");
  });

  it("un siguiente paso vencido pide definir el que sigue", () => {
    const n = negocio({ pasos: [{ ...PASO, fecha: "2026-10-10" }] });
    expect(senalesDelNegocio(n, HOY, AHORA)).toEqual(["siguiente-paso-vencido"]);
    expect(accionDelNegocio(n, HOY, AHORA)?.motivo).toContain("venció el 10 oct");
  });

  it("una reunión agendada con la empresa ES el siguiente paso del negocio (2026-10-19)", () => {
    const reunion = { inicio: enDias(3), titulo: "Revisión de la propuesta" };
    // Sin paso de Ventas, con reunión: no se pide definirlo ni se marca.
    const sinPaso = negocio({ pasos: [], reunion });
    expect(tieneSiguientePasoDeVentas(sinPaso, HOY)).toBe(true);
    expect(accionDelNegocio(sinPaso, HOY, AHORA)).toBeNull();
    expect(senalesDelNegocio(sinPaso, HOY, AHORA)).not.toContain("sin-siguiente-paso");
    // Con el paso vencido, la reunión lo cubre igual.
    const vencido = negocio({ pasos: [{ ...PASO, fecha: "2026-10-10" }], reunion });
    expect(accionDelNegocio(vencido, HOY, AHORA)).toBeNull();
    expect(senalesDelNegocio(vencido, HOY, AHORA)).toEqual([]);
    // Una reunión en las próximas horas pide prepararla.
    const pronto = negocio({ pasos: [], reunion: { inicio: new Date(AHORA.getTime() + 5 * 3_600_000).toISOString(), titulo: "Demo" } });
    expect(accionDelNegocio(pronto, HOY, AHORA)).toMatchObject({ clave: "preparar", motivo: expect.stringContaining("reunión") });
    // Sin reunión ni paso vigente, como siempre.
    expect(tieneSiguientePasoDeVentas(negocio({ pasos: [] }), HOY)).toBe(false);
    expect(tieneSiguientePasoDeVentas(negocio(), HOY)).toBe(true);
  });

  it("una reunión agendada cuenta como algo agendado: no pide retomar", () => {
    const n = negocio({ ultimaActividad: haceDias(18), reunion: { inicio: enDias(4), titulo: "Seguimiento" } });
    expect(accionDelNegocio(n, HOY, AHORA)).toBeNull();
  });

  it("un pausado no se pregunta ni cuenta en lo ponderado", () => {
    const pausado = negocio({ etapa: "Pausados", monto: null });
    expect(preguntaDelNegocio(pausado, HOY, AHORA)).toBeNull();
    expect(motivoParaLimpiar(pausado, HOY, AHORA)).toBe("Está pausado");
    expect(ponderadoDelAnio([pausado, negocio()], 2026)).toMatchObject({ activos: 1, pausados: 1, usd: 2250 });
  });

  it("un negocio sin empresa en HubSpot toma el nombre de la empresa de su nombre", () => {
    expect(empresaDesdeElNombre("CCN - Implementación Insider + Master Panel")).toBe("CCN");
    expect(empresaDesdeElNombre("ITC | Presencia Comercial")).toBe("ITC");
    expect(empresaDesdeElNombre("MERCURY")).toBe("MERCURY");
  });
});

describe("el saludo de «Para ti»", () => {
  it("cambia con la hora de Costa Rica y dice la fecha entera", () => {
    expect(saludo(8)).toBe("Buenos días");
    expect(saludo(15)).toBe("Buenas tardes");
    expect(saludo(20)).toBe("Buenas noches");
    expect(fechaLarga("2026-10-15")).toBe("Jueves 15 de octubre");
  });
});

describe("formatos armados a mano", () => {
  it("monto y fecha", () => {
    expect(montoCorto(12400, "USD")).toBe("US$12.400");
    expect(montoCorto(1500000, "CRC")).toBe("₡1.500.000");
    expect(fechaCorta("2026-10-31")).toBe("31 oct");
  });
});
