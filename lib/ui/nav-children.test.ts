/**
 * lib/ui/nav-children.test.ts — visibilidad y estado activo de los HIJOS del flyout.
 *
 * El hueco que dejaba `nav-gates.test.ts`: ese congela quién ve cada ítem de PRIMER
 * nivel, pero `canSeeNavItem` no mira `children` y el filtro de hijos vivía inline en
 * el JSX del Sidebar — o sea, nadie verificaba que un hijo `costosOnly` no se le
 * escape a un ADMIN.
 *
 * Prueba las funciones PURAS que el Sidebar y el flyout consumen de verdad
 * (`visibleNavChildren`, `isChildActive`). Si el test re-implementara la regla no
 * probaría nada: es exactamente el modo en que un productor y su consumidor divergen
 * sin que nadie lo vea.
 */
import { describe, it, expect } from "vitest";
import {
  APP_NAV,
  visibleNavChildren,
  isChildActive,
  groupNavChildren,
} from "@/components/layout/nav-config";

const finanzas = APP_NAV.find((i) => i.key === "finanzas")!;
const hrefs = (ctx: { isCostos: boolean }) => visibleNavChildren(finanzas, ctx).map((c) => c.href);

describe("visibleNavChildren — el filtro costosOnly del Sidebar", () => {
  it("la entrada Finanzas existe y tiene hijos (guard del fixture)", () => {
    expect(finanzas).toBeDefined();
    expect((finanzas.children ?? []).length).toBeGreaterThan(0);
  });

  it("un rol de Costos ve TODOS los hijos, en el orden de la config", () => {
    const visibles = visibleNavChildren(finanzas, { isCostos: true });
    expect(visibles.map((c) => c.href)).toEqual((finanzas.children ?? []).map((c) => c.href));
  });

  it("sin rol de Costos NO se filtra ningún hijo marcado costosOnly", () => {
    // Con el permiso de gastos (el que trae ADMIN): lo que queda es exactamente lo que NO es costosOnly.
    const conGastos = { v: 1 as const, sections: { gastos: { read: true } } };
    const visibles = visibleNavChildren(finanzas, { isCostos: false, permissions: conGastos });
    expect(visibles.every((c) => !c.costosOnly)).toBe(true);
    expect(visibles.map((c) => c.href)).toEqual(
      (finanzas.children ?? []).filter((c) => !c.costosOnly).map((c) => c.href),
    );
  });

  it("sin el permiso de gastos no aparecen Gastos del mes, Recurrentes ni Tarjetas", () => {
    const hs = visibleNavChildren(finanzas, { isCostos: false, vista: "REGISTRA" }).map((c) => c.href);
    const DE_GASTOS = ["/finanzas/gastos", "/finanzas/recurrentes", "/finanzas/tarjetas"];
    for (const h of DE_GASTOS) expect(hs, `${h} aparece sin el permiso de gastos`).not.toContain(h);
    // Y con el permiso aparecen los tres: si una ruta cambiara de nombre, el «no aparece» de arriba pasaría en vacío.
    const conGastos = { v: 1 as const, sections: { gastos: { read: true } } };
    const conPermiso = visibleNavChildren(finanzas, { isCostos: false, vista: "REGISTRA", permissions: conGastos }).map((c) => c.href);
    for (const h of DE_GASTOS) expect(conPermiso, `${h} no aparece ni con el permiso de gastos`).toContain(h);
  });

  it("Cobranza la ve cualquier rol con el gate del padre; el resto de Finanzas no", () => {
    expect(hrefs({ isCostos: false })).toContain("/cobranza");
    expect(hrefs({ isCostos: false })).not.toContain("/finanzas/caja-neta");
    expect(hrefs({ isCostos: true })).toContain("/finanzas/caja-neta");
  });

  it("un ítem sin children devuelve lista vacía (no revienta)", () => {
    const clients = APP_NAV.find((i) => i.key === "clients")!;
    expect(visibleNavChildren(clients, { isCostos: true })).toEqual([]);
  });

  it("ningún hijo costosOnly está en el panel de quien registra", () => {
    // Quien registra (ADMIN) no es rol de Costos: un costosOnly en su vista sería un ítem que su propio panel promete y
    // el filtro le saca — el encabezado de su bloque quedaría prometiendo de más.
    for (const c of finanzas.children ?? []) {
      if (!c.costosOnly) continue;
      expect(c.vistas?.includes("REGISTRA") ?? true, `${c.href} es costosOnly y está en la vista REGISTRA`).toBe(false);
    }
  });

  it("higiene: los href de un mismo flyout son únicos", () => {
    for (const item of APP_NAV) {
      const hs = (item.children ?? []).map((c) => c.href);
      expect(new Set(hs).size, `${item.key} repite un href`).toBe(hs.length);
    }
  });
});

describe("groupNavChildren — los bloques con encabezado del flyout", () => {
  it("agrupa runs CONSECUTIVOS, respetando el orden de la config", () => {
    const bloques = groupNavChildren([
      { href: "/a", section: "Uno" },
      { href: "/b", section: "Uno" },
      { href: "/c", section: "Dos" },
      { href: "/d" },
    ]);
    expect(bloques.map((b) => b.section)).toEqual(["Uno", "Dos", undefined]);
    expect(bloques[0].items.map((i) => i.href)).toEqual(["/a", "/b"]);
    expect(bloques[2].items.map((i) => i.href)).toEqual(["/d"]);
  });

  it("una sección repetida NO se re-agrupa: se ven dos bloques (la señal correcta)", () => {
    const bloques = groupNavChildren([
      { href: "/a", section: "Uno" },
      { href: "/b", section: "Dos" },
      { href: "/c", section: "Uno" },
    ]);
    expect(bloques.map((b) => b.section)).toEqual(["Uno", "Dos", "Uno"]);
  });

  it("lista vacía → cero bloques", () => {
    expect(groupNavChildren([])).toEqual([]);
  });

  it("NINGÚN encabezado queda huérfano cuando se filtra un bloque entero", () => {
    // Es la razón de ser de `section` como pertenencia: el filtrado corre ANTES
    // del agrupado, así que una sección sin hijos visibles simplemente no existe.
    const bloques = groupNavChildren(visibleNavChildren(finanzas, { isCostos: false }));
    for (const b of bloques) expect(b.items.length).toBeGreaterThan(0);
    expect(bloques.map((b) => b.section)).not.toContain("Costos y gastos");
  });

  // ── El panel de cada vista (rediseño de Finanzas, 2026-10-03, lib/finanzas/vista.ts) ──
  const conGastos = { v: 1 as const, sections: { gastos: { read: true } } };
  const panel = (vista: "REGISTRA" | "SUPERVISA" | "DIRECCION", isCostos: boolean) =>
    groupNavChildren(visibleNavChildren(finanzas, { isCostos, vista, permissions: conGastos }));

  it("quien registra: Mi día · Ingresos · Costos y gastos (sin planilla) · Cuadre, sin reportes", () => {
    const bloques = panel("REGISTRA", false);
    expect(bloques.map((b) => b.section)).toEqual(["Mi día", "Ingresos", "Costos y gastos", "Cuadre"]);
    expect(bloques[2].items.map((i) => i.href)).toEqual(["/finanzas/gastos", "/finanzas/recurrentes", "/finanzas/tarjetas"]);
    expect(bloques[0].items.map((i) => i.href)).toEqual(["/finanzas/pendientes"]);
    const hrefs = bloques.flatMap((b) => b.items.map((i) => i.href));
    expect(hrefs).not.toContain("/finanzas/equilibrio");
    expect(hrefs).not.toContain("/finanzas/costos/planillas");
  });

  it("quien supervisa: Mi área · Ingresos · Costos y gastos · Cuadre · Reportes, sin la entrada de quien registra", () => {
    const bloques = panel("SUPERVISA", true);
    expect(bloques.map((b) => b.section)).toEqual(["Mi área", "Ingresos", "Costos y gastos", "Cuadre", "Reportes"]);
    expect(bloques[0].items.map((i) => i.href)).toEqual(["/finanzas/supervision", "/finanzas/cierre"]);
    const hrefs = bloques.flatMap((b) => b.items.map((i) => i.href));
    expect(hrefs).not.toContain("/finanzas/pendientes");
    expect(hrefs).toContain("/finanzas/costos/planillas");
    expect(hrefs).toContain("/finanzas/reportes");
  });

  it("dirección: solo Reportes — punto de equilibrio, caja neta, rentabilidad, tipo de cambio e integraciones", () => {
    const bloques = panel("DIRECCION", true);
    expect(bloques.map((b) => b.section)).toEqual(["Reportes"]);
    expect(bloques[0].items.map((i) => i.href)).toEqual([
      "/finanzas/equilibrio",
      "/finanzas/caja-neta",
      "/finanzas/rentabilidad",
      "/finanzas/tipo-de-cambio",
      "/finanzas/integraciones",
    ]);
  });

  it("todo hijo de Finanzas dice en qué vistas va (un hijo sin `vistas` aparecería en las tres)", () => {
    for (const c of finanzas.children ?? []) expect(c.vistas, `${c.href} no declara sus vistas`).toBeDefined();
  });

  it("higiene: un typo en `section` crearía un bloque extra — hoy hay exactamente 6", () => {
    const secciones = (finanzas.children ?? []).map((c) => c.section).filter(Boolean);
    expect(new Set(secciones)).toEqual(new Set(["Mi día", "Mi área", "Ingresos", "Costos y gastos", "Cuadre", "Reportes"]));
  });
});

describe("isChildActive — el predicado de activo del flyout", () => {
  it("por default matchea por prefijo", () => {
    expect(isChildActive({ href: "/cobranza" }, "/cobranza")).toBe(true);
    expect(isChildActive({ href: "/cobranza" }, "/cobranza/importar")).toBe(true);
    expect(isChildActive({ href: "/cobranza" }, "/finanzas/costos")).toBe(false);
  });

  it("`match` agrega prefijos extra", () => {
    const child = { href: "/a", match: ["/a", "/b"] as const };
    expect(isChildActive(child, "/b/algo")).toBe(true);
    expect(isChildActive(child, "/c")).toBe(false);
  });

  it("`exact` exige igualdad — lo necesita una hoja que es padre de otras", () => {
    const resumen = { href: "/finanzas/costos", exact: true };
    expect(isChildActive(resumen, "/finanzas/costos")).toBe(true);
    // Sin `exact` esto daría true y el Resumen quedaría activo en sus hojas hijas.
    expect(isChildActive(resumen, "/finanzas/costos/herramientas")).toBe(false);
  });

  it("ningún hijo de Finanzas queda activo en la ruta de otro", () => {
    for (const child of finanzas.children ?? []) {
      const otros = (finanzas.children ?? []).filter((c) => c.href !== child.href);
      for (const otro of otros) {
        expect(
          isChildActive(child, otro.href),
          `${child.href} se marca activo en ${otro.href}`,
        ).toBe(false);
      }
    }
  });
});
