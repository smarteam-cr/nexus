import { describe, expect, it } from "vitest";
import { proyectoQueAbreLaFicha } from "./proyecto-inicial";

const crm = { id: "crm", esPrueba: false, hubspotOwnerEmail: "lmoreno@smarteamcr.com" };
const dev = { id: "dev", esPrueba: false, hubspotOwnerEmail: "bsalas@smarteamcr.com" };

describe("proyectoQueAbreLaFicha", () => {
  it("con un solo proyecto real abre en él, mire quien mire", () => {
    expect(proyectoQueAbreLaFicha([crm], "otra@smarteamcr.com")).toBe("crm");
    expect(proyectoQueAbreLaFicha([crm, { ...dev, esPrueba: true }], null)).toBe("crm");
  });

  it("Cemaco: con dos proyectos, a Liliana le abre el suyo y a Breiner el suyo", () => {
    expect(proyectoQueAbreLaFicha([crm, dev], "lmoreno@smarteamcr.com")).toBe("crm");
    expect(proyectoQueAbreLaFicha([crm, dev], " BSalas@SmarTeamCR.com ")).toBe("dev");
  });

  it("quien no lleva ninguno, o lleva varios, abre en la cuenta", () => {
    expect(proyectoQueAbreLaFicha([crm, dev], "egonzalez@smarteamcr.com")).toBeNull();
    expect(proyectoQueAbreLaFicha([crm, { ...dev, hubspotOwnerEmail: "lmoreno@smarteamcr.com" }], "lmoreno@smarteamcr.com")).toBeNull();
    expect(proyectoQueAbreLaFicha([crm, dev], null)).toBeNull();
  });

  it("un proyecto de prueba no abre solo aunque sea de quien mira", () => {
    expect(proyectoQueAbreLaFicha([crm, { ...dev, esPrueba: true, hubspotOwnerEmail: "egonzalez@smarteamcr.com" }, { ...dev, id: "dev2" }], "egonzalez@smarteamcr.com")).toBeNull();
  });

  it("sin proyectos abre en la cuenta", () => {
    expect(proyectoQueAbreLaFicha([], "lmoreno@smarteamcr.com")).toBeNull();
  });
});
