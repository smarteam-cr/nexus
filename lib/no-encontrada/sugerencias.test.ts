import { describe, expect, it } from "vitest";
import {
  direccionLegible,
  fichaDeLaDireccion,
  parecido,
  sugerenciasParaLaDireccion,
  type DestinoDelMenu,
} from "./sugerencias";

/** Un pedazo del menú real (components/layout/nav-config.tsx), en su orden. */
const MENU: DestinoDelMenu[] = [
  { etiqueta: "Para ti", href: "/para-ti" },
  { etiqueta: "Clientes", href: "/clients" },
  { etiqueta: "Marketing", href: "/marketing" },
  { etiqueta: "Temas", href: "/marketing/temas", padre: "Marketing" },
  { etiqueta: "Fuentes", href: "/marketing/fuentes", padre: "Marketing" },
  { etiqueta: "Éxito del cliente", href: "/customer-success" },
  { etiqueta: "Ventas", href: "/business-cases" },
  { etiqueta: "Preventa", href: "/sales/exploraciones", padre: "Ventas" },
  { etiqueta: "Propuestas", href: "/business-cases", padre: "Ventas" },
  { etiqueta: "Finanzas", href: "/finanzas" },
  { etiqueta: "Recurrentes", href: "/finanzas/recurrentes", padre: "Finanzas" },
  { etiqueta: "Planilla", href: "/finanzas/costos/planillas", padre: "Finanzas" },
  { etiqueta: "Sesiones", href: "/sessions" },
  { etiqueta: "Roles", href: "/roles" },
];

const etiquetas = (pathname: string) => sugerenciasParaLaDireccion(pathname, MENU).map((d) => d.etiqueta);

describe("sugerencias para una dirección que no existe", () => {
  it("la ruta en español lleva a la sección en inglés: /clientes → Clientes primero", () => {
    expect(etiquetas("/clientes")).toEqual(["Clientes", "Éxito del cliente"]);
  });

  it("la etiqueta del hijo gana aunque comparta la dirección con su padre (Ventas y Propuestas)", () => {
    expect(etiquetas("/propuestas")[0]).toBe("Propuestas");
    expect(etiquetas("/ventas/propuestas")[0]).toBe("Propuestas");
  });

  it("con una coincidencia clara no arrastra a las vecinas de la misma carpeta", () => {
    expect(etiquetas("/finanzas/costo")).toEqual(["Planilla", "Finanzas"]);
    expect(etiquetas("/marketing/temass")).toEqual(["Temas", "Marketing"]);
  });

  it("un error de tipeo también cuenta", () => {
    expect(etiquetas("/sesions")[0]).toBe("Sesiones");
  });

  it("ignora los ids y no inventa nada cuando no hay parecido", () => {
    expect(etiquetas("/cmu8x2k4e0042")).toEqual([]);
    expect(etiquetas("/zzz")).toEqual([]);
    expect(etiquetas("/")).toEqual([]);
  });

  it("no repite una dirección ni pasa del tope", () => {
    const hrefs = sugerenciasParaLaDireccion("/business-cases", MENU).map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(sugerenciasParaLaDireccion("/finanzas", MENU, 2).length).toBeLessThanOrEqual(2);
  });

  it("solo propone lo que recibió: lo que la persona no puede abrir no aparece", () => {
    const sinExito = MENU.filter((d) => d.href !== "/customer-success");
    expect(sugerenciasParaLaDireccion("/clientes", sinExito).map((d) => d.etiqueta)).toEqual(["Clientes"]);
  });
});

describe("la ficha de algo que no se encontró", () => {
  it.each([
    ["/clients/abc", "No encontramos este cliente", "Clientes", "/clients"],
    ["/business-cases/abc", "No encontramos esta propuesta", "Propuestas", "/business-cases"],
    ["/roles/abc", "No encontramos este documento", "Roles", "/roles"],
    ["/sessions/abc", "No encontramos esta reunión", "Sesiones", "/sessions"],
    ["/sales/exploraciones/abc", "No encontramos esta preventa", "Preventa", "/sales/exploraciones"],
    ["/audits/abc", "No encontramos esta auditoría", "Auditoría", "/audits"],
    ["/customer-success/abc", "No encontramos esta cuenta", "Éxito del cliente", "/customer-success"],
  ])("%s", (pathname, titulo, etiqueta, href) => {
    const ficha = fichaDeLaDireccion(pathname);
    expect(ficha?.titulo).toBe(titulo);
    expect(ficha?.listado).toEqual({ etiqueta, href });
  });

  it("el detalle concuerda con el género", () => {
    expect(fichaDeLaDireccion("/clients/abc")?.detalle).toBe("Puede que lo hayan borrado o que el enlace esté incompleto.");
    expect(fichaDeLaDireccion("/sessions/abc")?.detalle).toBe("Puede que la hayan borrado o que el enlace esté incompleto.");
  });

  it("«no está compartido contigo» va SOLO en Roles, donde compartir existe", () => {
    expect(fichaDeLaDireccion("/roles/abc")).toMatchObject({
      compartible: true,
      detalle: "Puede que lo hayan borrado, que el enlace esté incompleto o que no esté compartido contigo.",
    });
    for (const p of ["/clients/a", "/business-cases/a", "/sessions/a", "/sales/exploraciones/a", "/audits/a", "/customer-success/a"]) {
      expect(fichaDeLaDireccion(p)?.compartible).toBe(false);
      expect(fichaDeLaDireccion(p)?.detalle).not.toContain("compartid");
    }
  });

  it("el listado mismo no es una ficha, y lo que no es de una ficha tampoco", () => {
    expect(fichaDeLaDireccion("/clients")).toBeNull();
    expect(fichaDeLaDireccion("/clients/")).toBeNull();
    expect(fichaDeLaDireccion("/clientes/abc")).toBeNull();
    expect(fichaDeLaDireccion("/sales/otra")).toBeNull();
  });
});

describe("piezas", () => {
  it("la dirección se muestra legible", () => {
    expect(direccionLegible("/%C3%A9xito/")).toBe("/éxito");
    expect(direccionLegible("/%E0%A4%A")).toBe("/%E0%A4%A");
    expect(direccionLegible("/")).toBe("/");
  });

  it("parecido: igual, singular, prefijo, tipeo y nada", () => {
    expect(parecido("clientes", "clientes")).toBe(3);
    expect(parecido("cliente", "clientes")).toBe(3);
    expect(parecido("costo", "costos")).toBe(3);
    expect(parecido("clientes", "clients")).toBe(2);
    expect(parecido("temass", "temas")).toBe(2);
    expect(parecido("ti", "tu")).toBe(0);
    expect(parecido("ventas", "roles")).toBe(0);
  });
});
