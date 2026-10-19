/**
 * lib/servicios/recurrencia.test.ts — cuándo Nexus recomienda pasar a SmartLoop y con qué porqué (etapa 6), la ruta
 * del servicio que ve el cliente (etapa 7) y la etapa sugerida al migrar «Continuidad».
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pipelineByKey } from "@/lib/projects/kind";
import { estadoDeRecomendacionDeRecurrencia } from "@/lib/lo-propuesto/ciclo";
import { queSigueDelProyecto } from "@/lib/clients/que-sigue-del-proyecto";
import {
  aQuienLeLlegaLaRecomendacion,
  calificaParaRecurrencia,
  DIAS_DESPUES_DEL_CIERRE,
  ETAPA_CONTINUIDAD,
  ETAPA_DE_ENTREGA,
  ETAPA_FINALIZADO,
  lineasDelPorque,
  PORQUE_VACIO,
  puedeDecidirRecurrencia,
  tieneServicioRecurrente,
  urlDelAlta,
  type ProyectoDeLaCuenta,
  type ProyectoParaRecurrencia,
} from "./recurrencia";
import { ejeDeLaRuta, hoyEnElEje, leerRuta, porQueNoSeSubeLaRuta, posicionEnElEje, rutaDelServicio, sinMontos, type CicloParaLaRuta } from "./ruta-del-servicio";
import { etapaAlMigrar, etapaDeLaFase } from "./migracion";

const CS = pipelineByKey("customer-success").hubspotPipelineId;
const SL = pipelineByKey("smartloop").hubspotPipelineId;
const DEV = pipelineByKey("development").hubspotPipelineId;
const HOY = "2026-10-17";

const proyecto = (o: Partial<ProyectoParaRecurrencia> = {}): ProyectoParaRecurrencia => ({
  hubspotPipelineId: CS,
  hubspotPipelineStageId: ETAPA_DE_ENTREGA,
  etapaDesde: "2026-10-10",
  esPrueba: false,
  proyectoInterno: false,
  ...o,
});
const otro = (o: Partial<ProyectoDeLaCuenta> = {}): ProyectoDeLaCuenta => ({
  hubspotPipelineId: CS,
  hubspotPipelineStageId: null,
  tags: [],
  abierto: true,
  esPrueba: false,
  ...o,
});

describe("cuándo se recomienda pasar a SmartLoop", () => {
  it("las etapas salen de la tabla de pipelines, por nombre", () => {
    expect(ETAPA_DE_ENTREGA).toBeTruthy();
    expect(ETAPA_FINALIZADO).toBeTruthy();
    expect(ETAPA_CONTINUIDAD).toBeTruthy();
  });

  it("una implementación en su entrega califica, con la fecha en que llegó", () => {
    expect(calificaParaRecurrencia(proyecto(), [], HOY)).toEqual({ motivo: "entrega", nacio: "2026-10-10" });
  });

  it("cerrada en Finalizado: solo hasta 60 días, y solo si se sabe cuándo cerró", () => {
    const cerrado = (desde: string | null) => proyecto({ hubspotPipelineStageId: ETAPA_FINALIZADO, etapaDesde: desde });
    expect(calificaParaRecurrencia(cerrado("2026-09-01"), [], HOY)?.motivo).toBe("cierre");
    expect(calificaParaRecurrencia(cerrado("2026-07-01"), [], HOY)).toBeNull();
    expect(calificaParaRecurrencia(cerrado(null), [], HOY)).toBeNull();
    expect(DIAS_DESPUES_DEL_CIERRE).toBe(60);
  });

  it("no califica en otra etapa, ni un desarrollo, ni un recurrente, ni una prueba, ni un interno", () => {
    expect(calificaParaRecurrencia(proyecto({ hubspotPipelineStageId: ETAPA_CONTINUIDAD }), [], HOY)).toBeNull();
    expect(calificaParaRecurrencia(proyecto({ hubspotPipelineId: DEV }), [], HOY)).toBeNull();
    expect(calificaParaRecurrencia(proyecto({ hubspotPipelineId: SL }), [], HOY)).toBeNull();
    expect(calificaParaRecurrencia(proyecto({ esPrueba: true }), [], HOY)).toBeNull();
    expect(calificaParaRecurrencia(proyecto({ proyectoInterno: true }), [], HOY)).toBeNull();
  });

  it("si la cuenta ya tiene un servicio recurrente vivo, no hay nada que recomendar", () => {
    expect(tieneServicioRecurrente([otro({ hubspotPipelineId: SL })])).toBe(true);
    expect(tieneServicioRecurrente([otro({ hubspotPipelineStageId: ETAPA_CONTINUIDAD })])).toBe(true);
    expect(tieneServicioRecurrente([otro({ tags: ["recurrente"] })])).toBe(true);
    // Cerrado o de prueba no cuenta.
    expect(tieneServicioRecurrente([otro({ hubspotPipelineId: SL, abierto: false })])).toBe(false);
    expect(tieneServicioRecurrente([otro({ hubspotPipelineId: SL, esPrueba: true })])).toBe(false);
    expect(calificaParaRecurrencia(proyecto(), [otro({ hubspotPipelineId: SL })], HOY)).toBeNull();
  });

  it("es lo propuesto: pendiente 30 días, después vencida; decidida con quién", () => {
    expect(estadoDeRecomendacionDeRecurrencia(null, "2026-10-10", HOY).estado).toBe("pendiente");
    expect(estadoDeRecomendacionDeRecurrencia(null, "2026-09-01", HOY).estado).toBe("vencido");
    expect(estadoDeRecomendacionDeRecurrencia(null, null, HOY).estado).toBe("pendiente");
    expect(estadoDeRecomendacionDeRecurrencia({ estado: "usada", por: "a@smarteamcr.com", en: "2026-10-12T12:00:00Z" }, "2026-10-10", HOY)).toMatchObject({
      estado: "usado",
      decididoPor: "a@smarteamcr.com",
    });
    expect(estadoDeRecomendacionDeRecurrencia({ estado: "descartada", por: "a@smarteamcr.com", en: "2026-10-12T12:00:00Z" }, "2026-10-10", HOY).estado).toBe("desestimado");
  });

  it("la decide Customer Success o dirección", () => {
    expect(puedeDecidirRecurrencia("CSE")).toBe(true);
    expect(puedeDecidirRecurrencia("CSL")).toBe(true);
    expect(puedeDecidirRecurrencia("SUPER_ADMIN")).toBe(true);
    expect(puedeDecidirRecurrencia("VENTAS")).toBe(false);
    expect(puedeDecidirRecurrencia(null)).toBe(false);
  });

  it("el alta se abre con SmartLoop y la empresa", () => {
    expect(urlDelAlta({ dominio: "faco.cr", servicio: "smartloop" })).toBe("/clients?alta=smartloop&dominio=faco.cr");
    expect(urlDelAlta({ dominio: null, servicio: "smartloop" })).toBe("/clients?alta=smartloop");
  });
});

describe("el porqué se arma con datos", () => {
  it("sin datos no inventa nada", () => {
    expect(lineasDelPorque(PORQUE_VACIO)).toEqual([]);
  });

  it("la escala, lo fuera de alcance, los casos y la adopción, en ese orden", () => {
    const lineas = lineasDelPorque({
      escala: [{ area: "Ventas", nivel: "Inicial", siguiente: "Funcional", frenan: ["Pipeline", "Datos"] }],
      fueraDeAlcance: [{ pedido: "Integrar el ERP", estado: "CONFIRMADO" }],
      fueraDeAlcanceTotal: 2,
      casos: [{ titulo: "Pipeline de ventas confiable", razon: null, deDonde: "catalogo" }],
      adopcion: { uso: 38, activacion: 60, semana: "2026-W41" },
    });
    expect(lineas[0]).toBe("Ventas está en Inicial; la frenan «Pipeline» y «Datos»: lo que sigue es llevarla a Funcional.");
    expect(lineas[1]).toContain("Quedaron 2 pedidos fuera de alcance, como «Integrar el ERP»");
    expect(lineas[2]).toContain("«Pipeline de ventas confiable»");
    expect(lineas[3]).toContain("está bajo (38 de 100)");
  });
});

describe("en el «Qué sigue» del proyecto", () => {
  const base = {
    etapa: null,
    piezas: [],
    sesionesSinRevisar: 0,
    resumenPendiente: null,
    proximaReunion: "2026-10-20T15:00:00Z",
  };
  it("va con su acción, antes de lo de rutina", () => {
    const q = queSigueDelProyecto({ ...base, resumenPendiente: { motivo: null }, recurrencia: { texto: "Propón SmartLoop." } });
    expect(q).toEqual({ texto: "Propón SmartLoop.", accion: { tipo: "recurrencia" } });
  });
  it("las reuniones sin revisar van antes", () => {
    const q = queSigueDelProyecto({ ...base, sesionesSinRevisar: 1, recurrencia: { texto: "Propón SmartLoop." } });
    expect(q.accion).toEqual({ tipo: "sesiones" });
  });
  it("sin recomendación, nada cambia", () => {
    expect(queSigueDelProyecto({ ...base }).accion).toBeNull();
  });
});

describe("la ruta del servicio que ve el cliente", () => {
  const ciclo = (o: Partial<CicloParaLaRuta> = {}): CicloParaLaRuta => ({
    numero: 1,
    nombre: "Corregir y adoptar",
    desde: "2026-09-01",
    hasta: "2026-11-30",
    meta: "Que el equipo de ventas trabaje todo su pipeline en HubSpot",
    etapa: "implementacion",
    estado: "abierto",
    metaResultado: null,
    casos: [
      {
        titulo: "Pipeline confiable",
        resultado: "Saber cuánto se va a vender este mes",
        estadoDelCaso: "en_ciclo",
        estadoEnElCronograma: "en_curso",
        desde: "2026-09-08",
        hasta: "2026-10-05",
        dependencias: [{ titulo: "Mandar la base de clientes", vence: "2026-09-20T06:00:00.000Z", hecha: false }],
      },
      { titulo: "Descartado", resultado: null, estadoDelCaso: "descartado", estadoEnElCronograma: "sin_fase", desde: null, hasta: null, dependencias: [] },
      { titulo: "En el plan", resultado: null, estadoDelCaso: "en_plan", estadoEnElCronograma: "sin_fase", desde: null, hasta: null, dependencias: [] },
    ],
    ...o,
  });

  it("lleva solo lo del cliente: sin descartados, sin lo que sigue en el plan, con la etapa en palabras", () => {
    const r = rutaDelServicio({ servicio: "SmartLoop", ciclos: [ciclo()], ahora: new Date("2026-10-17T15:00:00Z") });
    expect(r.ciclos[0].etapa).toBe("Implementación");
    expect(r.ciclos[0].casos.map((c) => c.titulo)).toEqual(["Pipeline confiable"]);
    expect(r.ciclos[0].casos[0]).toMatchObject({ estado: "en_curso", delCliente: [{ titulo: "Mandar la base de clientes", vence: "2026-09-20", hecha: false }] });
    // La foto no trae ninguna llave interna.
    const json = JSON.stringify(r);
    for (const interno of ["porque", "criterio", "metaEvaluada", "siguienteCiclo", "cita", "notas", "aprobadoPor"]) expect(json).not.toContain(interno);
  });

  it("un texto con un monto no cruza", () => {
    expect(sinMontos("Ahorrar US$ 1.200 al mes")).toBeNull();
    expect(sinMontos("Cobrar ₡250 000 menos")).toBeNull();
    expect(sinMontos("Vender 3.000 dólares más")).toBeNull();
    expect(sinMontos("Responder en 2 horas")).toBe("Responder en 2 horas");
    const r = rutaDelServicio({ servicio: "SmartLoop", ciclos: [ciclo({ meta: "Facturar $10.000 más" })], ahora: new Date() });
    expect(r.ciclos[0].meta).toBeNull();
  });

  it("un ciclo cerrado dice cómo quedó la meta y no lleva etapa", () => {
    const r = rutaDelServicio({ servicio: "SmartLoop", ciclos: [ciclo({ estado: "cerrado", metaResultado: "cumplida" })], ahora: new Date() });
    expect(r.ciclos[0]).toMatchObject({ cerrado: true, resultado: "cumplida", etapa: null });
  });

  it("el lector falla cerrado y vuelve a sacar los montos", () => {
    const r = rutaDelServicio({ servicio: "SmartLoop", ciclos: [ciclo()], ahora: new Date() });
    expect(leerRuta(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(leerRuta(null)).toBeNull();
    expect(leerRuta({ formato: 2 })).toBeNull();
    expect(leerRuta({ ...r, ciclos: [{ numero: "uno" }] })).toBeNull();
    const conMonto = JSON.parse(JSON.stringify(r));
    conMonto.ciclos[0].meta = "Ahorrar USD 500";
    expect(leerRuta(conMonto)?.ciclos[0].meta).toBeNull();
  });

  it("el eje va del primer al último día, con los meses y hoy", () => {
    const r = rutaDelServicio({ servicio: "SmartLoop", ciclos: [ciclo()], ahora: new Date() });
    const eje = ejeDeLaRuta(r)!;
    expect(eje).toMatchObject({ desde: "2026-09-01", hasta: "2026-11-30", dias: 91 });
    expect(eje.meses.map((m) => m.etiqueta)).toEqual(["sep 2026", "oct", "nov"]);
    expect(hoyEnElEje(eje, "2026-10-17")).toBeCloseTo(46 / 91, 3);
    expect(hoyEnElEje(eje, "2027-01-01")).toBeNull();
    const pos = posicionEnElEje(eje, "2026-09-01", "2026-11-30")!;
    expect(pos.izquierda).toBe(0);
    expect(pos.ancho).toBeCloseTo(1, 5);
    expect(posicionEnElEje(eje, null, "2026-10-01")).toBeNull();
  });
});

describe("la etapa del ciclo al migrar «Continuidad»", () => {
  const p = (o: Partial<Parameters<typeof etapaAlMigrar>[0]> = {}) => ({ cicloAbierto: null, fases: [], documentos: new Set<string>(), tieneHandoff: true, ...o });

  it("un ciclo que ya existe manda", () => {
    expect(etapaAlMigrar(p({ cicloAbierto: { etapa: "adopcion" } }))).toMatchObject({ etapa: "adopcion", confianza: "alta" });
  });
  it("la fase en curso dice la etapa por su nombre", () => {
    expect(etapaAlMigrar(p({ fases: [{ name: "Diagnóstico", status: "DONE" }, { name: "Capacitación del equipo", status: "IN_PROGRESS" }] })).etapa).toBe("adopcion");
    expect(etapaDeLaFase("Planificación del trimestre")).toBe("planificacion");
    expect(etapaDeLaFase("Configuración de Sales Hub")).toBe("implementacion");
  });
  it("todo hecho = la sesión de aprendizaje; nada = el diagnóstico", () => {
    expect(etapaAlMigrar(p({ fases: [{ name: "A", status: "DONE" }, { name: "B", status: "DONE" }] })).etapa).toBe("aprendizaje");
    expect(etapaAlMigrar(p()).etapa).toBe("diagnostico");
  });
  it("sin cronograma, los documentos: con la Planificación escrita, implementación", () => {
    expect(etapaAlMigrar(p({ documentos: new Set(["planning"]) })).etapa).toBe("implementacion");
  });
  it("sin handoff lo dice, y siempre es a confirmar", () => {
    const r = etapaAlMigrar(p({ tieneHandoff: false }));
    expect(r.confianza).toBe("baja");
    expect(r.razon).toContain("No tiene handoff");
  });
});

describe("guardas", () => {
  const leer = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");
  it("ni la recomendación ni la migración escriben en HubSpot", () => {
    for (const f of ["lib/servicios/recurrencia-server.ts", "scripts/migrar-continuidad-a-smartloop.ts", "app/api/projects/[projectId]/recurrencia/route.ts"]) {
      const src = leer(f);
      expect(src, f).not.toMatch(/getSystemHubspotClient|@\/lib\/hubspot\//);
    }
  });
  it("el alta de SmartLoop ya no está bloqueada", () => {
    expect(leer("app/api/projects/route.ts")).not.toContain("todavía no se da de alta desde Nexus");
    expect(leer("components/projects/NuevoProyectoStepper.tsx")).not.toContain("PROJECT_PIPELINES.filter((p) => !p.servicioRecurrente)");
  });
  it("la ruta externa sirve la foto por su chokepoint, y el panel del cliente no lee lo vivo", () => {
    const vista = leer("lib/external/ciclos-view.ts");
    expect(vista).toContain("leerRuta(");
    expect(vista).not.toMatch(/casoDeUso|cicloDeProyecto/);
  });
});

describe("a quién le llega la recomendación en «Para ti» (prueba 13)", () => {
  const activos = new Set(["hgomez@smarteamcr.com", "avanegas@smarteamcr.com"]);
  it("al encargado en HubSpot si sigue en el equipo, y a nadie más", () => {
    expect(aQuienLeLlegaLaRecomendacion({ encargado: "HGomez@smarteamcr.com", persona: "hgomez@smarteamcr.com", activos, lideraCs: false })).toBe("encargado");
    expect(aQuienLeLlegaLaRecomendacion({ encargado: "hgomez@smarteamcr.com", persona: "avanegas@smarteamcr.com", activos, lideraCs: true })).toBeNull();
  });
  it("si el encargado ya se fue (Felipe Sepúlveda, Brandon Centeno), a quien lidera Customer Success", () => {
    expect(aQuienLeLlegaLaRecomendacion({ encargado: "fsepulveda@smarteamcr.com", persona: "avanegas@smarteamcr.com", activos, lideraCs: true })).toBe("lider");
    expect(aQuienLeLlegaLaRecomendacion({ encargado: "fsepulveda@smarteamcr.com", persona: "hgomez@smarteamcr.com", activos, lideraCs: false })).toBeNull();
  });
  it("sin encargado, también a quien lidera Customer Success", () => {
    expect(aQuienLeLlegaLaRecomendacion({ encargado: null, persona: "avanegas@smarteamcr.com", activos, lideraCs: true })).toBe("lider");
    expect(aQuienLeLlegaLaRecomendacion({ encargado: "  ", persona: "hgomez@smarteamcr.com", activos, lideraCs: false })).toBeNull();
  });
});

describe("por qué no se sube la ruta del servicio (prueba 31)", () => {
  it("en un proyecto de prueba dice que no se comparte, no manda a «Acceso»", () => {
    const t = porQueNoSeSubeLaRuta({ esPrueba: true, hasAccess: false });
    expect(t).toMatch(/proyecto de prueba/);
    expect(t).not.toMatch(/Acceso/);
  });
  it("sin acceso en un proyecto real, manda a «Acceso»; con acceso, se puede subir", () => {
    expect(porQueNoSeSubeLaRuta({ esPrueba: false, hasAccess: false })).toMatch(/«Acceso»/);
    expect(porQueNoSeSubeLaRuta({ esPrueba: false, hasAccess: true })).toBeNull();
  });
});
