import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import {
  candidatosDelProyecto,
  encargadoDelProyecto,
  encargadoEnLaFecha,
  escribirSinLaRetirada,
  esDelEquipoTecnico,
  ownerQueSeGuarda,
  propiedadesDeEncargados,
  propiedadesDelPaseEnElProyecto,
  propietarioPorMigrar,
} from "./encargados";

const SIN_REGLA = { deCs: false, tecnicos: new Set<string>() };

describe("quién lleva un proyecto: manda el propietario (2026-10-29)", () => {
  it("el propietario gana sobre «CSE Encargado» y «CSL Encargado»", () => {
    expect(encargadoDelProyecto({ hubspot_owner_id: "900", cse_encargado: "111", csl_encargado: "222" })).toBe("900");
  });

  it("sin propietario, «CSE Encargado»; sin él, «CSL Encargado»; sin nada, nadie", () => {
    expect(encargadoDelProyecto({ hubspot_owner_id: " ", cse_encargado: "111", csl_encargado: "222" })).toBe("111");
    expect(encargadoDelProyecto({ hubspot_owner_id: null, cse_encargado: " ", csl_encargado: "222" })).toBe("222");
    expect(encargadoDelProyecto({ hubspot_owner_id: null, cse_encargado: null, csl_encargado: null })).toBeNull();
  });

  it("los candidatos van en orden y sin repetir", () => {
    expect(candidatosDelProyecto({ hubspot_owner_id: "900", cse_encargado: "111", csl_encargado: "222" })).toEqual(["900", "111"]);
    expect(candidatosDelProyecto({ hubspot_owner_id: "111", cse_encargado: "111", csl_encargado: "222" })).toEqual(["111"]);
    expect(candidatosDelProyecto({ hubspot_owner_id: "900", cse_encargado: null, csl_encargado: "222" })).toEqual(["900", "222"]);
    expect(candidatosDelProyecto({ hubspot_owner_id: null, cse_encargado: null, csl_encargado: "222" })).toEqual(["222"]);
    expect(candidatosDelProyecto({})).toEqual([]);
  });
});

describe("qué owner se guarda en el proyecto: id y correo del mismo owner", () => {
  const propietario = { id: "900", name: "Propietaria", email: "propia@smarteam.com" };
  const cse = { id: "111", name: "CSE", email: "cse@smarteam.com" };
  const archivado = { id: "900", name: null, email: null };
  const sinRespuesta = { id: "900", name: null, email: null, sinRespuesta: true };

  it("con el propietario vivo, el propietario", () => {
    expect(ownerQueSeGuarda([propietario, cse], SIN_REGLA)).toEqual(propietario);
  });

  it("con el propietario archivado, el que sigue entero: si cambia «CSE Encargado», cambia el id y el pase lo ve", () => {
    expect(ownerQueSeGuarda([archivado, cse], SIN_REGLA)).toEqual(cse);
  });

  it("si HubSpot no contestó por quien hacía falta, no se toca nada (null), haya o no quien siga", () => {
    expect(ownerQueSeGuarda([sinRespuesta, cse], SIN_REGLA)).toBeNull();
    expect(ownerQueSeGuarda([sinRespuesta], SIN_REGLA)).toBeNull();
    expect(ownerQueSeGuarda([archivado, { ...cse, email: null, sinRespuesta: true }], SIN_REGLA)).toBeNull();
  });

  it("el nombre es del mismo owner que el correo: nunca el correo de uno con el nombre de otro", () => {
    expect(ownerQueSeGuarda([{ ...propietario, name: null }, cse], SIN_REGLA)).toEqual({ id: "900", name: null, email: "propia@smarteam.com" });
  });

  it("sin correo de nadie, el id del primero y ningún correo; sin candidatos, nadie", () => {
    expect(ownerQueSeGuarda([archivado, { ...cse, name: null, email: null }], SIN_REGLA)).toEqual({ id: "900", name: null, email: null });
    expect(ownerQueSeGuarda([], SIN_REGLA)).toEqual({ id: null, name: null, email: null });
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

describe("el propietario según el pipeline (2026-10-30)", () => {
  const tecnico = { id: "900", name: "Alejandro Salas", email: "ASalas@smarteamcr.com" };
  const otroTecnico = { id: "901", name: "Breiner Salas", email: "bsalas@smarteamcr.com" };
  const heiver = { id: "111", name: "Heiver Gómez", email: "heiver@smarteamcr.com" };
  const laCsl = { id: "222", name: "La CSL", email: "csl@smarteamcr.com" };
  const tecnicos = new Set(["asalas@smarteamcr.com", "bsalas@smarteamcr.com"]);
  const deCs = { deCs: true, tecnicos };
  const deDesarrollo = { deCs: false, tecnicos };

  it("el equipo técnico es el rol DEV, no una lista de nombres", () => {
    expect(esDelEquipoTecnico("DEV")).toBe(true);
    for (const rol of ["CSE", "CSL", "MARKETING", "VENTAS", "ADMIN", "SUPER_ADMIN", null, undefined]) expect(esDelEquipoTecnico(rol)).toBe(false);
  });

  it("BLUESAT: en un proyecto de CS, el propietario técnico no cuenta y queda «CSE Encargado», aunque el correo traiga mayúsculas", () => {
    expect(ownerQueSeGuarda([tecnico, heiver, laCsl], deCs)).toEqual(heiver);
  });

  it("en Desarrollo manda el propietario, sea quien sea", () => {
    expect(ownerQueSeGuarda([tecnico, heiver], deDesarrollo)).toEqual(tecnico);
  });

  it("un propietario de CS que no es técnico sigue mandando en un proyecto de CS", () => {
    expect(ownerQueSeGuarda([heiver, tecnico], deCs)).toEqual(heiver);
  });

  it("con «CSE Encargado» archivado la CSL no entra: la cuenta queda sin encargado, y no a su nombre", () => {
    const correos: Record<string, string | null> = { "900": null, "111": null, "222": laCsl.email };
    const candidatos = candidatosDelProyecto({ hubspot_owner_id: "900", cse_encargado: "111", csl_encargado: "222" });
    expect(ownerQueSeGuarda(candidatos.map((id) => ({ id, name: null, email: correos[id] })), deCs)).toEqual({ id: "900", name: null, email: null });
  });

  it("con «CSE Encargado» vacío, «CSL Encargado» sí respalda al técnico", () => {
    expect(ownerQueSeGuarda([tecnico, laCsl], deCs)).toEqual(laCsl);
  });

  it("si «CSE Encargado» también es técnico, queda el primero: es un dato por corregir, y sale en la lista", () => {
    expect(ownerQueSeGuarda([tecnico, otroTecnico], deCs)).toEqual(tecnico);
  });

  it("sin nadie más escrito, queda el técnico: Nexus no inventa a alguien ni deja el proyecto sin correo", () => {
    expect(ownerQueSeGuarda([tecnico], deCs)).toEqual(tecnico);
    expect(ownerQueSeGuarda([tecnico, { ...heiver, name: null, email: null }], deCs)).toEqual(tecnico);
  });

  it("si HubSpot no contestó por el que seguía, no se toca nada", () => {
    expect(ownerQueSeGuarda([tecnico, { ...heiver, email: null, sinRespuesta: true }], deCs)).toBeNull();
  });

  it("en la historia: el que no cuenta cede, y sin nadie más se queda", () => {
    const propietario = [{ value: "900", timestamp: "2026-10-01T00:00:00Z" }];
    const cse = [{ value: "111", timestamp: "2026-10-01T00:00:00Z" }];
    const csl = [{ value: "222", timestamp: "2026-10-01T00:00:00Z" }];
    const fecha = new Date("2026-10-15T00:00:00Z");
    expect(encargadoEnLaFecha({ propietario, cse }, fecha, (id) => id === "900")).toBe("111");
    expect(encargadoEnLaFecha({ propietario, csl }, fecha, (id) => id === "900")).toBe("222");
    expect(encargadoEnLaFecha({ propietario }, fecha, (id) => id === "900")).toBe("900");
    expect(encargadoEnLaFecha({ propietario, cse }, fecha)).toBe("900");
  });

  it("«Traer de HubSpot» propone con la misma regla que el espejo", () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "lib/hubspot/empresas-con-proyecto.ts"), "utf8");
    expect(fuente).toContain("ownerQueSeGuarda(candidatos, { deCs: esPipelineIdDeCs(p.pipelineId), tecnicos })");
  });
});

describe("«CSE Encargado» está de salida (2026-10-30)", () => {
  const rechazo = () =>
    new Response(JSON.stringify({ status: "error", category: "VALIDATION_ERROR", message: 'Property values were not valid: [{"error":"PROPERTY_DOESNT_EXIST","name":"cse_encargado","message":"Property \\"cse_encargado\\" does not exist"}]' }), { status: 400 });

  it("con el interruptor apagado, ni se lee ni se escribe; el propietario y la CSL siguen", () => {
    expect(candidatosDelProyecto({ hubspot_owner_id: "900", cse_encargado: "111", csl_encargado: "222" }, false)).toEqual(["900", "222"]);
    expect(candidatosDelProyecto({ hubspot_owner_id: "900", csl_encargado: "222" })).toEqual(["900", "222"]);
    expect(propiedadesDeEncargados({ cse: "1", csl: "2" }, false)).toEqual({ csl_encargado: "2" });
    expect(propiedadesDelPaseEnElProyecto({ cse: "1", csl: "2" }, false)).toEqual({ hubspot_owner_id: "1", csl_encargado: "2" });
  });

  it("sin la propiedad en HubSpot, la lectura sigue: llega vacía y manda el que sigue", () => {
    expect(encargadoDelProyecto({ hubspot_owner_id: "900", csl_encargado: "222" })).toBe("900");
    expect(encargadoDelProyecto({ csl_encargado: "222" })).toBe("222");
  });

  it("el pase no se cae: si HubSpot rechaza la propiedad porque ya no existe, repite sin ella", async () => {
    const enviados: Record<string, string>[] = [];
    const res = await escribirSinLaRetirada({ hubspot_owner_id: "1", cse_encargado: "1", csl_encargado: "2" }, async (p) => {
      enviados.push(p);
      return enviados.length === 1 ? rechazo() : new Response("{}", { status: 200 });
    });
    expect(res.ok).toBe(true);
    expect(enviados[1]).toEqual({ hubspot_owner_id: "1", csl_encargado: "2" });
  });

  it("si solo quedaba esa propiedad, o no hay nada, no llama de más y responde bien", async () => {
    let llamadas = 0;
    const r1 = await escribirSinLaRetirada({ cse_encargado: "1" }, async () => {
      llamadas++;
      return rechazo();
    });
    expect([r1.ok, llamadas]).toEqual([true, 1]);
    const r2 = await escribirSinLaRetirada({}, async () => {
      llamadas++;
      return rechazo();
    });
    expect([r2.ok, llamadas]).toEqual([true, 1]);
  });

  it("⛔ cualquier otro rechazo sigue siendo un error, y no se reintenta", async () => {
    for (const [status, cuerpo] of [
      [400, '{"message":"owner no válido para hubspot_owner_id"}'],
      [400, '{"error":"PROPERTY_DOESNT_EXIST","name":"otra_propiedad"}'],
      [429, '{"category":"RATE_LIMITS","message":"cse_encargado does not exist"}'],
    ] as const) {
      let llamadas = 0;
      const res = await escribirSinLaRetirada({ hubspot_owner_id: "1", cse_encargado: "1" }, async () => {
        llamadas++;
        return new Response(cuerpo, { status });
      });
      expect([res.status, llamadas]).toEqual([status, 1]);
      expect(await res.text()).toBe(cuerpo);
    }
  });
});

describe("la lista para migrar el propietario (2026-10-30)", () => {
  const correos: Record<string, string> = { "900": "asalas@smarteamcr.com", "111": "heiver@smarteamcr.com" };
  const correoDe = (id: string) => correos[id] ?? null;
  const tecnicos = new Set(["asalas@smarteamcr.com"]);

  it("un propietario vivo que no es técnico está bien", () => {
    expect(propietarioPorMigrar({ hubspot_owner_id: "111", cse_encargado: "900" }, correoDe, tecnicos)).toBeNull();
  });

  it("falta, archivado o técnico: debería quedar «CSE Encargado»", () => {
    expect(propietarioPorMigrar({ cse_encargado: "111" }, correoDe, tecnicos)).toEqual({ porQue: "falta", deberiaQuedar: "111" });
    expect(propietarioPorMigrar({ hubspot_owner_id: "555", cse_encargado: "111" }, correoDe, tecnicos)).toEqual({ porQue: "archivado", deberiaQuedar: "111" });
    expect(propietarioPorMigrar({ hubspot_owner_id: "900", cse_encargado: "111" }, correoDe, tecnicos)).toEqual({ porQue: "tecnico", deberiaQuedar: "111" });
  });

  it("si «CSE Encargado» falta, está archivado o es técnico, no se propone a nadie: lo decide una persona", () => {
    expect(propietarioPorMigrar({ hubspot_owner_id: "900" }, correoDe, tecnicos)).toEqual({ porQue: "tecnico", deberiaQuedar: null });
    expect(propietarioPorMigrar({ hubspot_owner_id: "900", cse_encargado: "555" }, correoDe, tecnicos)).toEqual({ porQue: "tecnico", deberiaQuedar: null });
    expect(propietarioPorMigrar({ hubspot_owner_id: "900", cse_encargado: "900" }, correoDe, tecnicos)).toEqual({ porQue: "tecnico", deberiaQuedar: null });
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
