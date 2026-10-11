/**
 * lib/tareas/seguimiento.test.ts — DE LOS COMPROMISOS DE UNA REUNIÓN A PROPUESTAS DE TAREA (memoria de la cuenta,
 * etapa 2; decisión 7 de Elías).
 *
 * Qué se congela:
 *   1. lo de Smarteam va a quien lo dijo (correo del equipo activo o nombre seguro); con un nombre dudoso, «Por asignar»;
 *   2. lo del cliente va al CSE del proyecto como tarea de seguimiento; con el CSE de baja, «Por asignar» de CS; en un
 *      prospecto, a quien lleva la preventa viva, y sin preventa no se propone;
 *   3. el `lineaId` empieza con `seg-` (no choca con las líneas de Tareas) y es el mismo en dos corridas;
 *   4. «frena el plan» va en `sugerido`, y la cita NUNCA va ahí (va al evento).
 *
 * Correr: `npx vitest run lib/tareas/seguimiento.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import type { CompromisoDetectado } from "@/lib/sessions/compromisos-y-alcance";
import { armarPropuestasDeSeguimiento, contextoDelCompromiso, lineaDeSeguimiento, tituloDelCompromiso, type EntradaDeSeguimiento } from "./seguimiento";
import { huellaDeTexto } from "./texto";

const MIEMBROS = [
  { email: "lidia@smarteamcr.com", nombre: "Lidia Flores", area: "Marketing", roleEnum: "MARKETING" },
  { email: "ale@smarteamcr.com", nombre: "Alejandra Ortega", area: "Marketing", roleEnum: "MARKETING" },
  { email: "marco@smarteamcr.com", nombre: "Marco Salas", area: "CSE", roleEnum: "CSE" },
  { email: "marco.v@smarteamcr.com", nombre: "Marco Vargas", area: "Ventas", roleEnum: "VENTAS" },
  { email: "andres@smarteamcr.com", nombre: "Andrés Pinzón", area: "Ventas", roleEnum: "VENTAS" },
];

// Jueves 8 de octubre de 2026, 10:00 en Costa Rica.
const INICIO = new Date("2026-10-08T16:00:00Z");

function compromiso(c: Partial<CompromisoDetectado>): CompromisoDetectado {
  return { quien: "SMARTEAM", responsable: "", que: "Mandar el tablero de ventas", fecha: null, tipo: "ACCION", cita: "nosotros armamos el tablero para el viernes", ownerEmail: null, tituloDeSeguimiento: null, frenaElPlan: false, ...c };
}

function entrada(compromisos: CompromisoDetectado[], cambios: Partial<EntradaDeSeguimiento> = {}): EntradaDeSeguimiento {
  return {
    compromisos,
    lectura: { id: "lec-1", equipo: "marketing" },
    reunion: { id: "s1", inicio: INICIO, participantes: ["lidia@smarteamcr.com", "marco@smarteamcr.com", "ana@cliente.com"] },
    miembros: MIEMBROS,
    cseDelProyecto: "marco@smarteamcr.com",
    cseDeLaCuenta: null,
    clientId: "c1",
    projectId: "p1",
    ruta: "completa",
    ...cambios,
  };
}

describe("lo que se comprometió Smarteam", () => {
  it("con un correo del equipo activo, es para esa persona, en su sprint y en la semana de la reunión", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([compromiso({ ownerEmail: "lidia@smarteamcr.com" })])).propuestas;
    expect(p).toMatchObject({ responsableEmail: "lidia@smarteamcr.com", equipo: "marketing", porAsignar: false, semana: "2026-10-05", clientId: "c1", projectId: "p1", titulo: "Mandar el tablero de ventas" });
  });

  it("con un nombre seguro (estuvo en la reunión), es para esa persona aunque el modelo no haya dado el correo", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([compromiso({ responsable: "Lidia" })])).propuestas;
    expect(p.responsableEmail).toBe("lidia@smarteamcr.com");
  });

  it("con un nombre dudoso (dos Marcos), va a «Por asignar» del equipo de la lectura, y dice qué nombre se dijo", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([compromiso({ responsable: "Marco", ownerEmail: null })], { reunion: { id: "s1", inicio: INICIO, participantes: [] } })).propuestas;
    expect(p).toMatchObject({ responsableEmail: null, porAsignar: true, equipo: "marketing", semana: null });
    expect(p.sugerido.responsableDicho).toBe("Marco");
  });

  it("⭐ el nombre que se dijo (si es seguro) manda sobre el correo que eligió el modelo; si es dudoso, vale el correo", () => {
    /* Decisión de la etapa 2 (DECISIONS «La lectura de cada reunión es durable…»), al revés del orden del plan: el
       modelo elige el correo de una lista y se equivoca más que la transcripción, que dice quién lo prometió. */
    const [porNombre] = armarPropuestasDeSeguimiento(entrada([compromiso({ responsable: "Lidia", ownerEmail: "marco@smarteamcr.com" })])).propuestas;
    expect(porNombre.responsableEmail).toBe("lidia@smarteamcr.com");
    const sinSala = { reunion: { id: "s1", inicio: INICIO, participantes: [] } };
    const [dudoso] = armarPropuestasDeSeguimiento(entrada([compromiso({ responsable: "Marco", ownerEmail: "marco.v@smarteamcr.com" })], sinSala)).propuestas;
    expect(dudoso.responsableEmail).toBe("marco.v@smarteamcr.com");
  });

  it("un correo de alguien que no está en el equipo activo no vale", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([compromiso({ ownerEmail: "seFue@smarteamcr.com" })])).propuestas;
    expect(p.porAsignar).toBe(true);
  });
});

describe("lo que prometió el cliente: la tarea de seguimiento", () => {
  const delCliente = compromiso({ quien: "CLIENTE", responsable: "Ana", que: "Enviar la base de datos de clientes", tipo: "INSUMO", fecha: "2026-10-14", frenaElPlan: true, tituloDeSeguimiento: "Recordarle a Ana que envíe la base de datos", cita: "les mando la base de datos el miércoles" });

  it("va al CSE del proyecto, con su título, la semana de la fecha y «frena el plan» en sugerido", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([delCliente])).propuestas;
    expect(p).toMatchObject({ responsableEmail: "marco@smarteamcr.com", equipo: "cs", titulo: "Recordarle a Ana que envíe la base de datos", venceEl: "2026-10-14", semana: "2026-10-12", porAsignar: false });
    expect(p.sugerido).toMatchObject({ lado: "cliente", frenaElPlan: true, tipo: "INSUMO", responsableDelCliente: "Ana" });
    expect(p.contexto).toContain("Frena el plan");
  });

  it("con el CSE del proyecto de baja, «Por asignar» de Customer Success (no se le pasa a otro por su cuenta)", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([delCliente], { cseDelProyecto: "felipe@smarteamcr.com", cseDeLaCuenta: "ale@smarteamcr.com" })).propuestas;
    expect(p).toMatchObject({ responsableEmail: null, porAsignar: true, equipo: "cs" });
  });

  it("sin proyecto principal, el CSE de la cuenta", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([delCliente], { cseDelProyecto: null, cseDeLaCuenta: "marco@smarteamcr.com", projectId: null })).propuestas;
    expect(p.responsableEmail).toBe("marco@smarteamcr.com");
  });

  it("en un prospecto, para quien lleva la preventa viva; sin responsable, «Por asignar» de Ventas", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([delCliente], { ruta: "prospecto", projectId: null, cseDelProyecto: null, responsableDeLaPreventa: "andres@smarteamcr.com" })).propuestas;
    expect(p).toMatchObject({ responsableEmail: "andres@smarteamcr.com", equipo: "ventas" });
    const [q] = armarPropuestasDeSeguimiento(entrada([delCliente], { ruta: "prospecto", projectId: null, cseDelProyecto: null, responsableDeLaPreventa: null })).propuestas;
    expect(q).toMatchObject({ responsableEmail: null, porAsignar: true, equipo: "ventas" });
  });

  it("⭐ en un prospecto SIN preventa viva, lo del cliente no se propone; lo de Smarteam sí", () => {
    const r = armarPropuestasDeSeguimiento(entrada([delCliente, compromiso({ ownerEmail: "andres@smarteamcr.com" })], { ruta: "prospecto", projectId: null }));
    expect(r.sinDestino).toBe(1);
    expect(r.propuestas.map((p) => p.responsableEmail)).toEqual(["andres@smarteamcr.com"]);
  });

  it("sin título del modelo (o con voseo, que llega null), el de respaldo", () => {
    expect(tituloDelCompromiso({ quien: "CLIENTE", que: "Enviar la base", tituloDeSeguimiento: null })).toBe("Seguimiento: Enviar la base");
  });

  it("una fecha comprometida que cae antes de la semana de la reunión no corre la tarea al pasado", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([{ ...delCliente, fecha: "2026-09-30" }])).propuestas;
    expect(p.semana).toBe("2026-10-05");
  });
});

describe("el id de la línea y lo que viaja al evento", () => {
  it("⭐ empieza con «seg-» (una línea de Tareas es una huella o «c:…») y es el mismo en dos corridas", () => {
    const c = compromiso({ ownerEmail: "lidia@smarteamcr.com" });
    const a = armarPropuestasDeSeguimiento(entrada([c])).propuestas[0].lineaId;
    const b = armarPropuestasDeSeguimiento(entrada([{ ...c, cita: "otra cita para lo mismo" }])).propuestas[0].lineaId;
    expect(a).toBe(b);
    expect(a.startsWith("seg-")).toBe(true);
    expect(a).not.toBe(huellaDeTexto(c.que));
    expect(lineaDeSeguimiento({ quien: "CLIENTE", que: c.que })).not.toBe(a);
  });

  it("el mismo compromiso dos veces en la misma lectura sale una sola vez", () => {
    const c = compromiso({ ownerEmail: "lidia@smarteamcr.com" });
    expect(armarPropuestasDeSeguimiento(entrada([c, { ...c, cita: "lo repitió al final de la reunión" }])).propuestas).toHaveLength(1);
  });

  it("⛔ la cita va en la tarea, nunca en sugerido (sugerido va al evento)", () => {
    const { propuestas } = armarPropuestasDeSeguimiento(entrada([compromiso({ quien: "CLIENTE", frenaElPlan: true, responsable: "Ana" }), compromiso({ ownerEmail: "lidia@smarteamcr.com" })]));
    for (const p of propuestas) {
      expect(p.cita).toBeTruthy();
      expect(Object.keys(p.sugerido)).not.toContain("cita");
      expect(JSON.stringify(p.sugerido)).not.toContain(p.cita);
    }
  });

  it("nunca es un pedido de otro equipo: el seguimiento no pide, propone", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([compromiso({ ownerEmail: "andres@smarteamcr.com" })])).propuestas;
    expect(p).toMatchObject({ pedidaPorEmail: null, pedidaPorEquipo: null, equipo: "ventas" });
  });

  it("el contexto lo escribe el código, en tuteo, con el día de la reunión", () => {
    const t = contextoDelCompromiso(compromiso({ responsable: "Lidia", fecha: "2026-10-09" }), INICIO);
    expect(t).toBe("Compromiso de Smarteam en la reunión del jue 8 oct, lo dijo Lidia: Mandar el tablero de ventas. Para el vie 9 oct.");
  });
});
