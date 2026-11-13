import { describe, expect, it } from "vitest";
import {
  ETAPAS_TERMINADAS,
  PIPELINE_DESARROLLO,
  arrancaConProduccion,
  loQueLeToca,
  serviciosQueArrancan,
  situacionDeProduccion,
  tablaDeProduccion,
  type ProyectoParaProduccion,
} from "./paso-a-produccion";

const RECURRENTE = "1464700820";
const FINALIZADO = "1409932564";

const proyecto = (id: string, p: Partial<ProyectoParaProduccion> = {}): ProyectoParaProduccion => ({
  id,
  nombre: `Proyecto ${id}`,
  clientId: `c-${id}`,
  clienteNombre: `Cliente ${id}`,
  hubspotPipelineId: PIPELINE_DESARROLLO,
  hubspotPipelineStageId: RECURRENTE,
  hubspotPipelineStageLabel: "Recurrente",
  hubspotStatus: "completed",
  activo: false,
  servicios: [],
  fila: null,
  ...p,
});

describe("el paso a producción (punto 15, 2026-11-13)", () => {
  it("las etapas que dicen «terminó» son Recurrente y Finalizado del pipeline de Desarrollo (no Cancelado)", () => {
    expect(PIPELINE_DESARROLLO).toBe("922785384");
    expect([...ETAPAS_TERMINADAS].sort()).toEqual([FINALIZADO, RECURRENTE].sort());
  });

  it("⭐ Noelito, Printer y Construtecho: el desarrollo está en «Recurrente» y nadie confirmó → le toca a Alejandro Salas", () => {
    const filas = tablaDeProduccion([
      proyecto("noelito", { nombre: "SAP | Noelito" }),
      proyecto("printer", { nombre: "Integración con SAP * Grupo Printer" }),
      proyecto("construtecho", { nombre: "Integración con Asana | Construtecho" }),
    ]);
    expect(filas.every((f) => f.situacion.clave === "falta-confirmar")).toBe(true);
    expect(loQueLeToca(filas, "asalas@smarteamcr.com").confirmar).toHaveLength(3);
    expect(loQueLeToca(filas, "bsalas@smarteamcr.com").confirmar).toHaveLength(0);
  });

  it("la tabla de la CSL manda: si otra persona confirma, le toca a ella", () => {
    const filas = tablaDeProduccion([proyecto("a", { fila: { confirmaProduccionEmail: "bsalas@smarteamcr.com", cobraEmail: null, produccionDesde: null, produccionConfirmadaPor: null, produccionConfirmadaEn: null } })]);
    expect(loQueLeToca(filas, "bsalas@smarteamcr.com").confirmar.map((f) => f.id)).toEqual(["a"]);
    expect(loQueLeToca(filas, "asalas@smarteamcr.com").confirmar).toEqual([]);
  });

  it("confirmado y sin servicio de cobro ligado: a quien cobra le toca arrancarlo", () => {
    const confirmado = { confirmaProduccionEmail: null, cobraEmail: null, produccionDesde: "2026-11-10", produccionConfirmadaPor: "asalas@smarteamcr.com", produccionConfirmadaEn: "2026-11-13T15:00:00Z" };
    const sinCobro = tablaDeProduccion([proyecto("a", { fila: confirmado })]);
    expect(sinCobro[0].situacion).toMatchObject({ clave: "en-produccion", desde: "2026-11-10", cobroArrancado: false });
    expect(loQueLeToca(sinCobro, "mzamora@smarteamcr.com").arrancar.map((f) => f.id)).toEqual(["a"]);
    const conCobro = tablaDeProduccion([proyecto("a", { fila: confirmado, servicios: [{ id: "s", tipoServicio: "CONECTOR", modalidad: "RECURRENTE", estado: "ACTIVO", cobros: 0 }] })]);
    expect(loQueLeToca(conCobro, "mzamora@smarteamcr.com").arrancar).toEqual([]);
  });

  it("en marcha no pide nada, pero va en la tabla para ponerle responsables antes", () => {
    const filas = tablaDeProduccion([proyecto("a", { activo: true, hubspotPipelineStageId: "1409932561", hubspotStatus: null })]);
    expect(filas[0].situacion.clave).toBe("en-desarrollo");
  });

  it("fuera de la tabla: un proyecto de CS sin servicio recurrente, o un desarrollo cerrado que no terminó (cancelado)", () => {
    expect(tablaDeProduccion([proyecto("cs", { hubspotPipelineId: "826270797" })])).toEqual([]);
    expect(tablaDeProduccion([proyecto("cancelado", { hubspotPipelineStageId: "1409897657", hubspotStatus: null })])).toEqual([]);
  });

  it("⭐ un desarrollo «Finalizado» de una vez (JUDESUR) no pide producción; con un servicio recurrente ligado, sí", () => {
    expect(tablaDeProduccion([proyecto("judesur", { hubspotPipelineStageId: FINALIZADO })])).toEqual([]);
    const conServicio = proyecto("x", { hubspotPipelineStageId: FINALIZADO, servicios: [{ id: "s", tipoServicio: "SOPORTE", modalidad: "RECURRENTE", estado: "ACTIVO", cobros: 0 }] });
    expect(situacionDeProduccion(conServicio).clave).toBe("falta-confirmar");
  });

  it("al confirmar arrancan solo los servicios de cobro recurrente sin cuotas; la suscripción no", () => {
    expect(arrancaConProduccion("CONECTOR", "RECURRENTE")).toBe(true);
    expect(arrancaConProduccion("SOPORTE", "RECURRENTE")).toBe(true);
    expect(arrancaConProduccion("SUSCRIPCION", "RECURRENTE")).toBe(false);
    expect(arrancaConProduccion("IMPLEMENTACION", "PROYECTO")).toBe(false);
    expect(
      serviciosQueArrancan([
        { id: "nuevo", tipoServicio: "CONECTOR", modalidad: "RECURRENTE", estado: "ACTIVO", cobros: 0 },
        { id: "con-cuotas", tipoServicio: "CONECTOR", modalidad: "RECURRENTE", estado: "ACTIVO", cobros: 3 },
        { id: "licencia", tipoServicio: "SUSCRIPCION", modalidad: "RECURRENTE", estado: "ACTIVO", cobros: 0 },
        { id: "finalizado", tipoServicio: "SOPORTE", modalidad: "RECURRENTE", estado: "FINALIZADO", cobros: 0 },
      ]),
    ).toEqual(["nuevo"]);
  });

  it("una confirmación a medias (sin quién) no cuenta como en producción", () => {
    const p = proyecto("a", { fila: { confirmaProduccionEmail: null, cobraEmail: null, produccionDesde: "2026-11-10", produccionConfirmadaPor: null, produccionConfirmadaEn: null } });
    expect(situacionDeProduccion(p).clave).toBe("falta-confirmar");
  });
});
