import { describe, expect, it } from "vitest";
import { armarPropuestasDeLaConversacion, claveDeTareaDeConversacion, fragmentoDelTurno, type ContextoDeLaConversacion } from "./lectura-armar";
import { huellaDeTexto } from "./texto";

const MIEMBROS = [
  { email: "ale@smarteamcr.com", nombre: "Alejandra Ortega", area: "Marketing", roleEnum: "MARKETING" },
  { email: "lidia@smarteamcr.com", nombre: "Lidia Flores", area: "Marketing", roleEnum: "MARKETING" },
  { email: "marco@smarteamcr.com", nombre: "Marco Salas", area: "Ventas", roleEnum: "VENTAS" },
];

const ctx = (o: Partial<ContextoDeLaConversacion> = {}): ContextoDeLaConversacion => ({
  lectura: { id: "l1", equipo: "marketing", semana: "2026-10-05", pedidaPorEmail: "ale@smarteamcr.com", inicio: new Date("2026-10-05T15:30:00Z") },
  miembros: MIEMBROS,
  clienteDeLaReunion: null,
  clientesPorTarea: new Map(),
  candidatasPorDueno: new Map(),
  lapidas: [],
  ...o,
});

const refs = () => ({
  M: new Map([
    ["M1", "lidia@smarteamcr.com"],
    ["M2", "marco@smarteamcr.com"],
  ]),
  T: new Map([["T1", "t-banner"]]),
  R: new Map([["R1", "p-sap"]]),
  C: new Map<string, string>(),
});

const TURNOS = [
  { n: 1, hablante: "Alejandra Ortega", texto: "Bueno, empecemos." },
  { n: 2, hablante: "Lidia Flores", texto: "Yo me encargo del banner de SAP para el jueves." },
  { n: 3, hablante: "Marco Salas", texto: "Y yo le mando la propuesta a Colby." },
];

const tarea = (o: Record<string, unknown>) => ({ titulo: "Diseñar el banner de SAP", revisarTitulo: false, contexto: null, dueno: "M1", turno: 2, misma: null, proyecto: null, grupo: null, vence: null, ...o });

describe("armarPropuestasDeLaConversacion", () => {
  it("la cita es el turno, el dueño sale de las M# y otro equipo es un pedido; sin dueño, «Por asignar»", () => {
    const a = armarPropuestasDeLaConversacion(
      {
        tareas: [
          tarea({ vence: "jueves" }),
          tarea({ titulo: "Enviar la propuesta a Colby", dueno: "M2", turno: 3 }),
          tarea({ titulo: "Revisar las métricas", dueno: null, turno: 1, revisarTitulo: true }),
        ],
        grupos: [],
      },
      TURNOS,
      ctx(),
      refs(),
    );
    const [banner, propuesta, metricas] = a.propuestas;
    expect(banner).toMatchObject({ lineaId: claveDeTareaDeConversacion("Diseñar el banner de SAP"), responsableEmail: "lidia@smarteamcr.com", equipo: "marketing", semana: "2026-10-05", venceEl: "2026-10-08", notas: null, porAsignar: false, cita: "Lidia Flores: Yo me encargo del banner de SAP para el jueves." });
    expect(banner.sugerido).toMatchObject({ deLaConversacion: true });
    expect(propuesta).toMatchObject({ responsableEmail: "marco@smarteamcr.com", equipo: "ventas", pedidaPorEquipo: "marketing", pedidaPorEmail: "ale@smarteamcr.com" });
    expect(metricas).toMatchObject({ responsableEmail: null, porAsignar: true, semana: null });
    expect(metricas.sugerido).toMatchObject({ revisarTitulo: true });
  });

  it("«¿Es T-12?» solo contra las candidatas de ese dueño; una lápida no vuelve", () => {
    const candidata = { id: "t-banner", numero: 12, titulo: "Banner SAP", estado: "pendiente", responsableEmail: "lidia@smarteamcr.com", clientId: null, pases: 0 };
    const a = armarPropuestasDeLaConversacion(
      { tareas: [tarea({ misma: "T1" }), tarea({ titulo: "Enviar la propuesta a Colby", dueno: "M2", turno: 3, misma: "T1" })], grupos: [] },
      TURNOS,
      ctx({ candidatasPorDueno: new Map([["lidia@smarteamcr.com", [candidata]]]), lapidas: [{ huella: huellaDeTexto("Enviar la propuesta a Colby"), responsableEmail: "marco@smarteamcr.com", clientId: null }] }),
      refs(),
    );
    expect(a.propuestas).toHaveLength(1);
    expect(a.propuestas[0].mismaQueId).toBe("t-banner");
    expect(a.omitidas.lapida).toBe(1);
  });

  it("en una reunión de cliente todas son de ese cliente; un grupo de menos de 3 no es un proyecto", () => {
    const a = armarPropuestasDeLaConversacion(
      { tareas: [tarea({ grupo: "G1" }), tarea({ titulo: "Escribir los copies de SAP", grupo: "G1" })], grupos: [{ G: "G1", nombre: "Campaña de SAP", mismoQue: null }] },
      TURNOS,
      ctx({ clienteDeLaReunion: "c-colby" }),
      refs(),
    );
    expect(a.propuestas.every((p) => p.clientId === "c-colby")).toBe(true);
    expect(a.grupos).toEqual([]);
  });
});

describe("fragmentoDelTurno", () => {
  it("de un turno largo, la oración que dice la tarea", () => {
    const largo = `${"Hablamos de muchas cosas del trimestre y de cómo venimos. ".repeat(12)}Yo me encargo del banner de SAP para el jueves. Después vemos lo demás.`;
    const f = fragmentoDelTurno(largo, "Diseñar el banner de SAP", 120);
    expect(f.startsWith("Yo me encargo del banner de SAP")).toBe(true);
    expect(f.length).toBeLessThanOrEqual(120);
  });
});
