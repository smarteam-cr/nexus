import { describe, expect, it } from "vitest";
import { duenoDelProyecto, encargadoDelProyecto, encargadoEnLaFecha, ownerQueSeGuarda, propiedadesDeEncargados, propiedadesDelPaseEnElProyecto } from "./encargados";

describe("quién lleva un proyecto: manda el propietario (2026-10-29)", () => {
  it("el propietario gana sobre «CSE Encargado» y «CSL Encargado»", () => {
    expect(encargadoDelProyecto({ hubspot_owner_id: "900", cse_encargado: "111", csl_encargado: "222" })).toBe("900");
  });

  it("sin propietario, «CSE Encargado»; sin él, «CSL Encargado»; sin nada, nadie", () => {
    expect(encargadoDelProyecto({ hubspot_owner_id: " ", cse_encargado: "111", csl_encargado: "222" })).toBe("111");
    expect(encargadoDelProyecto({ hubspot_owner_id: null, cse_encargado: " ", csl_encargado: "222" })).toBe("222");
    expect(encargadoDelProyecto({ hubspot_owner_id: null, cse_encargado: null, csl_encargado: null })).toBeNull();
  });

  it("el respaldo (por si HubSpot no da el correo del propietario) es el CSE Encargado, si es otra persona", () => {
    expect(duenoDelProyecto({ hubspot_owner_id: "900", cse_encargado: "111", csl_encargado: "222" })).toEqual({ principal: "900", respaldo: "111" });
    expect(duenoDelProyecto({ hubspot_owner_id: "111", cse_encargado: "111", csl_encargado: "222" })).toEqual({ principal: "111", respaldo: null });
    expect(duenoDelProyecto({ hubspot_owner_id: null, cse_encargado: "111", csl_encargado: "222" })).toEqual({ principal: "111", respaldo: null });
    expect(duenoDelProyecto({ hubspot_owner_id: null, cse_encargado: null, csl_encargado: "222" })).toEqual({ principal: "222", respaldo: null });
    expect(duenoDelProyecto({})).toEqual({ principal: null, respaldo: null });
  });
});

describe("qué owner se guarda en el proyecto: id y correo del mismo owner", () => {
  const dueno = { principal: "900", respaldo: "111" };
  const propietario = { name: "Propietaria", email: "propia@smarteam.com" };
  const cse = { name: "CSE", email: "cse@smarteam.com" };
  const archivado = { name: null, email: null };
  const sinRespuesta = { name: null, email: null, sinRespuesta: true };

  it("con el propietario vivo, el propietario", () => {
    expect(ownerQueSeGuarda(dueno, propietario, cse)).toEqual({ id: "900", name: "Propietaria", email: "propia@smarteam.com" });
  });

  it("con el propietario archivado, el respaldo entero: si cambia «CSE Encargado», cambia el id y el pase lo ve", () => {
    expect(ownerQueSeGuarda(dueno, archivado, cse)).toEqual({ id: "111", name: "CSE", email: "cse@smarteam.com" });
    const otro = ownerQueSeGuarda({ principal: "900", respaldo: "222" }, archivado, { name: "Otra", email: "otra@smarteam.com" });
    expect(otro?.id).toBe("222");
  });

  it("si HubSpot no contestó por quien hacía falta, no se toca nada (null), haya o no respaldo", () => {
    expect(ownerQueSeGuarda(dueno, sinRespuesta, cse)).toBeNull();
    expect(ownerQueSeGuarda({ principal: "900", respaldo: null }, sinRespuesta, archivado)).toBeNull();
    expect(ownerQueSeGuarda(dueno, archivado, sinRespuesta)).toBeNull();
  });

  it("el nombre es del mismo owner que el correo: nunca el correo de uno con el nombre de otro", () => {
    expect(ownerQueSeGuarda(dueno, { name: null, email: "propia@smarteam.com" }, cse)).toEqual({ id: "900", name: null, email: "propia@smarteam.com" });
  });

  it("sin correo de nadie, el id del principal y ningún correo", () => {
    expect(ownerQueSeGuarda(dueno, archivado, archivado)).toEqual({ id: "900", name: null, email: null });
    expect(ownerQueSeGuarda({ principal: "900", respaldo: null }, archivado, { name: null, email: null })).toEqual({ id: "900", name: null, email: null });
  });
});

describe("lo que escribe el pase de cuenta", () => {
  it("en la empresa y sus contactos, solo los dos encargados (el propietario de la empresa es el vendedor)", () => {
    expect(propiedadesDeEncargados({ cse: "1", csl: null })).toEqual({ cse_encargado: "1" });
    expect(propiedadesDeEncargados({ cse: "1", csl: "2" })).toEqual({ cse_encargado: "1", csl_encargado: "2" });
  });

  it("en el proyecto, además el propietario: si no, el espejo seguiría leyendo al de antes", () => {
    const escrito = propiedadesDelPaseEnElProyecto({ cse: "1", csl: "2" });
    expect(escrito).toEqual({ hubspot_owner_id: "1", cse_encargado: "1", csl_encargado: "2" });
    expect(encargadoDelProyecto({ hubspot_owner_id: "900", cse_encargado: "111", ...escrito })).toBe("1");
  });
});

describe("encargadoEnLaFecha (la historia de HubSpot)", () => {
  const cse = [{ value: "98665525", timestamp: "2026-10-15T01:28:05Z" }, { value: "87810520", timestamp: "2026-10-13T12:00:00Z" }];
  const csl = [{ value: "96588400", timestamp: "2026-10-13T12:00:00Z" }, { value: "87810520", timestamp: "2026-08-03T00:00:00Z" }];

  it("sin propietario, el CSE vivía en «CSL Encargado» antes del 13 oct y en «CSE Encargado» después", () => {
    expect(encargadoEnLaFecha({ cse, csl }, new Date("2026-09-20T00:00:00Z"))).toBe("87810520");
    expect(encargadoEnLaFecha({ cse, csl }, new Date("2026-10-14T00:00:00Z"))).toBe("87810520");
    expect(encargadoEnLaFecha({ cse, csl }, new Date("2026-10-19T00:00:00Z"))).toBe("98665525");
  });
  it("con propietario en esa fecha, manda el propietario", () => {
    const propietario = [{ value: "555", timestamp: "2026-10-16T00:00:00Z" }];
    expect(encargadoEnLaFecha({ propietario, cse, csl }, new Date("2026-10-15T12:00:00Z"))).toBe("98665525");
    expect(encargadoEnLaFecha({ propietario, cse, csl }, new Date("2026-10-19T00:00:00Z"))).toBe("555");
  });
  it("sin historia hasta esa fecha, nadie", () => {
    expect(encargadoEnLaFecha({ cse, csl }, new Date("2026-01-01T00:00:00Z"))).toBeNull();
  });
});
