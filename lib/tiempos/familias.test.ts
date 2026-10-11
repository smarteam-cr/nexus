import { describe, expect, it } from "vitest";
import { CLAVES_DE_FAMILIA, FAMILIAS, FAMILIAS_POR_NOMBRE, familiaDe, normalizarTitulo } from "./familias";

describe("las 12 tareas clave", () => {
  it("son 12, con claves únicas y en el mismo orden que CLAVES_DE_FAMILIA", () => {
    expect(FAMILIAS).toHaveLength(12);
    expect(FAMILIAS.map((f) => f.clave)).toEqual([...CLAVES_DE_FAMILIA]);
    expect(FAMILIAS_POR_NOMBRE.map((f) => f.nombre)).toEqual([...FAMILIAS.map((f) => f.nombre)].sort((a, b) => a.localeCompare(b, "es")));
  });

  it("se reconocen sin importar mayúsculas ni tildes", () => {
    expect(normalizarTitulo("Integración ÁPI")).toBe("integracion api");
    expect(familiaDe("Configurar la INTEGRACIÓN con Odoo")).toBe("integracion");
    expect(familiaDe("Configurar pipeline de ventas y etapas")).toBe("pipeline");
    expect(familiaDe("Importar base de datos a HubSpot")).toBe("migracion");
    expect(familiaDe("Diseñar y configurar workflows de nurturing")).toBe("automatizaciones");
    expect(familiaDe("Construir dashboards de servicio al cliente")).toBe("reportes");
    expect(familiaDe("Configurar usuarios y permisos del equipo")).toBe("usuarios");
  });

  it("una tarea cae en UNA sola familia: la actividad gana al objeto", () => {
    expect(familiaDe("Capacitación sobre el pipeline de ventas")).toBe("capacitacion");
    expect(familiaDe("Configurar la integración de WhatsApp Business")).toBe("integracion");
    expect(familiaDe("Construir dashboards de performance de email marketing")).toBe("reportes");
  });

  it("las que no calzan son comunes, y no se cuelan por palabras parecidas", () => {
    expect(familiaDe("Kickoff con el cliente")).toBeNull();
    expect(familiaDe("Backlog de mejoras para la siguiente etapa")).toBeNull();
    expect(familiaDe("Crear el Custom Object 'Casos Migratorios'")).toBeNull();
    expect(familiaDe("Conectar distribución con calendario del equipo")).toBeNull();
    expect(familiaDe("Revisar el botón de compra")).toBeNull();
    expect(familiaDe("Integrantes del comité")).toBeNull();
    expect(familiaDe("")).toBeNull();
    expect(familiaDe(null)).toBeNull();
  });
});
