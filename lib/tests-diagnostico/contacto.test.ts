/**
 * lib/tests-diagnostico/contacto.test.ts — el contacto que recuerda el navegador para «Diagnosticar otra área»: qué se
 * guarda, que vence a los 30 días y que «Diagnosticar otra empresa» lo borra junto con los tests a medias.
 */
import { describe, expect, it } from "vitest";
import { CLAVE_DEL_CONTACTO, claveDelTestAMedias, guardarContacto, leerContacto, olvidarLaEmpresa, VIDA_DEL_CONTACTO_MS, type Almacen } from "./contacto";
import { VALORES_VACIOS } from "./formulario";

function almacen(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
}

const VALORES = { ...VALORES_VACIOS, nombre: "Laura", apellido: "Mora", email: "laura@empresa.cr", dominio: "empresa.cr", telefono: "88887777", crm: "HubSpot", industria: "Turismo", area: "ventas" };
const AHORA = Date.UTC(2026, 9, 29);

describe("el contacto que recuerda el navegador", () => {
  it("guarda los datos de la persona y su empresa, nunca el área", () => {
    const a = almacen();
    guardarContacto(a, VALORES, AHORA);
    const guardado = JSON.parse(a.datos.get(CLAVE_DEL_CONTACTO)!) as { contacto: Record<string, string> };
    expect(Object.keys(guardado.contacto).sort()).toEqual(["apellido", "crm", "dominio", "email", "industria", "nombre", "pais", "telefono"]);
    expect(guardado.contacto).not.toHaveProperty("area");
    expect(leerContacto(a, AHORA)).toMatchObject({ nombre: "Laura", email: "laura@empresa.cr", industria: "Turismo" });
  });

  it("⛔ vence a los 30 días (una computadora compartida no lo hereda para siempre)", () => {
    const a = almacen();
    guardarContacto(a, VALORES, AHORA);
    expect(leerContacto(a, AHORA + VIDA_DEL_CONTACTO_MS)).not.toBeNull();
    expect(leerContacto(a, AHORA + VIDA_DEL_CONTACTO_MS + 1)).toBeNull();
  });

  it("lo que no tiene la forma esperada no se lee; un campo raro vuelve a vacío", () => {
    const a = almacen();
    a.setItem(CLAVE_DEL_CONTACTO, "{roto");
    expect(leerContacto(a, AHORA)).toBeNull();
    a.setItem(CLAVE_DEL_CONTACTO, JSON.stringify({ contacto: { nombre: "Sin fecha" } }));
    expect(leerContacto(a, AHORA)).toBeNull();
    a.setItem(CLAVE_DEL_CONTACTO, JSON.stringify({ ts: AHORA, contacto: { nombre: 7, email: "x@y.cr" } }));
    expect(leerContacto(a, AHORA)).toMatchObject({ nombre: "", email: "x@y.cr" });
  });

  it("«otra empresa» borra el contacto y los tests a medias de todas las áreas, en las dos versiones", () => {
    const a = almacen();
    guardarContacto(a, VALORES, AHORA);
    for (const area of ["ventas", "marketing"]) for (const v of ["web", "marketing"]) a.setItem(claveDelTestAMedias(area, v), "token");
    a.setItem("otra:cosa", "queda");
    olvidarLaEmpresa(a, ["ventas", "marketing", "servicio"]);
    expect([...a.datos.keys()]).toEqual(["otra:cosa"]);
  });

  it("sin almacenamiento (navegación privada) no rompe nada", () => {
    const roto: Almacen = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(() => guardarContacto(roto, VALORES, AHORA)).not.toThrow();
    expect(leerContacto(roto, AHORA)).toBeNull();
    expect(() => olvidarLaEmpresa(roto, ["ventas"])).not.toThrow();
  });
});
