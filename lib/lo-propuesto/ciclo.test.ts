import { describe, expect, it } from "vitest";
import { SISTEMA } from "@/lib/tareas/estados";
import {
  FIRMA_DEL_SISTEMA,
  diaCR,
  estadoDeAlerta,
  estadoDeCampoPendiente,
  estadoDeDecisionDeCampo,
  estadoDeDestinoDeHecho,
  estadoDeEtapa,
  estadoDeMinuta,
  estadoDePedido,
  estadoDeSugerenciaDelHandoff,
  estadoDeTarea,
  pideHasta,
  sumarDias,
  venceEl,
  vencioSinRevisar,
} from "./ciclo";
import { contarTipo, sumarConteos, type ItemParaContar } from "./conteo";
import { GUARDA, MODULO_DEL_TIPO, NOMBRE_DEL_TIPO, TIPOS_DE_LO_PROPUESTO } from "./tipos";

describe("el plazo de 30 días, por día de Costa Rica", () => {
  it("una reunión del 9 oct pide revisión hasta el 7 nov y vence el 8", () => {
    const reunion = "2026-10-09T15:00:00.000Z"; // 9:00 en Costa Rica
    expect(pideHasta(reunion)).toBe("2026-11-07");
    expect(venceEl(reunion)).toBe("2026-11-08");
    expect(vencioSinRevisar(reunion, "2026-11-07")).toBe(false);
    expect(vencioSinRevisar(reunion, "2026-11-08")).toBe(true);
  });

  it("de noche en Costa Rica sigue siendo el mismo día (no el de UTC)", () => {
    // 2026-10-09 05:00 UTC = 8 oct, 23:00 en Costa Rica.
    expect(diaCR("2026-10-09T05:00:00.000Z")).toBe("2026-10-08");
    expect(diaCR(new Date("2026-10-09T05:00:00.000Z"))).toBe("2026-10-08");
    // Un AAAA-MM-DD es un día: se devuelve tal cual (nunca new Date("AAAA-MM-DD")).
    expect(diaCR("2026-10-09")).toBe("2026-10-09");
  });

  it("la aritmética de días cruza meses y años", () => {
    expect(sumarDias("2026-12-20", 15)).toBe("2027-01-04");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("la firma del sistema es la misma que usa Tareas", () => {
    expect(FIRMA_DEL_SISTEMA).toBe(SISTEMA);
  });
});

describe("la regla de cada tipo", () => {
  const HOY = "2026-10-10";

  it("minuta: revisada = usada (con quién), borrador = pendiente o vencida", () => {
    expect(estadoDeMinuta({ status: "REVIEWED", reviewedByEmail: "Ana@Smarteamcr.com", reviewedAt: "2026-10-09T12:00:00Z", createdAt: "2026-10-08T12:00:00Z" }, HOY)).toEqual({
      estado: "usado",
      sinFirma: false,
      decididoPor: "ana@smarteamcr.com",
      decididoEn: "2026-10-09T12:00:00Z",
    });
    expect(estadoDeMinuta({ status: "EDITED", reviewedByEmail: "ana@x", reviewedAt: null, createdAt: "2026-10-08T12:00:00Z" }, HOY).estado).toBe("usado");
    expect(estadoDeMinuta({ status: "REVIEWED", reviewedByEmail: null, reviewedAt: null, createdAt: "2026-10-08T12:00:00Z" }, HOY).sinFirma).toBe(true);
    expect(estadoDeMinuta({ status: "DRAFT", reviewedByEmail: null, reviewedAt: null, createdAt: "2026-10-08T12:00:00Z" }, HOY).estado).toBe("pendiente");
    expect(estadoDeMinuta({ status: "DRAFT", reviewedByEmail: null, reviewedAt: null, createdAt: "2026-08-01T12:00:00Z" }, HOY).estado).toBe("vencido");
  });

  it("pedido: lo decidido sin firma se marca, y lo que sumó una persona no es una propuesta", () => {
    const base = { decididoPor: null, decididoAt: null, creadoPor: null, createdAt: "2026-10-08T12:00:00Z" };
    expect(estadoDePedido({ ...base, estado: "PEDIDO" }, HOY)?.estado).toBe("pendiente");
    expect(estadoDePedido({ ...base, estado: "PEDIDO", createdAt: "2026-08-01T12:00:00Z" }, HOY)?.estado).toBe("vencido");
    const confirmado = estadoDePedido({ ...base, estado: "CONFIRMADO", decididoPor: "cse@x", decididoAt: "2026-10-09T12:00:00Z" }, HOY);
    expect(confirmado).toMatchObject({ estado: "usado", sinFirma: false, decididoPor: "cse@x" });
    // Un estado distinto de PEDIDO sin decididoPor: lo escribió el modelo.
    expect(estadoDePedido({ ...base, estado: "CONFIRMADO" }, HOY)).toMatchObject({ estado: "usado", sinFirma: true, decididoPor: null });
    expect(estadoDePedido({ ...base, estado: "INCLUIDO", decididoPor: "cse@x" }, HOY)?.estado).toBe("usado");
    expect(estadoDePedido({ ...base, estado: "DESCARTADO", decididoPor: "cse@x" }, HOY)?.estado).toBe("desestimado");
    expect(estadoDePedido({ ...base, estado: "CONFIRMADO", creadoPor: "cse@x" }, HOY)).toBeNull();
  });

  it("tarea: respeta lo guardado (vence a los 14 días en Tareas), no el plazo de 30", () => {
    // Una propuesta de hace mucho sigue pendiente hasta que el job de Tareas la marque vencida.
    expect(estadoDeTarea({ estado: "propuesta", decision: null, decididaPorEmail: null, decididaAt: null })?.estado).toBe("pendiente");
    expect(estadoDeTarea({ estado: "vencida", decision: "vencida", decididaPorEmail: SISTEMA, decididaAt: "2026-10-06T12:00:00Z" })).toMatchObject({ estado: "vencido", sinFirma: false });
    expect(estadoDeTarea({ estado: "pendiente", decision: "tal_cual", decididaPorEmail: "lidia@x", decididaAt: "2026-10-06T12:00:00Z" })).toMatchObject({ estado: "usado", decididoPor: "lidia@x" });
    expect(estadoDeTarea({ estado: "pendiente", decision: "mas_adelante", decididaPorEmail: "lidia@x", decididaAt: null })?.estado).toBe("usado");
    expect(estadoDeTarea({ estado: "rechazada", decision: "rechazada", decididaPorEmail: "lidia@x", decididaAt: null })?.estado).toBe("desestimado");
    expect(estadoDeTarea({ estado: "fusionada", decision: "misma", decididaPorEmail: SISTEMA, decididaAt: null })).toMatchObject({ estado: "desestimado", sinFirma: true });
    // Una tarea que nunca fue propuesta no cuenta.
    expect(estadoDeTarea({ estado: "pendiente", decision: null, decididaPorEmail: null, decididaAt: null })).toBeNull();
  });

  it("alerta: no vence por fecha, y el cierre del sistema cuenta como vencido, nunca como usado", () => {
    expect(estadoDeAlerta({ status: "OPEN", resolvedByEmail: null, resolvedAt: null }).estado).toBe("pendiente");
    expect(estadoDeAlerta({ status: "SEEN", resolvedByEmail: null, resolvedAt: null }).estado).toBe("pendiente");
    expect(estadoDeAlerta({ status: "RESOLVED", resolvedByEmail: "sistema", resolvedAt: "2026-10-01T00:00:00Z" })).toMatchObject({ estado: "vencido", sinFirma: false });
    expect(estadoDeAlerta({ status: "DISMISSED", resolvedByEmail: "sistema", resolvedAt: null }).estado).toBe("vencido");
    expect(estadoDeAlerta({ status: "RESOLVED", resolvedByEmail: "csl@x", resolvedAt: null })).toMatchObject({ estado: "usado", decididoPor: "csl@x" });
    expect(estadoDeAlerta({ status: "DISMISSED", resolvedByEmail: "csl@x", resolvedAt: null }).estado).toBe("desestimado");
  });

  it("campo de la ficha, etapa: pendientes hasta los 30 días", () => {
    expect(estadoDeCampoPendiente("2026-10-01T12:00:00Z", HOY).estado).toBe("pendiente");
    expect(estadoDeCampoPendiente("2026-09-01T12:00:00Z", HOY).estado).toBe("vencido");
    expect(estadoDeDecisionDeCampo({ estado: "usado_con_cambios", por: "cse@x", en: "2026-10-09T12:00:00Z" }).estado).toBe("usado");
    expect(estadoDeDecisionDeCampo({ estado: "desestimado", por: "cse@x", en: "2026-10-09T12:00:00Z" }).estado).toBe("desestimado");
    expect(estadoDeEtapa("2026-09-01T12:00:00Z", HOY).estado).toBe("vencido");
  });

  it("destino de un hecho (novedad o Procesos): la regla de la franja, y lo que cerró el sistema vence", () => {
    /* La edición que la pone en rojo: contar un destino delegado (lo cuenta su módulo: dos veces la misma ficha) o
       contar como desestimado lo que el sistema retiró al cambiar el dueño de la reunión. */
    const ahora = new Date("2026-10-10T18:00:00Z");
    expect(estadoDeDestinoDeHecho({ estado: "pendiente" }, "2026-10-01T12:00:00Z", ahora)?.estado).toBe("pendiente");
    expect(estadoDeDestinoDeHecho({ estado: "pendiente" }, "2026-09-01T12:00:00Z", ahora)?.estado).toBe("vencido");
    expect(estadoDeDestinoDeHecho({ estado: "usado", decididoPorEmail: "CSE@x", decididoAt: "2026-10-09T12:00:00Z" }, "2026-10-01T12:00:00Z", ahora)).toMatchObject({
      estado: "usado",
      decididoPor: "cse@x",
      sinFirma: false,
    });
    expect(estadoDeDestinoDeHecho({ estado: "desestimado", decididoPorEmail: "cse@x" }, "2026-10-01T12:00:00Z", ahora)?.estado).toBe("desestimado");
    expect(estadoDeDestinoDeHecho({ estado: "desestimado", decididoPorEmail: FIRMA_DEL_SISTEMA }, "2026-10-01T12:00:00Z", ahora)?.estado).toBe("vencido");
    expect(estadoDeDestinoDeHecho({ estado: "delegado" }, "2026-10-01T12:00:00Z", ahora)).toBeNull();
  });

  it("sugerencia del handoff: borrador pendiente, confirmada usada, borrada desestimada; nunca con firma", () => {
    expect(estadoDeSugerenciaDelHandoff({ status: "DRAFT" }, "2026-10-01T12:00:00Z", HOY).estado).toBe("pendiente");
    expect(estadoDeSugerenciaDelHandoff({ status: "DRAFT" }, "2026-09-01T12:00:00Z", HOY).estado).toBe("vencido");
    expect(estadoDeSugerenciaDelHandoff({ status: "CONFIRMED" }, "2026-10-01T12:00:00Z", HOY)).toMatchObject({ estado: "usado", sinFirma: true, decididoPor: null });
    expect(estadoDeSugerenciaDelHandoff(null, "2026-10-01T12:00:00Z", HOY)).toMatchObject({ estado: "desestimado", sinFirma: true });
  });
});

describe("el catálogo de tipos", () => {
  it("cada tipo tiene nombre, módulo y lo que guarda; la minuta no se desestima y la etapa no guarda quién", () => {
    for (const t of TIPOS_DE_LO_PROPUESTO) {
      expect(NOMBRE_DEL_TIPO[t]).toBeTruthy();
      expect(MODULO_DEL_TIPO[t]).toBeTruthy();
      expect(GUARDA[t]).toBeTruthy();
    }
    expect(GUARDA.minuta.descarte).toBe(false);
    expect(GUARDA["etapa-sugerida"].quien).toBe(false);
    // La sugerencia del handoff no guarda quién (el bloque no lo dice) ni deja un «no» (descartar lo borra).
    expect(GUARDA["sugerencia-del-handoff"]).toEqual({ quien: false, descarte: false });
  });

  it("lo propuesto de las etapas 3b y 6 se mide: novedades, Procesos y las sugerencias del handoff", () => {
    for (const t of ["novedad", "hecho", "sugerencia-del-handoff"] as const) expect(TIPOS_DE_LO_PROPUESTO).toContain(t);
  });
});

describe("cómo se cuenta una ventana", () => {
  const v = { desde: new Date("2026-10-01T06:00:00Z"), hasta: new Date("2026-10-11T06:00:00Z") };
  const item = (o: Partial<ItemParaContar>): ItemParaContar => ({
    estado: "pendiente",
    sinFirma: false,
    decididoPor: null,
    decididoEn: null,
    nacioEn: "2026-10-05T12:00:00Z",
    ...o,
  });

  it("cuenta lo que nació en la ventana, con cómo está hoy, y aparte lo decidido de antes", () => {
    const c = contarTipo(
      "pedido-fuera-de-alcance",
      [
        item({}),
        item({ estado: "usado", decididoPor: "ana@x", decididoEn: "2026-10-06T12:00:00Z" }),
        item({ estado: "desestimado", decididoPor: "ana@x", decididoEn: "2026-10-06T12:00:00Z" }),
        item({ estado: "usado", sinFirma: true }),
        item({ estado: "vencido" }),
        // Nació antes y se decidió en la ventana: va a «deAntes», no a los demás números.
        item({ estado: "usado", decididoPor: "beto@x", decididoEn: "2026-10-07T12:00:00Z", nacioEn: "2026-09-10T12:00:00Z" }),
        // Nació después: no cuenta.
        item({ nacioEn: "2026-10-12T12:00:00Z" }),
      ],
      v,
    );
    expect(c).toMatchObject({ nacieron: 5, pendientes: 1, usados: 2, desestimados: 1, vencidos: 1, sinFirma: 1, deAntes: 1, modulo: "reuniones" });
    expect(c.porPersona).toEqual({ "ana@x": { usados: 1, desestimados: 1 } });
  });

  it("sumar conteos junta personas y deja la guarda del más débil", () => {
    const a = contarTipo("minuta", [item({ estado: "usado", decididoPor: "ana@x" })], v);
    const b = contarTipo("etapa-sugerida", [item({})], v);
    const s = sumarConteos([a, b]);
    expect(s.nacieron).toBe(2);
    expect(s.porPersona["ana@x"]).toEqual({ usados: 1, desestimados: 0 });
    expect(s.guarda).toEqual({ quien: false, descarte: false });
  });
});
