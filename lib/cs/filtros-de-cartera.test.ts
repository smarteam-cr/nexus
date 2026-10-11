import { describe, expect, it } from "vitest";
import {
  FILTROS_VACIOS,
  SIN_CSE,
  VISTAS_DE_ARRANQUE,
  cifrasDelCse,
  contraLaMeta,
  filasQuePasan,
  filtroDeLaCifra,
  filtrosDeUnaVista,
  filtrosDesdeParametros,
  mismosFiltros,
  parametrosDeFiltros,
} from "./filtros-de-cartera";
import type { FilaDeLaCartera } from "./clasificacion";

const HOY = "2026-10-09";

const estado = (vigente: string) => ({
  confirmado: null,
  confirmadoPor: null,
  confirmadoEn: null,
  propuesta: { valor: vigente, razon: "", huella: vigente },
  sugerir: false,
  vigente,
});

const fila = (o: Partial<FilaDeLaCartera> & { relacionVigente?: string; momento?: string; potencial?: string } = {}): FilaDeLaCartera => {
  const { relacionVigente = "proyecto", momento = "implementacion", potencial = "medio", ...resto } = o;
  return {
    clientId: "c1",
    nombre: "Cuenta",
    salud: "saludable",
    porqueDeLaSalud: "",
    razonesDelColor: [],
    cse: { nombre: "Ana", email: "ana@x.com" },
    cses: ["Ana"],
    proyectosActivos: 1,
    renueva: null,
    mrr: null,
    enCartera: true,
    relacion: {
      estado: "gestionada",
      vence: null,
      diasParaVencer: null,
      termino: null,
      diasDesdeQueTermino: null,
      ultimaActividad: null,
      quien: null,
      corto: "Gestionada",
      porque: "",
      queHacer: null,
      tono: "verde",
    },
    correccion: null,
    nexusDiria: null,
    espera: null,
    esperaPropuesta: null,
    clasificacion: { relacion: estado(relacionVigente), momento: estado(momento), potencial: estado(potencial) },
    ...resto,
  };
};

describe("los filtros viven en la dirección", () => {
  it("ida y vuelta, y lo que no se entiende se ignora", () => {
    const f = { ...FILTROS_VACIOS, color: ["en-riesgo" as const, "en-espera" as const], cse: ["Ana"], renueva: 90, sinContacto: true };
    const p = new URLSearchParams(parametrosDeFiltros(f));
    expect(filtrosDesdeParametros(p)).toEqual(f);
    expect(filtrosDesdeParametros(new URLSearchParams("color=rojo,en-riesgo&renueva=9999&alcance=raro")).color).toEqual(["en-riesgo"]);
    expect(filtrosDesdeParametros(new URLSearchParams("renueva=9999")).renueva).toBeNull();
    expect(parametrosDeFiltros(FILTROS_VACIOS)).toEqual([]);
  });

  it("una vista guardada se lee con la misma tolerancia y sin la búsqueda", () => {
    const v = filtrosDeUnaVista({ color: ["en-riesgo"], q: "kölbi", renueva: 30 });
    expect(v.color).toEqual(["en-riesgo"]);
    expect(v.q).toBe("");
    expect(mismosFiltros(v, { ...FILTROS_VACIOS, color: ["en-riesgo"], renueva: 30, q: "otra cosa" })).toBe(true);
  });

  it("las vistas de arranque son distintas entre sí", () => {
    const claves = VISTAS_DE_ARRANQUE.map((v) => JSON.stringify(parametrosDeFiltros(v.filtros)));
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe("qué filas pasan", () => {
  const filas = [
    fila({ clientId: "a", salud: "en-riesgo", renueva: "2026-11-01" }),
    fila({ clientId: "b", salud: "en-espera", cse: { nombre: "Luis", email: null }, cses: ["Luis"] }),
    fila({ clientId: "c", cse: null, cses: [], razonesDelColor: ["sinContacto"] }),
    fila({ clientId: "d", enCartera: false, cse: null, cses: [], proyectosActivos: 0, potencial: "alto", relacionVigente: "sin-servicio" }),
  ];
  const ids = (f: Partial<typeof FILTROS_VACIOS>) => filasQuePasan(filas, { ...FILTROS_VACIOS, ...f }, HOY, () => 0).map((x) => x.clientId);

  it("varios valores a la vez", () => {
    expect(ids({ color: ["en-riesgo", "en-espera"] })).toEqual(["a", "b"]);
  });
  it("renueva en N días o menos", () => {
    expect(ids({ renueva: 30 })).toEqual(["a"]);
  });
  it("«Sin CSE» es una cuenta con proyecto activo que no lleva nadie", () => {
    expect(ids({ cse: [SIN_CSE] })).toEqual(["c"]);
  });
  it("el alcance: fuera de la cartera", () => {
    expect(ids({ alcance: "fuera", potencial: ["alto"] })).toEqual(["d"]);
  });
  it("sin contacto", () => {
    expect(ids({ sinContacto: true })).toEqual(["c"]);
  });
});

describe("la pestaña Equipo", () => {
  const filas = [
    fila({ clientId: "a", relacionVigente: "recurrente" }),
    fila({ clientId: "b", relacionVigente: "recurrente", salud: "en-riesgo" }),
    fila({ clientId: "c", cse: { nombre: "Luis", email: null }, cses: ["Luis"] }),
  ];
  it("cada número es el que deja la lista al abrirlo", () => {
    const c = cifrasDelCse(filas, "Ana");
    expect(c.cuentas).toBe(2);
    expect(c.recurrentes).toBe(1 + 1);
    for (const cifra of ["cuentas", "recurrentes", "enRiesgo"] as const) {
      expect(filasQuePasan(filas, filtroDeLaCifra("Ana", cifra), HOY, () => 0)).toHaveLength(c[cifra]);
    }
  });
  it("contra la meta de 6 a 7", () => {
    expect(contraLaMeta(5, { min: 6, max: 7 })).toBe("debajo");
    expect(contraLaMeta(7, { min: 6, max: 7 })).toBe("en-la-meta");
    expect(contraLaMeta(8, { min: 6, max: 7 })).toBe("arriba");
  });
});
