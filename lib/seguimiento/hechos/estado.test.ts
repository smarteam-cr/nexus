import { describe, expect, it } from "vitest";
import {
  decidirDestino,
  delegarDestino,
  desestimarPorCambioDeDueno,
  esperaAUnaPersona,
  estadoGeneral,
  estadoVisible,
  estaVencido,
  leerDestinos,
  soloDelegado,
  type DestinoDelHecho,
} from "./estado";

const AHORA = new Date("2026-10-10T15:00:00Z");
const pend = (clave: string): DestinoDelHecho => ({ clave, estado: "pendiente" });
const sinDecidir = { estado: "pendiente", decididoPorEmail: null, decididoAt: null, nota: null };

describe("leerDestinos", () => {
  it("lee lo que entiende y descarta lo demás, sin reventar", () => {
    expect(leerDestinos(null)).toEqual([]);
    expect(leerDestinos("x")).toEqual([]);
    const d = leerDestinos([
      { clave: "planning.pipelines", estado: "pendiente" },
      { clave: "ficha", estado: "delegado", ref: { tipo: "ficha", campos: ["herramientasActuales", 3] } },
      { clave: "ficha", estado: "usado" }, // repetida
      { clave: "x", estado: "raro" },
      { estado: "pendiente" },
      { clave: "alerta.queja", estado: "delegado", ref: { tipo: "alerta" } }, // ref sin id
    ]);
    expect(d.map((x) => x.clave)).toEqual(["planning.pipelines", "ficha", "alerta.queja"]);
    expect(d[1].ref).toEqual({ tipo: "ficha", campos: ["herramientasActuales"] });
    expect(d[2].ref).toBeNull();
  });
});

describe("el estado general", () => {
  it("pendiente mientras algún destino espera; usado si alguno se usó; desestimado si todos", () => {
    expect(estadoGeneral([])).toBe("pendiente");
    expect(estadoGeneral([pend("a"), { clave: "b", estado: "usado" }])).toBe("pendiente");
    expect(estadoGeneral([{ clave: "a", estado: "usado" }, { clave: "b", estado: "desestimado" }])).toBe("usado");
    expect(estadoGeneral([{ clave: "a", estado: "desestimado" }, { clave: "b", estado: "desestimado" }])).toBe("desestimado");
  });

  it("todo delegado queda pendiente en general, pero no espera a nadie (no es novedad ni memoria pendiente)", () => {
    const d: DestinoDelHecho[] = [{ clave: "ficha", estado: "delegado", ref: { tipo: "ficha", campos: [] } }];
    expect(estadoGeneral(d)).toBe("pendiente");
    expect(soloDelegado(d)).toBe(true);
    expect(esperaAUnaPersona(d)).toBe(false);
    expect(esperaAUnaPersona([])).toBe(true);
    expect(esperaAUnaPersona([pend("x")])).toBe(true);
  });

  it("vence a los 30 días, solo si está pendiente", () => {
    const hace = (dias: number) => new Date(+AHORA - dias * 86_400_000);
    expect(estaVencido({ estado: "pendiente", createdAt: hace(29) }, AHORA)).toBe(false);
    expect(estaVencido({ estado: "pendiente", createdAt: hace(31) }, AHORA)).toBe(true);
    expect(estaVencido({ estado: "usado", createdAt: hace(90) }, AHORA)).toBe(false);
    expect(estadoVisible({ estado: "pendiente", createdAt: hace(31).toISOString() }, AHORA)).toBe("vencido");
    expect(estadoVisible({ estado: "desestimado", createdAt: hace(1) }, AHORA)).toBe("desestimado");
  });
});

describe("decidir un destino", () => {
  it("«No aplica» desestima ese destino; con todos decididos, el general queda decidido con quién y cuándo", () => {
    const h = { ...sinDecidir, destinos: [pend("kickoff.alcance"), pend("diagnosis.alcance_acordado")] };
    const uno = decidirDestino(h, "kickoff.alcance", "desestimar", "ana@smarteamcr.com", AHORA, "No va")!;
    expect(uno.estado).toBe("pendiente");
    expect(uno.decididoAt).toBeNull();
    expect(uno.destinos[0]).toMatchObject({ estado: "desestimado", decididoPorEmail: "ana@smarteamcr.com", nota: "No va" });
    const dos = decidirDestino({ ...h, destinos: uno.destinos }, "diagnosis.alcance_acordado", "usar", "ana@smarteamcr.com", AHORA)!;
    expect(dos.estado).toBe("usado");
    expect(dos.decididoAt).toEqual(AHORA);
    expect(dos.decididoPorEmail).toBe("ana@smarteamcr.com");
  });

  it("un destino ya decidido o delegado no se vuelve a decidir", () => {
    const h = { ...sinDecidir, destinos: [{ clave: "ficha", estado: "delegado" }, { clave: "kickoff.equipo", estado: "usado" }] };
    expect(decidirDestino(h, "ficha", "usar", "a@b.c", AHORA)).toBeNull();
    expect(decidirDestino(h, "kickoff.equipo", "desestimar", "a@b.c", AHORA)).toBeNull();
    expect(decidirDestino(h, "no-existe", "usar", "a@b.c", AHORA)).toBeNull();
  });

  it("delegar solo cambia un destino pendiente", () => {
    const d = delegarDestino([pend("ficha"), { clave: "alerta.queja", estado: "usado" }], "ficha", { tipo: "ficha", campos: ["dolorPrincipal"] });
    expect(d[0]).toEqual({ clave: "ficha", estado: "delegado", ref: { tipo: "ficha", campos: ["dolorPrincipal"] } });
    expect(delegarDestino(d, "alerta.queja", { tipo: "alerta", id: "x" })[1].estado).toBe("usado");
  });
});

describe("la reunión cambió de dueño", () => {
  it("lo pendiente y lo delegado que ya se retiró de su módulo quedan desestimados con la nota, firmados por el sistema", () => {
    const h = { ...sinDecidir, destinos: [pend("kickoff.alcance"), { clave: "ficha", estado: "delegado" }] };
    const c = desestimarPorCambioDeDueno(h, "sistema", AHORA, "La reunión cambió de dueño", new Set(["ficha"]))!;
    expect(c.estado).toBe("desestimado");
    expect(c.decididoPorEmail).toBe("sistema");
    expect(c.nota).toBe("La reunión cambió de dueño");
    expect(c.destinos.map((d) => d.estado)).toEqual(["desestimado", "desestimado"]);
  });

  it("⛔ lo delegado que NO se pudo retirar sigue delegado y el hecho sigue vivo (INV45 lo muestra)", () => {
    const h = { ...sinDecidir, destinos: [pend("kickoff.alcance"), { clave: "alerta.queja", estado: "delegado" }] };
    const c = desestimarPorCambioDeDueno(h, "sistema", AHORA, "La reunión cambió de dueño")!;
    expect(c.estado).toBe("pendiente");
    expect(c.decididoPorEmail).toBeNull();
    expect(c.destinos.map((d) => d.estado)).toEqual(["desestimado", "delegado"]);
    // Solo delegado y sin retirar: nada que cambiar.
    expect(desestimarPorCambioDeDueno({ ...sinDecidir, destinos: [{ clave: "alerta.queja", estado: "delegado" }] }, "sistema", AHORA, "x")).toBeNull();
    // Sin destinos (solo en la tarjeta): se cierra.
    expect(desestimarPorCambioDeDueno({ ...sinDecidir, destinos: [] }, "sistema", AHORA, "x")!.estado).toBe("desestimado");
  });

  it("si algo ya se usó, queda usado; un hecho ya cerrado no cambia", () => {
    const h = { ...sinDecidir, destinos: [pend("kickoff.alcance"), { clave: "diagnosis.alcance_acordado", estado: "usado" }] };
    expect(desestimarPorCambioDeDueno(h, "sistema", AHORA, "x")!.estado).toBe("usado");
    expect(desestimarPorCambioDeDueno({ ...h, estado: "usado", decididoAt: AHORA }, "sistema", AHORA, "x")).toBeNull();
  });
});
