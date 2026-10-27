import { describe, expect, it } from "vitest";
import { agruparRapidas, claseDeTrabajo, limpiezaDePorDecidir, sugerenciaDeCierre, temasRepetidos, type TareaParaCerrar } from "./aligerar";

describe("claseDeTrabajo", () => {
  it("un recordatorio al cliente es seguimiento", () => {
    expect(claseDeTrabajo({ titulo: "Recordarle a Sonia que envíe hoy mismo las propuestas de fecha" })).toBe("seguimiento");
    expect(claseDeTrabajo({ titulo: "Seguimiento con Tecnosagot: 2 cosas que prometió el cliente (vie 16 oct)" })).toBe("seguimiento");
    expect(claseDeTrabajo({ titulo: "Seguirle a Kathya que le escriba a Susan" })).toBe("seguimiento");
  });

  it("enviar o confirmar algo hecho es rápida", () => {
    expect(claseDeTrabajo({ titulo: "Enviar la invitación de calendario para la reunión del miércoles 21" })).toBe("rapida");
    expect(claseDeTrabajo({ titulo: "Confirmarle a Simón la invitación de la sesión técnica" })).toBe("rapida");
    expect(claseDeTrabajo({ titulo: "Reenviar las invitaciones de acceso a la plataforma" })).toBe("rapida");
  });

  it("si hay que armar algo antes, es trabajo aunque empiece con «Enviar»", () => {
    expect(claseDeTrabajo({ titulo: "Enviar propuesta económica formal con costo de implementación" })).toBe("trabajo");
    expect(claseDeTrabajo({ titulo: "Enviar el informe de activaciones" })).toBe("trabajo");
  });

  it("el trabajo de siempre es trabajo, y una estimación de 15 min o menos la vuelve rápida", () => {
    expect(claseDeTrabajo({ titulo: "Configurar las automatizaciones del pipeline de leads" })).toBe("trabajo");
    expect(claseDeTrabajo({ titulo: "Revisar el workflow del evento", minutosEstimados: 15 })).toBe("rapida");
    expect(claseDeTrabajo({ titulo: "Revisar el workflow del evento", minutosEstimados: 30 })).toBe("trabajo");
    expect(claseDeTrabajo({ titulo: "Crear las propiedades del pipeline", minutosEstimados: 15 })).toBe("trabajo");
  });
});

describe("agruparRapidas", () => {
  const t = (titulo: string, cliente: string | null) => ({ titulo, cliente: cliente ? { id: cliente, nombre: cliente.toUpperCase() } : null });

  it("deja el trabajo entero y junta lo rápido por cuenta, la de más primero y «sin cuenta» al final", () => {
    const lista = [
      t("Configurar el pipeline", "tec"),
      t("Recordarle a Andrea la matriz", "tec"),
      t("Enviar la minuta", null),
      t("Recordarle a Ilse que entre a HubSpot", "tec"),
      t("Confirmar la reunión", "larce"),
    ];
    const r = agruparRapidas(lista);
    expect(r.trabajo.map((x) => x.titulo)).toEqual(["Configurar el pipeline"]);
    expect(r.cuantasLigeras).toBe(4);
    expect(r.ligeras.map((g) => [g.cuenta, g.tareas.length])).toEqual([
      ["TEC", 2],
      ["LARCE", 1],
      [null, 1],
    ]);
  });

  it("con una sola rápida no pliega nada (no hace falta)", () => {
    const r = agruparRapidas([t("Configurar el pipeline", "tec"), t("Enviar la minuta", "tec")]);
    expect(r.ligeras).toEqual([]);
    expect(r.trabajo).toHaveLength(2);
  });

  it("no pierde ninguna: trabajo + ligeras = la lista", () => {
    const lista = [t("Enviar A", "a"), t("Enviar B", "b"), t("Crear C", "a"), t("Recordarle D", null)];
    const r = agruparRapidas(lista);
    expect(r.trabajo.length + r.ligeras.reduce((n, g) => n + g.tareas.length, 0)).toBe(lista.length);
  });
});

describe("temasRepetidos", () => {
  it("junta los títulos claramente parecidos de la misma cuenta, nunca de cuentas distintas ni sin cuenta", () => {
    const lista = [
      { titulo: "Configurar el informe de activaciones por línea", clientId: "honda" },
      { titulo: "Configurar informe de activaciones por cada línea", clientId: "honda" },
      { titulo: "Configurar el informe de activaciones por línea", clientId: "otra" },
      { titulo: "Configurar el informe de activaciones por línea", clientId: null },
    ];
    const g = temasRepetidos(lista);
    expect(g).toHaveLength(1);
    expect(g[0]!.every((x) => x.clientId === "honda")).toBe(true);
  });
});

describe("sugerenciaDeCierre", () => {
  const hoy = "2026-10-19";
  const base: TareaParaCerrar = { titulo: "Enviar la invitación de la reunión", estado: "propuesta", origen: "reunion", venceEl: null, semana: null, creadaAt: "2026-10-12T15:00:00Z", ultimoToque: null };

  it("una rápida propuesta cuya fecha pasó hace 3 días o más: descartar, con el motivo", () => {
    const s = sugerenciaDeCierre({ ...base, venceEl: "2026-10-15" }, hoy);
    expect(s?.accion).toBe("descartar");
    expect(s?.motivo).toContain("jue 15 oct");
    expect(sugerenciaDeCierre({ ...base, venceEl: "2026-10-17" }, hoy)).toBeNull();
  });

  it("si una persona la tocó después de su fecha, no se sugiere", () => {
    expect(sugerenciaDeCierre({ ...base, venceEl: "2026-10-12", ultimoToque: "2026-10-14T10:00:00Z" }, hoy)).toBeNull();
    // Un toque ANTES de su fecha no cuenta: después nadie la miró.
    expect(sugerenciaDeCierre({ ...base, venceEl: "2026-10-12", ultimoToque: "2026-10-11T10:00:00Z" }, hoy)?.accion).toBe("descartar");
  });

  it("una que nació después de su fecha (se leyó la reunión tarde) igual se sugiere", () => {
    expect(sugerenciaDeCierre({ ...base, venceEl: "2026-10-09", creadaAt: "2026-10-19T08:00:00Z" }, hoy)?.accion).toBe("descartar");
  });

  it("una de TRABAJO con la fecha pasada no se sugiere: está atrasada, no sobra", () => {
    expect(sugerenciaDeCierre({ ...base, titulo: "Configurar los informes de activaciones", venceEl: "2026-10-12" }, hoy)).toBeNull();
  });

  it("un seguimiento espera una semana desde su fecha (que el cliente se atrase es cuando hay que empujar)", () => {
    const seg = { ...base, titulo: "Recordarle a Andrea que confirme los accesos", estado: "pendiente" };
    expect(sugerenciaDeCierre({ ...seg, venceEl: "2026-10-13" }, hoy)).toBeNull();
    const s = sugerenciaDeCierre({ ...seg, venceEl: "2026-10-12" }, hoy);
    expect(s?.accion).toBe("no_se_hara");
    expect(s?.motivo).toBe("Ya pasó: era para el lun 12 oct y nadie la tocó desde entonces.");
  });

  it("una abierta de trabajo: 14 días vencida y 14 sin tocar", () => {
    const tr = { ...base, titulo: "Configurar el pipeline", estado: "pendiente", creadaAt: "2026-09-01T00:00:00Z" };
    expect(sugerenciaDeCierre({ ...tr, venceEl: "2026-10-05" }, hoy)?.accion).toBe("no_se_hara");
    expect(sugerenciaDeCierre({ ...tr, venceEl: "2026-10-06" }, hoy)).toBeNull();
    expect(sugerenciaDeCierre({ ...tr, venceEl: "2026-10-01", ultimoToque: "2026-10-10T00:00:00Z" }, hoy)).toBeNull();
  });

  it("una abierta sin fecha: semana de hace 21 días, o sin semana 28 días sin que nadie la tome", () => {
    const tr = { ...base, titulo: "Configurar el pipeline", estado: "pendiente", creadaAt: "2026-09-01T00:00:00Z" };
    expect(sugerenciaDeCierre({ ...tr, semana: "2026-09-28" }, hoy)?.motivo).toContain("semana del");
    expect(sugerenciaDeCierre({ ...tr, semana: "2026-10-05" }, hoy)).toBeNull();
    expect(sugerenciaDeCierre(tr, hoy)?.motivo).toMatch(/^Nadie la tomó en \d+ días\.$/);
    expect(sugerenciaDeCierre({ ...tr, creadaAt: "2026-10-01T00:00:00Z" }, hoy)).toBeNull();
  });

  it("nunca una de HubSpot, una cerrada ni una propuesta sin fecha", () => {
    expect(sugerenciaDeCierre({ ...base, origen: "hubspot", estado: "pendiente", venceEl: "2026-09-01" }, hoy)).toBeNull();
    expect(sugerenciaDeCierre({ ...base, estado: "hecha", venceEl: "2026-09-01" }, hoy)).toBeNull();
    expect(sugerenciaDeCierre({ ...base, estado: "no_se_hara", venceEl: "2026-09-01" }, hoy)).toBeNull();
    expect(sugerenciaDeCierre({ ...base, creadaAt: "2026-08-01T00:00:00Z" }, hoy)).toBeNull();
  });
});

describe("limpiezaDePorDecidir (D2 etapa 1)", () => {
  const hoy = "2026-10-27";
  const s = (id: string, email: string, creadaAt: string, venceEl: string | null = null, numero = 1) => ({ id, responsableEmail: email, creadaAt, venceEl, numero });

  it("vence lo que ya pasó, sea de la clase que sea, y deja lo de hoy en adelante", () => {
    const r = limpiezaDePorDecidir([s("a", "ana@x", "2026-10-20T10:00:00Z", "2026-10-26"), s("b", "ana@x", "2026-10-20T10:00:00Z", "2026-10-27"), s("c", "ana@x", "2026-10-20T10:00:00Z")], hoy, 5);
    expect(r).toEqual([{ id: "a", regla: "fecha", motivo: expect.stringContaining("pasó sin que nadie la decidiera") }]);
  });

  it("a cada persona le quedan sus N más nuevas; lo vencido por fecha no ocupa lugar", () => {
    const filas = [
      ...Array.from({ length: 7 }, (_, i) => s(`ana${i}`, "ana@x", `2026-10-${String(10 + i).padStart(2, "0")}T10:00:00Z`, null, i)),
      s("viejaConFecha", "ana@x", "2026-10-01T10:00:00Z", "2026-10-02"),
      s("leo", "leo@x", "2026-10-01T10:00:00Z"),
    ];
    const r = limpiezaDePorDecidir(filas, hoy, 5);
    expect(r.filter((x) => x.regla === "tope").map((x) => x.id).sort()).toEqual(["ana0", "ana1"]);
    expect(r.filter((x) => x.regla === "fecha").map((x) => x.id)).toEqual(["viejaConFecha"]);
    expect(r.some((x) => x.id === "leo")).toBe(false);
  });

  it("lo del sprint no ocupa lugar ni lo vence el tope (2026-10-27); su fecha sí cuenta", () => {
    const filas = [
      ...Array.from({ length: 7 }, (_, i) => ({ ...s(`sprint${i}`, "ana@x", `2026-10-${String(10 + i).padStart(2, "0")}T10:00:00Z`, null, i), delSprint: true })),
      ...Array.from({ length: 5 }, (_, i) => s(`cliente${i}`, "ana@x", `2026-10-0${1 + i}T10:00:00Z`, null, 20 + i)),
      { ...s("sprintConFecha", "ana@x", "2026-10-01T10:00:00Z", "2026-10-02"), delSprint: true },
    ];
    const r = limpiezaDePorDecidir(filas, hoy, 5);
    expect(r.filter((x) => x.regla === "tope")).toEqual([]);
    expect(r.map((x) => x.id)).toEqual(["sprintConFecha"]);
  });

  it("el mismo día, gana el número más alto (la última que nació)", () => {
    const r = limpiezaDePorDecidir([s("x", "ana@x", "2026-10-20T10:00:00Z", null, 1), s("y", "ana@x", "2026-10-20T10:00:00Z", null, 2)], hoy, 1);
    expect(r.map((x) => x.id)).toEqual(["x"]);
  });
});
