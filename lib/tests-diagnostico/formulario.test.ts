import { describe, expect, it } from "vitest";
import {
  erroresDelFormulario,
  filtrar,
  limpiarDominio,
  opcionExacta,
  PAIS_POR_DEFECTO,
  telefonoE164,
  USOS_DE_CRM,
  VALORES_VACIOS,
  type ValoresDelFormulario,
} from "./formulario";
import { industriasDelFormulario } from "./direccion-publica";
import { nombreDelTest } from "./tipos";

const INDUSTRIAS = industriasDelFormulario().map((i) => i.etiqueta);
const AREAS = ["marketing", "ventas", "servicio"];
const bueno: ValoresDelFormulario = {
  nombre: "Ana",
  apellido: "Pérez",
  email: "ana@acme.com",
  dominio: "https://www.acme.com/contacto",
  pais: PAIS_POR_DEFECTO,
  telefono: "8888 7777",
  crm: "hojas de calculo (excel, google sheets)",
  industria: INDUSTRIAS[0],
  area: "ventas",
};

describe("el formulario de la portada del test (como la aplicación vieja)", () => {
  it("con todo bien escrito, no hay nada que corregir", () => {
    expect(erroresDelFormulario(bueno, INDUSTRIAS, AREAS)).toEqual({});
  });

  it("vacío, cada campo dice qué le falta, el área incluida", () => {
    const e = erroresDelFormulario(VALORES_VACIOS, INDUSTRIAS, AREAS);
    expect(Object.keys(e).sort()).toEqual(["apellido", "area", "crm", "dominio", "email", "industria", "nombre", "telefono"]);
    expect(e.area).toBe("Elige el área a diagnosticar.");
  });

  it("⛔ un correo personal no entra: se pide el del trabajo", () => {
    expect(erroresDelFormulario({ ...bueno, email: "ana@Gmail.com" }, INDUSTRIAS, AREAS).email).toMatch(/correo corporativo/);
    expect(erroresDelFormulario({ ...bueno, email: "ana@" }, INDUSTRIAS, AREAS).email).toMatch(/no parece válido/);
    expect(erroresDelFormulario({ ...bueno, dominio: "hotmail.com" }, INDUSTRIAS, AREAS).dominio).toMatch(/correo personal/);
  });

  it("⛔ el uso de CRM y la industria tienen que ser de la lista", () => {
    expect(erroresDelFormulario({ ...bueno, crm: "Excel" }, INDUSTRIAS, AREAS).crm).toBe("Elige una opción de la lista.");
    expect(erroresDelFormulario({ ...bueno, crm: "" }, INDUSTRIAS, AREAS).crm).toBe("Elige cómo gestionan hoy a sus clientes.");
    expect(erroresDelFormulario({ ...bueno, industria: "Inventada" }, INDUSTRIAS, AREAS).industria).toBe("Elige tu industria de la lista.");
    expect(erroresDelFormulario({ ...bueno, industria: "Otra" }, INDUSTRIAS, AREAS)).toEqual({});
  });

  it("el teléfono viaja en E.164 con el código del país; uno corto no pasa", () => {
    expect(telefonoE164("Costa Rica +506", "8888-7777")).toBe("+50688887777");
    expect(telefonoE164("mexico +52", "55 1234 5678")).toBe("+525512345678");
    expect(telefonoE164("Costa Rica +506", "")).toBe("");
    expect(erroresDelFormulario({ ...bueno, telefono: "12" }, INDUSTRIAS, AREAS).telefono).toMatch(/no parece válido/);
    expect(erroresDelFormulario({ ...bueno, pais: "Narnia", telefono: "88887777" }, INDUSTRIAS, AREAS).telefono).toMatch(/no parece válido/);
  });

  it("el dominio se guarda limpio; el buscador no distingue tildes ni mayúsculas", () => {
    expect(limpiarDominio(" HTTPS://www.Acme.com/contacto?x=1 ")).toBe("acme.com");
    expect(filtrar(["Educación", "Banca", "Turismo"], "educa")).toEqual(["Educación"]);
    expect(filtrar(["Educación", "Banca"], "")).toEqual(["Educación", "Banca"]);
    expect(opcionExacta(["Educación"], "EDUCACION")).toBe("Educación");
    expect(opcionExacta(["Educación"], "Educa")).toBeNull();
  });

  it("cada test dice su área: el corto de Ventas ya no se lee como «de Marketing»", () => {
    expect(nombreDelTest("1", "web")).toBe("Test web de Ventas (8 preguntas)");
    expect(nombreDelTest("1", "marketing")).toBe("Test corto de Ventas (4 preguntas)");
    expect(nombreDelTest("2", "marketing")).toBe("Test corto de Marketing (4 preguntas)");
  });
});

describe("«¿Cómo gestionan actualmente a sus clientes?» es la propiedad de HubSpot tal cual", () => {
  it("⛔ las siete opciones, con el texto exacto y en el orden de HubSpot (otro texto, HubSpot lo rechaza)", () => {
    expect(USOS_DE_CRM).toEqual([
      "HubSpot",
      "Salesforce",
      "Otro CRM (Zoho, Pipedrive, RD Station, Monday, Odoo)",
      "Hojas de cálculo (Excel, Google Sheets)",
      "En proceso de buscar un CRM",
      "Aún no usamos ninguna herramienta",
      "No lo sé",
    ]);
  });

  it("lo escrito sin tildes ni mayúsculas viaja con el valor exacto", () => {
    expect(opcionExacta(USOS_DE_CRM, "aun no usamos ninguna herramienta")).toBe("Aún no usamos ninguna herramienta");
  });

  it("⛔ el servidor solo acepta un valor de la lista; el puesto de una pestaña vieja sigue entrando", async () => {
    const { EmpezarTestSchema } = await import("./schema");
    const base = { area: "ventas", version: "web", nombre: "Ana", email: "ana@acme.com" };
    const ok = EmpezarTestSchema.safeParse({ ...base, usoDeCrm: "HubSpot" });
    expect(ok.success && ok.data.usoDeCrm).toBe("HubSpot");
    expect(EmpezarTestSchema.safeParse({ ...base, usoDeCrm: "hubspot" }).success).toBe(false);
    const sin = EmpezarTestSchema.safeParse(base);
    expect(sin.success && sin.data.usoDeCrm).toBeNull();
    expect(EmpezarTestSchema.safeParse({ ...base, puesto: "Gerente general" }).success).toBe(true);
  });
});

describe("lo que el servidor no le deja pasar al formulario", () => {
  it("⛔ un correo personal no empieza el test aunque llegue sin la portada", async () => {
    const { EmpezarTestSchema } = await import("./schema");
    const base = { area: "ventas", version: "web", nombre: "Ana", email: "ana@acme.com" };
    expect(EmpezarTestSchema.safeParse(base).success).toBe(true);
    expect(EmpezarTestSchema.safeParse({ ...base, email: "ana@gmail.com" }).success).toBe(false);
    expect(EmpezarTestSchema.safeParse({ ...base, apellido: "Pérez" }).success).toBe(true);
  });

  it("la industria que se ve se guarda con su valor de la lista (la que elige la edición)", async () => {
    const { valorDeLaIndustria } = await import("./direccion-publica");
    for (const i of industriasDelFormulario()) expect(valorDeLaIndustria(i.etiqueta)).toBe(i.valor);
    expect(valorDeLaIndustria("Inventada")).toBe("");
    expect(valorDeLaIndustria("Otra")).toBe("Otra");
  });
});
