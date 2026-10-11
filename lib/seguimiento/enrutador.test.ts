import { describe, expect, it } from "vitest";
import { claveDeRepeticion, rutear, salidaDe, type ContextoDelRuteo } from "./enrutador";
import { huellaDeHecho } from "./hechos/salida";
import type { HechoVerificado, TemaDeAcuerdo, TipoDeHecho } from "./hechos/tipos";

function hecho(
  tipo: TipoDeHecho,
  o: { tema?: TemaDeAcuerdo; projectId?: string | null; quien?: "cliente" | "smarteam" | null; frase?: string; quienComprobado?: boolean; fuenteDeLaCita?: HechoVerificado["fuenteDeLaCita"] } = {},
): HechoVerificado {
  const frase = o.frase ?? `Un hecho de tipo ${tipo} con palabras propias`;
  const quien = o.quien === undefined ? "cliente" : o.quien;
  return {
    tipo,
    ...(o.tema ? { tema: o.tema } : {}),
    frase,
    cita: "una cita que aparece en la reunión",
    ambito: o.projectId ? "P1" : "cuenta",
    quien,
    projectId: o.projectId ?? null,
    huella: huellaDeHecho(tipo, o.tema, frase),
    fuenteDeLaCita: o.fuenteDeLaCita ?? "transcripcion",
    hablante: "Mariana Pérez",
    quienComprobado: o.quienComprobado ?? quien !== null,
  };
}

const CTX: ContextoDelRuteo = {
  kind: "CLIENTE",
  puertasAdentro: false,
  preventaViva: false,
  proyectosVinculados: new Set(["p1", "p2"]),
  proyectosQueAlimentanElAvance: new Set(["p1"]),
  hechosAbiertosPorHuella: new Map(),
};

const claves = (r: ReturnType<typeof rutear>, i = 0) => r.porHecho[i].destinos.map((d) => d.clave);

describe("el enrutador", () => {
  it("una reunión de puertas adentro, de un aliado, de Smarteam o sin dueño no deja nada", () => {
    for (const ctx of [{ ...CTX, puertasAdentro: true }, { ...CTX, kind: "ALIADO" }, { ...CTX, kind: "INTERNO" }, { ...CTX, kind: null }]) {
      const r = rutear([hecho("cuenta")], ctx);
      expect(r.seEscriben).toBe(false);
      expect(r.porHecho).toEqual([]);
    }
  });

  it("⛔ un acuerdo de alcance va al kickoff, al diagnóstico y a Integraciones, nunca al handoff", () => {
    const r = rutear([hecho("acuerdo", { tema: "alcance", projectId: "p1" })], CTX);
    expect(claves(r)).toEqual(["kickoff.alcance", "diagnosis.alcance_acordado", "tech-requirements.requerimiento"]);
    expect(claves(r).some((c) => c.startsWith("handoff"))).toBe(false);
  });

  it("⛔ una decisión de pipeline va a la Planificación, nunca a Ejecución", () => {
    const r = rutear([hecho("acuerdo", { tema: "pipeline", projectId: "p1" })], CTX);
    expect(claves(r)).toEqual(["planning.pipelines"]);
  });

  it("⛔ un resultado va a diagnóstico › objetivos y kickoff › métricas, nunca a la ficha", () => {
    const r = rutear([hecho("resultado", { projectId: "p1" })], CTX);
    expect(claves(r).sort()).toEqual(["diagnosis.objetivos", "kickoff.metricas_exito"]);
    expect(r.acciones.ficha).toEqual([]);
  });

  it("un hecho de un proyecto no vinculado pasa a la cuenta (y si no tiene destino de cuenta, solo la tarjeta)", () => {
    const r = rutear([hecho("persona", { projectId: "otro" }), hecho("acuerdo", { tema: "pipeline", projectId: "otro" })], CTX);
    expect(r.porHecho[0].hecho.projectId).toBeNull();
    expect(r.porHecho[0].hecho.ambito).toBe("cuenta");
    expect(claves(r, 0)).toEqual(["ficha.stakeholders"]);
    expect(claves(r, 1)).toEqual([]);
  });

  it("persona de la cuenta → ficha; persona del proyecto → kickoff › equipo", () => {
    const r = rutear([hecho("persona"), hecho("persona", { projectId: "p2" })], CTX);
    expect(claves(r, 0)).toEqual(["ficha.stakeholders"]);
    expect(claves(r, 1)).toEqual(["kickoff.equipo"]);
    expect(r.acciones.ficha).toEqual([0]);
  });

  it("un prospecto: la ficha y Procesos, sin avance, etapa, alertas ni novedades de proyecto", () => {
    const ctx = { ...CTX, kind: "PROSPECTO" };
    const r = rutear(
      [hecho("cuenta"), hecho("proceso_hoy"), hecho("queja"), hecho("senal_cronograma", { projectId: "p1" }), hecho("senal_etapa", { projectId: "p1" }), hecho("resultado", { projectId: "p1" })],
      ctx,
    );
    expect(r.porHecho.map((x) => x.destinos.map((d) => d.clave))).toEqual([["ficha"], ["procesos"], [], [], [], []]);
    expect(r.acciones).toMatchObject({ avance: [], alertas: [], procesos: true });
    expect(r.acciones.etapa.size).toBe(0);
  });

  it("⛔ un prospecto con preventa viva: la ficha la propone solo la preventa", () => {
    const r = rutear([hecho("cuenta"), hecho("persona")], { ...CTX, kind: "PROSPECTO", preventaViva: true });
    expect(r.acciones.ficha).toEqual([]);
    expect(claves(r, 0)).toEqual([]);
    expect(claves(r, 1)).toEqual([]);
    // En un cliente, la preventa viva no frena la ficha.
    expect(rutear([hecho("cuenta")], { ...CTX, preventaViva: true }).acciones.ficha).toEqual([0]);
  });

  it("un hecho repetido (misma huella con uno pendiente) se marca y no se vuelve a mandar a la ficha", () => {
    const h = hecho("cuenta", { frase: "El cliente sigue sus cotizaciones en Excel" });
    const ctx = { ...CTX, hechosAbiertosPorHuella: new Map([[claveDeRepeticion(null, h.huella), "hecho-viejo"]]) };
    const r = rutear([h], ctx);
    expect(r.porHecho[0].mismoQueId).toBe("hecho-viejo");
    expect(r.porHecho[0].destinos).toEqual([]);
    expect(r.acciones.ficha).toEqual([]);
    // El mismo hecho en OTRO ámbito no es repetido.
    const otro = rutear([{ ...h, projectId: "p1", ambito: "P1" }], ctx);
    expect(otro.porHecho[0].mismoQueId).toBeNull();
  });

  it("una queja repetida sigue a su alerta (es evidencia nueva); una señal nunca se marca repetida", () => {
    const q = hecho("queja", { frase: "El cliente se queja de los tiempos de respuesta" });
    const s = hecho("senal_cronograma", { projectId: "p1", frase: "Terminaron la migración" });
    const ctx = {
      ...CTX,
      hechosAbiertosPorHuella: new Map([
        [claveDeRepeticion(null, q.huella), "q-viejo"],
        [claveDeRepeticion("p1", s.huella), "s-viejo"],
      ]),
    };
    const r = rutear([q, s], ctx);
    expect(claves(r, 0)).toEqual(["alerta.queja"]);
    expect(r.porHecho[1].mismoQueId).toBeNull();
    expect(r.acciones.avance).toEqual(["p1"]);
  });

  it("la queja levanta alerta solo si la dijo el cliente, comprobado; si no, va al vigía. El riesgo va al vigía, nunca a una alerta", () => {
    const r = rutear([hecho("queja", { quien: "smarteam" }), hecho("queja", { quien: null }), hecho("queja"), hecho("riesgo")], CTX);
    expect(r.porHecho.map((x) => x.destinos.map((d) => d.clave))).toEqual([["vigia.queja"], ["vigia.queja"], ["alerta.queja"], ["vigia.riesgo"]]);
    expect(r.acciones.alertas).toEqual([2]);
    expect(r.acciones.vigia).toEqual([0, 1, 3]);
  });

  it("«cliente» que dijo el modelo no alcanza: una cita de las notas o un hablante dudoso van al vigía", () => {
    const deLasNotas = hecho("queja", { fuenteDeLaCita: "notas", quienComprobado: false });
    const dudoso = hecho("queja", { quienComprobado: false });
    const r = rutear([deLasNotas, dudoso], CTX);
    expect(r.porHecho.map((x) => x.destinos.map((d) => d.clave))).toEqual([["vigia.queja"], ["vigia.queja"]]);
    expect(r.acciones.alertas).toEqual([]);
    expect(r.acciones.vigia).toEqual([0, 1]);
  });

  it("el avance, solo con señal y solo para los proyectos que cumplen linkFeedsAvance; la etapa, por proyecto", () => {
    const r = rutear(
      [
        hecho("senal_cronograma", { projectId: "p1", frase: "Ya terminaron la configuración" }),
        hecho("senal_cronograma", { projectId: "p2", frase: "Ya arrancó la migración" }),
        hecho("senal_etapa", { projectId: "p2", frase: "Se presentó el diagnóstico" }),
        hecho("senal_etapa", { projectId: "p2", frase: "Se hizo el kickoff con todos" }),
      ],
      CTX,
    );
    expect(r.acciones.avance).toEqual(["p1"]);
    expect(claves(r, 1)).toEqual([]);
    expect([...r.acciones.etapa]).toEqual([["p2", [2, 3]]]);
    // Sin señal, nada.
    expect(rutear([hecho("cuenta")], CTX).acciones.avance).toEqual([]);
  });

  it("cómo trabajan hoy avisa a Procesos; salidaDe lee el registro", () => {
    expect(rutear([hecho("proceso_hoy", { projectId: "p1" })], CTX).acciones.procesos).toBe(true);
    expect(salidaDe("planning.pipelines")).toBe("novedad");
    expect(salidaDe("alerta.queja")).toBe("alerta");
    expect(salidaDe("no-existe")).toBeNull();
  });
});
