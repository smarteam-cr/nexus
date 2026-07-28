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
    const visibles = visibleNavChildren(finanzas, { isCostos: false });
    expect(visibles.every((c) => !c.costosOnly)).toBe(true);
    // …y lo que queda es exactamente lo que NO está marcado.
    expect(visibles.map((c) => c.href)).toEqual(
      (finanzas.children ?? []).filter((c) => !c.costosOnly).map((c) => c.href),
    );
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

  it("todo hijo costosOnly vive en «Costos y gastos» o es la hoja suelta", () => {
    // Un costosOnly colgado de «Ingresos» sería un ítem invisible para ADMIN
    // dentro de un bloque que SÍ ve — el encabezado quedaría prometiendo de más.
    for (const c of finanzas.children ?? []) {
      if (!c.costosOnly) continue;
      expect(
        c.section === "Costos y gastos" || c.section === undefined,
        `${c.href} es costosOnly pero vive en la sección "${c.section}"`,
      ).toBe(true);
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

  it("con rol de Costos aparecen los dos encabezados y la hoja suelta al final", () => {
    const bloques = groupNavChildren(visibleNavChildren(finanzas, { isCostos: true }));
    expect(bloques.map((b) => b.section)).toEqual(["Ingresos", "Costos y gastos", undefined]);
    // La hoja suelta es la Caja neta: la síntesis de los dos bloques.
    expect(bloques[bloques.length - 1].items.map((i) => i.href)).toEqual(["/finanzas/caja-neta"]);
  });

  it("higiene: un typo en `section` crearía un bloque extra — hoy hay exactamente 2", () => {
    const secciones = (finanzas.children ?? []).map((c) => c.section).filter(Boolean);
    expect(new Set(secciones).size).toBe(2);
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
