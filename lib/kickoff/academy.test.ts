/**
 * lib/kickoff/academy.test.ts — la ruta de HubSpot Academy y el acceso al portal del kickoff (área Q, 2026-10-27).
 */
import { describe, it, expect } from "vitest";
import {
  copiaParaElKickoff,
  duracionEnPalabras,
  enlaceDeAcademyValido,
  porQueNoSeGuarda,
  porRol,
  rolesParaLosHubs,
  rutaDeAcademyVacia,
  rutaSugerida,
  type ListaDelCatalogo,
} from "./academy";
import { accesoPedidoDe, diasHabilesEntre, faltaElAcceso, paraCuandoEnPalabras, pasosDelAcceso, pedidoDesde, tuRolVacia } from "./acceso-al-portal";

const lista = (o: Partial<ListaDelCatalogo>): ListaDelCatalogo => ({
  id: o.id ?? "l1",
  nombre: o.nombre ?? "Lista",
  enlace: o.enlace ?? "https://academy.hubspot.com/x",
  hub: o.hub ?? "general",
  rol: o.rol ?? "lideres",
  duracionMinutos: o.duracionMinutos ?? 60,
  orden: o.orden ?? 0,
  activa: o.activa ?? true,
});

const catalogo = [
  lista({ id: "a", nombre: "HubSpot para líderes", rol: "lideres" }),
  lista({ id: "b", nombre: "Sales Hub básico", hub: "sales_hub", rol: "ventas", orden: 2 }),
  lista({ id: "c", nombre: "Prospección", hub: "sales_hub", rol: "ventas", orden: 1 }),
  lista({ id: "d", nombre: "Marketing Hub", hub: "marketing_hub", rol: "marketing" }),
  lista({ id: "e", nombre: "Archivada", rol: "lideres", activa: false }),
  lista({ id: "f", nombre: "Reportes para ventas", hub: "general", rol: "ventas" }),
];

describe("la ruta de HubSpot Academy", () => {
  it("sugiere por los hubs vendidos y los roles que piden, en orden; líderes siempre, archivadas nunca", () => {
    expect(rolesParaLosHubs(["sales_hub"])).toEqual(["lideres", "ventas"]);
    expect(rutaSugerida(catalogo, ["sales_hub"]).map((l) => l.nombre)).toEqual(["HubSpot para líderes", "Reportes para ventas", "Prospección", "Sales Hub básico"]);
    // Sin hubs vendidos, solo lo general de líderes.
    expect(rutaSugerida(catalogo, []).map((l) => l.nombre)).toEqual(["HubSpot para líderes"]);
  });

  it("el kickoff guarda una copia: archivar en el catálogo no lo cambia", () => {
    const copia = copiaParaElKickoff(catalogo[1]);
    expect(copia).toMatchObject({ catalogoId: "b", nombre: "Sales Hub básico", duracion: "1 h", rol: "ventas", hub: "sales_hub" });
    expect(porRol([copia, copiaParaElKickoff(catalogo[0])]).map((g) => g.etiqueta)).toEqual(["Líderes", "Ventas"]);
  });

  it("vacía no se ve; un enlace que no es https no cuenta", () => {
    expect(rutaDeAcademyVacia({ listas: [] })).toBe(true);
    expect(rutaDeAcademyVacia({ listas: [{ nombre: "X", enlace: "javascript:alert(1)" }] })).toBe(true);
    expect(rutaDeAcademyVacia({ listas: [{ nombre: "X", enlace: "https://academy.hubspot.com" }] })).toBe(false);
    expect(enlaceDeAcademyValido("http://academy.hubspot.com")).toBe(false);
  });

  it("el catálogo pide nombre, https, hub y rol", () => {
    expect(porQueNoSeGuarda({ nombre: "", enlace: "https://x.com", hub: "general", rol: "lideres" })).toMatch(/nombre/);
    expect(porQueNoSeGuarda({ nombre: "A", enlace: "x.com", hub: "general", rol: "lideres" })).toMatch(/https/);
    expect(porQueNoSeGuarda({ nombre: "A", enlace: "https://x.com", hub: "otro", rol: "lideres" })).toMatch(/hub/);
    expect(porQueNoSeGuarda({ nombre: "A", enlace: "https://x.com", hub: "general", rol: "jefes" })).toMatch(/quién/);
    expect(porQueNoSeGuarda({ nombre: "A", enlace: "https://x.com", hub: "general", rol: "lideres", duracionMinutos: -1 })).toMatch(/minutos/);
    expect(porQueNoSeGuarda({ nombre: "A", enlace: "https://x.com", hub: "general", rol: "lideres", duracionMinutos: null })).toBeNull();
    expect(duracionEnPalabras(90)).toBe("1 h 30 min");
    expect(duracionEnPalabras(null)).toBe("");
  });
});

describe("el acceso al portal", () => {
  it("la tarjeta usa lo que ajustó el CSE, o lo de siempre", () => {
    expect(pasosDelAcceso({})[1]).toContain("el correo de tu consultor de Smarteam");
    expect(pasosDelAcceso({ correo: "caroline@smarteam.com", permisos: "Ventas" }).join(" ")).toContain("caroline@smarteam.com");
    expect(paraCuandoEnPalabras("2026-11-03")).toBe("el 3 de noviembre");
    expect(paraCuandoEnPalabras("")).toBe("antes de la primera sesión de trabajo");
    expect(accesoPedidoDe({ acceso: { correo: " a@b.com " } })).toEqual({ correo: "a@b.com", permisos: "", para: "" });
  });

  it("con la tarjeta, «Lo que necesitamos de tu equipo» nunca está vacía; sin ella, como la prosa", () => {
    expect(tuRolVacia({ acceso: {} })).toBe(false);
    expect(tuRolVacia({ items: [] })).toBe(true);
    expect(tuRolVacia({ items: [{ title: "Datos" }] })).toBe(false);
  });

  it("días hábiles y a quién se le avisa", () => {
    // Lunes 26 oct → lunes 2 nov: 5 días hábiles.
    expect(diasHabilesEntre(new Date("2026-10-26T12:00:00Z"), new Date("2026-11-02T12:00:00Z"))).toBe(5);
    const publicado = new Date("2026-11-02T15:00:00Z");
    const tarjeta = { desde: "2026-10-28T15:00:00Z" };
    expect(faltaElAcceso({ kickoffPublishedAt: publicado, accesoAlPortalDadoEn: null, status: "active", tarjeta })).toBe(true);
    expect(faltaElAcceso({ kickoffPublishedAt: publicado, accesoAlPortalDadoEn: new Date(), status: "active", tarjeta })).toBe(false);
    // Un kickoff sin la tarjeta no pidió el acceso: no avisa (los proyectos de antes).
    expect(faltaElAcceso({ kickoffPublishedAt: publicado, accesoAlPortalDadoEn: null, tarjeta: null })).toBe(false);
    expect(faltaElAcceso({ kickoffPublishedAt: publicado, accesoAlPortalDadoEn: null, status: "completed", tarjeta })).toBe(false);
    // Los días cuentan desde la tarjeta, no desde la última publicación (que se mueve con cada «Subir»).
    expect(pedidoDesde(tarjeta, publicado)?.toISOString()).toBe("2026-10-28T15:00:00.000Z");
    expect(pedidoDesde({}, publicado)).toBe(publicado);
  });
});
