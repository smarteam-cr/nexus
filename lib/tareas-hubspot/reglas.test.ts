import { describe, expect, it } from "vitest";
import {
  comparar,
  cuerpoParaHubspot,
  datosDeHubspot,
  faltaParaHubspot,
  pedidoParaCrear,
  seCreaEnHubspot,
  type TareaParaCrearEnHubspot,
  diaYMinutoCR,
  estadoDeHubspot,
  leerAcordado,
  propiedadesParaHubspot,
  rotuloDeHubspot,
  textoDelCuerpo,
  valoresDeHubspot,
  venceParaHubspot,
  type ValoresSincronizados,
} from "./reglas";

const ACORDADO: ValoresSincronizados = { titulo: "Ecoquintas - Seguimiento a Luis", estado: "pendiente", vence: "2026-10-14", prioridad: "media", responsable: "apinzon@smarteamcr.com" };
const ANTES = new Date("2026-10-14T10:00:00Z");
const DESPUES = new Date("2026-10-14T12:00:00Z");

describe("de HubSpot a Nexus", () => {
  it("lee una tarea como la escribe HubSpot", () => {
    const v = valoresDeHubspot(
      { hs_task_subject: " Ecoquintas - Seguimiento a Luis ", hs_task_status: "NOT_STARTED", hs_timestamp: "2026-10-14T13:00:00Z", hs_task_priority: "NONE", hubspot_owner_id: "84937900" },
      (o) => (o === "84937900" ? "apinzon@smarteamcr.com" : null),
    );
    expect(v).toEqual(ACORDADO);
  });
  it("los estados de HubSpot que Nexus no tiene son «pendiente»", () => {
    expect(estadoDeHubspot("WAITING")).toBe("pendiente");
    expect(estadoDeHubspot("DEFERRED")).toBe("pendiente");
    expect(estadoDeHubspot("IN_PROGRESS")).toBe("en_curso");
    expect(estadoDeHubspot("COMPLETED")).toBe("hecha");
  });
  it("el vencimiento es el día de Costa Rica, y se conserva su hora al cambiarlo", () => {
    // 03:00 UTC del 15 = 21:00 del 14 en Costa Rica.
    expect(diaYMinutoCR("2026-10-15T03:00:00Z")).toEqual({ dia: "2026-10-14", minuto: 21 * 60 });
    expect(venceParaHubspot("2026-10-20", 21 * 60)).toBe("2026-10-21T03:00:00.000Z");
    expect(venceParaHubspot("2026-10-20", null)).toBe("2026-10-20T13:00:00.000Z");
  });
  it("las notas en HTML pasan a texto", () => {
    expect(textoDelCuerpo("<p>Llamar a <b>Luis</b></p><ul><li>precio</li><li>fecha</li></ul>")).toBe("Llamar a Luis\n• precio\n• fecha");
    expect(textoDelCuerpo("<p></p>")).toBeNull();
  });
  it("dice si viene de una secuencia", () => {
    expect(rotuloDeHubspot(datosDeHubspot({}, null))).toBe("HubSpot");
    expect(rotuloDeHubspot(datosDeHubspot({ hs_task_sequence_id: "55", hs_task_sequence_step_number: "2" }, null))).toBe("HubSpot · secuencia (paso 2)");
  });
});

describe("la comparación de los tres", () => {
  it("cambió solo HubSpot: se aplica en Nexus", () => {
    const r = comparar(ACORDADO, ACORDADO, { ...ACORDADO, vence: "2026-10-16" }, ANTES, DESPUES);
    expect(r.aNexus).toEqual({ vence: "2026-10-16" });
    expect(r.aHubspot).toEqual({});
    expect(r.acordado.vence).toBe("2026-10-16");
  });
  it("cambió solo Nexus: se escribe en HubSpot", () => {
    const r = comparar(ACORDADO, { ...ACORDADO, estado: "hecha" }, ACORDADO, DESPUES, ANTES);
    expect(r.aHubspot).toEqual({ estado: "hecha" });
    expect(r.aNexus).toEqual({});
    expect(r.acordado.estado).toBe("hecha");
  });
  it("cambiaron los dos: gana el último y queda como conflicto", () => {
    const nexus = { ...ACORDADO, titulo: "Llamar a Luis" };
    const hubspot = { ...ACORDADO, titulo: "Escribirle a Luis" };
    const ganaNexus = comparar(ACORDADO, nexus, hubspot, DESPUES, ANTES);
    expect(ganaNexus.aHubspot).toEqual({ titulo: "Llamar a Luis" });
    expect(ganaNexus.conflictos).toEqual([{ campo: "titulo", gano: "nexus" }]);
    const ganaHubspot = comparar(ACORDADO, nexus, hubspot, ANTES, DESPUES);
    expect(ganaHubspot.aNexus).toEqual({ titulo: "Escribirle a Luis" });
    expect(ganaHubspot.conflictos).toEqual([{ campo: "titulo", gano: "hubspot" }]);
  });
  it("los dos llegaron a lo mismo: nada que hacer", () => {
    const igual = { ...ACORDADO, estado: "hecha" as const };
    const r = comparar(ACORDADO, igual, igual, ANTES, DESPUES);
    expect(r.aNexus).toEqual({});
    expect(r.aHubspot).toEqual({});
    expect(r.conflictos).toEqual([]);
  });
  it("«Ya no se hará» no se escribe en HubSpot, pero lo que cambie allá entra", () => {
    const nexus = { ...ACORDADO, estado: null };
    expect(comparar(ACORDADO, nexus, ACORDADO, DESPUES, ANTES).aHubspot).toEqual({});
    expect(comparar(ACORDADO, nexus, { ...ACORDADO, estado: "hecha" }, ANTES, DESPUES).aNexus).toEqual({ estado: "hecha" });
  });
  it("lo acordado se lee con tolerancia", () => {
    expect(leerAcordado(ACORDADO)).toEqual(ACORDADO);
    expect(leerAcordado(null)).toBeNull();
    expect(leerAcordado({ titulo: 1 })).toBeNull();
  });
});

describe("lo que se escribe en HubSpot", () => {
  it("cada campo con su propiedad; el responsable sin usuario de HubSpot no se escribe", () => {
    const datos = datosDeHubspot({ hs_timestamp: "2026-10-14T13:00:00Z" }, null);
    const r = propiedadesParaHubspot({ estado: "hecha", vence: "2026-10-20", prioridad: "alta", responsable: "nadie@smarteamcr.com" }, datos, () => null);
    expect(r.properties).toEqual({ hs_task_status: "COMPLETED", hs_timestamp: "2026-10-20T13:00:00.000Z", hs_task_priority: "HIGH" });
    expect(r.sinOwner).toBe(true);
  });
});

describe("el seguimiento comercial se crea en HubSpot (D4)", () => {
  const base: TareaParaCrearEnHubspot = {
    origen: "mano",
    estado: "pendiente",
    privada: false,
    clase: "accion",
    archivadaAt: null,
    hubspotTaskId: null,
    hubspotContactId: "501",
    hubspotDealId: null,
    responsableEmail: "apinzon@smarteamcr.com",
    venceEl: "2026-10-29",
  };

  it("una tarea abierta con contacto o negocio, con fecha y con dueño en HubSpot, se crea allá", () => {
    expect(seCreaEnHubspot(base, "84937900")).toBe(true);
    expect(seCreaEnHubspot({ ...base, hubspotContactId: null, hubspotDealId: "9001" }, "84937900")).toBe(true);
    expect(seCreaEnHubspot({ ...base, estado: "en_curso", origen: "pedido" }, "84937900")).toBe(true);
  });

  it("lo interno, lo privado, lo que ya está allá, las propuestas y las reuniones no", () => {
    expect(seCreaEnHubspot({ ...base, hubspotContactId: null }, "84937900")).toBe(false);
    expect(seCreaEnHubspot({ ...base, privada: true }, "84937900")).toBe(false);
    expect(seCreaEnHubspot({ ...base, hubspotTaskId: "777" }, "84937900")).toBe(false);
    expect(seCreaEnHubspot({ ...base, estado: "propuesta" }, "84937900")).toBe(false);
    expect(seCreaEnHubspot({ ...base, estado: "hecha" }, "84937900")).toBe(false);
    expect(seCreaEnHubspot({ ...base, clase: "reunion" }, "84937900")).toBe(false);
    expect(seCreaEnHubspot({ ...base, archivadaAt: new Date() }, "84937900")).toBe(false);
  });

  it("ni lo que vino de HubSpot, ni el siguiente paso, ni una rutina", () => {
    for (const origen of ["hubspot", "paso", "plantilla"]) expect(seCreaEnHubspot({ ...base, origen }, "84937900")).toBe(false);
  });

  it("sin fecha o sin dueño en HubSpot, espera y dice qué le falta", () => {
    expect(seCreaEnHubspot({ ...base, venceEl: null }, "84937900")).toBe(false);
    expect(faltaParaHubspot({ ...base, venceEl: null }, "84937900")).toBe("sin_fecha");
    expect(seCreaEnHubspot(base, null)).toBe(false);
    expect(faltaParaHubspot(base, null)).toBe("sin_responsable");
    expect(faltaParaHubspot(base, "84937900")).toBeNull();
  });

  it("el pedido lleva los cinco campos, el dueño, el cuerpo y las asociaciones; lo acordado es lo que se escribió", () => {
    const p = pedidoParaCrear(
      { numero: 128, titulo: " Llamar a Luis por la propuesta ", notas: "Quedó en responder el lunes.\nSi no, insistir.", estado: "pendiente", prioridad: "alta", venceEl: "2026-10-29", hubspotContactId: "501", hubspotDealId: "9001", hubspotCompanyId: "300" },
      "84937900",
      "apinzon@smarteamcr.com",
    );
    expect(p.body.properties).toEqual({
      hs_task_subject: "Llamar a Luis por la propuesta",
      hs_task_body: "<p>Quedó en responder el lunes.<br>Si no, insistir.</p><p>Creada desde Nexus (T-128).</p>",
      hs_task_status: "NOT_STARTED",
      hs_task_priority: "HIGH",
      hs_timestamp: "2026-10-29T13:00:00.000Z",
      hs_task_type: "TODO",
      hubspot_owner_id: "84937900",
    });
    expect(p.body.associations.map((a) => [a.to.id, a.types[0]!.associationTypeId])).toEqual([
      ["501", 204],
      ["9001", 216],
      ["300", 192],
    ]);
    expect(p.acordado).toEqual({ titulo: "Llamar a Luis por la propuesta", estado: "pendiente", vence: "2026-10-29", prioridad: "alta", responsable: "apinzon@smarteamcr.com" });
    expect(p.datos.registro).toEqual({ objeto: "deal", id: "9001" });
  });

  it("después de crearla, la comparación no ve cambios: lo acordado es igual a los dos lados", () => {
    const p = pedidoParaCrear({ numero: 1, titulo: "Seguimiento a Luis", notas: null, estado: "pendiente", prioridad: "media", venceEl: "2026-10-29", hubspotContactId: "501", hubspotDealId: null, hubspotCompanyId: null }, "84937900", "apinzon@smarteamcr.com");
    const deHubspot = valoresDeHubspot(
      { hs_task_subject: p.body.properties.hs_task_subject, hs_task_status: p.body.properties.hs_task_status, hs_timestamp: p.body.properties.hs_timestamp, hs_task_priority: p.body.properties.hs_task_priority, hubspot_owner_id: "84937900" },
      () => "apinzon@smarteamcr.com",
    );
    const c = comparar(p.acordado, p.acordado, deHubspot, ANTES, DESPUES);
    expect(c.aNexus).toEqual({});
    expect(c.aHubspot).toEqual({});
  });

  it("el cuerpo escapa lo que parece HTML", () => {
    expect(cuerpoParaHubspot({ numero: 3, notas: "<b>ojo</b> & más" })).toBe("<p>&lt;b&gt;ojo&lt;/b&gt; &amp; más</p><p>Creada desde Nexus (T-3).</p>");
  });
});
