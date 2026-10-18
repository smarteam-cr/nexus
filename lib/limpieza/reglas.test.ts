/**
 * lib/limpieza/reglas.test.ts — la lista de limpieza de HubSpot (2026-10-16, fase 0.5 de
 * docs/nexus-sistema-de-trabajo-plan.md).
 */
import { describe, expect, it } from "vitest";
import {
  DIAS_DE_ETAPA_QUIETA,
  DIAS_SIN_ACTIVIDAD,
  arregloDelServicio,
  arreglosDelProyecto,
  porResponsable,
  type EquipoParaLimpiar,
  type ProyectoParaLimpiar,
} from "./reglas";

const hoy = new Date("2026-10-16T15:00:00Z");
const haceDias = (n: number) => new Date(hoy.getTime() - n * 86_400_000).toISOString();

const equipo: EquipoParaLimpiar = {
  activos: new Map([
    ["ana@smarteamcr.com", "Ana Mora"],
    ["avanegas@smarteamcr.com", "Alexander Vanegas"],
  ]),
  deBaja: new Map([["lorena@smarteamcr.com", "Lorena Osorio"]]),
  lideres: { cs: { email: "avanegas@smarteamcr.com", nombre: "Alexander Vanegas" }, desarrollo: { email: "avanegas@smarteamcr.com", nombre: "Alexander Vanegas" } },
};

const p = (o: Partial<ProyectoParaLimpiar> = {}): ProyectoParaLimpiar => ({
  id: "p1",
  nombre: "Implementación",
  clientId: "c1",
  cliente: "Wherex",
  sprint: "cs",
  servicioRecurrente: false,
  etapa: "Configuración técnica",
  encargadoEmail: "ana@smarteamcr.com",
  encargadoNombre: "Ana Mora",
  etapaDesde: haceDias(10),
  ultimaActividad: haceDias(3),
  creado: haceDias(200),
  hubspotUrl: "https://app.hubspot.com/contacts/1/record/0-970/9",
  ...o,
});

const motivos = (x: ProyectoParaLimpiar) => arreglosDelProyecto(x, equipo, hoy).map((a) => a.motivo);

describe("⭐ lo que hay que poner al día", () => {
  it("un proyecto al día no tiene nada", () => {
    expect(motivos(p())).toEqual([]);
  });

  it("a nombre de alguien que se fue: lo arregla quien lidera el sprint", () => {
    const [a] = arreglosDelProyecto(p({ encargadoEmail: "lorena@smarteamcr.com", encargadoNombre: "Lorena" }), equipo, hoy);
    expect(a.motivo).toBe("encargado-de-baja");
    expect(a.texto).toContain("Lorena Osorio");
    expect(a.responsable).toMatchObject({ email: "avanegas@smarteamcr.com", porQue: "lider" });
  });

  it("alguien que no es del equipo también cuenta como que no está", () => {
    expect(motivos(p({ encargadoEmail: "externo@agencia.com" }))).toEqual(["encargado-de-baja"]);
  });

  it("sin encargado", () => {
    expect(motivos(p({ encargadoEmail: null, encargadoNombre: null }))).toEqual(["sin-encargado"]);
  });

  it("la etapa quieta, pero no la que dura por diseño (Continuidad)", () => {
    expect(motivos(p({ etapaDesde: haceDias(DIAS_DE_ETAPA_QUIETA + 1) }))).toEqual(["etapa-quieta"]);
    expect(motivos(p({ etapaDesde: haceDias(DIAS_DE_ETAPA_QUIETA) }))).toEqual([]);
    expect(motivos(p({ etapa: "Continuidad", etapaDesde: haceDias(200) }))).toEqual([]);
  });

  it("un ciclo largo de un servicio recurrente (SmartLoop) no es una etapa quieta: se reconoce por el pipeline", () => {
    // Las etapas de SmartLoop se llaman como las de una implementación: el nombre no alcanza.
    expect(motivos(p({ etapa: "Implementación", etapaDesde: haceDias(120) }))).toEqual(["etapa-quieta"]);
    expect(motivos(p({ servicioRecurrente: true, etapa: "Implementación", etapaDesde: haceDias(120) }))).toEqual([]);
  });

  it("sin actividad: desde la última, o desde que se creó si nunca tuvo", () => {
    expect(motivos(p({ ultimaActividad: haceDias(DIAS_SIN_ACTIVIDAD + 1) }))).toEqual(["sin-actividad"]);
    expect(motivos(p({ ultimaActividad: null }))).toEqual(["sin-actividad"]);
    expect(motivos(p({ ultimaActividad: null, creado: haceDias(5) }))).toEqual([]);
  });

  it("⛔ sin la etapa leída (el espejo todavía no copió estos datos) no se avisa nada de lo quieto", () => {
    expect(motivos(p({ etapaDesde: null, ultimaActividad: null }))).toEqual([]);
  });

  it("un servicio que se cobra sin proyecto: lo arregla quien lidera Customer Success", () => {
    const a = arregloDelServicio({ clientId: "c9", cliente: "Bluesat", servicios: 2 }, equipo);
    expect(a.motivo).toBe("servicio-sin-registrar");
    expect(a.texto).toContain("2 servicios");
    expect(a.responsable.email).toBe("avanegas@smarteamcr.com");
  });
});

describe("por responsable", () => {
  it("en orden alfabético, lo de nadie al final, y lo que deja una cuenta sin dueño primero", () => {
    const sinLider: EquipoParaLimpiar = { ...equipo, lideres: {} };
    const lista = [
      ...arreglosDelProyecto(p({ id: "a", cliente: "Zeta", ultimaActividad: haceDias(90) }), equipo, hoy),
      ...arreglosDelProyecto(p({ id: "b", encargadoEmail: "lorena@smarteamcr.com" }), equipo, hoy),
      ...arreglosDelProyecto(p({ id: "c", encargadoEmail: null }), sinLider, hoy),
    ];
    const g = porResponsable(lista);
    expect(g.map((x) => x.responsable.nombre)).toEqual(["Alexander Vanegas", "Ana Mora", null]);
  });
});
