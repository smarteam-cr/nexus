/**
 * lib/tareas/seguimiento.test.ts — DE LOS COMPROMISOS DE UNA REUNIÓN A PROPUESTAS DE TAREA (memoria de la cuenta,
 * etapa 2; decisión 7 de Elías).
 *
 * Qué se congela:
 *   1. lo de Smarteam va a quien lo dijo (correo del equipo activo o nombre seguro); con un nombre dudoso, «Por asignar»;
 *   2. lo del cliente va al CSE del proyecto como tarea de seguimiento; con el CSE de baja, «Por asignar» de CS; en un
 *      prospecto, a quien lleva la preventa viva, y sin preventa no se propone;
 *   3. el `lineaId` empieza con `seg-` (no choca con las líneas de Tareas) y es el mismo en dos corridas;
 *   4. «frena el plan» va en `sugerido`, y la cita NUNCA va ahí (va al evento);
 *   5. lo que prometió el cliente para la misma persona en una reunión es UNA tarea de seguimiento con la lista adentro.
 *
 * Correr: `npx vitest run lib/tareas/seguimiento.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import type { CompromisoDetectado } from "@/lib/sessions/compromisos-y-alcance";
import { armarPropuestasDeSeguimiento, contextoDelCompromiso, duenoDelNegocio, esTemaDeVenta, quienDijoLaCita, lineaDeSeguimiento, esSeguimientoSueltoDelCliente, lineaDelSeguimientoAgrupado, pendienteDesdeLaTarea, seguimientoAgrupado, tituloDelCompromiso, type EntradaDeSeguimiento } from "./seguimiento";
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

describe("lo que sale de un CORREO que mandó Smarteam (iniciativa B)", () => {
  const delCorreo: Partial<EntradaDeSeguimiento> = {
    reunion: { id: "com-1", inicio: INICIO, participantes: ["marco@smarteamcr.com"] },
    cseDelProyecto: null,
    cseDeLaCuenta: "marco@smarteamcr.com",
    projectId: null,
    fuente: { tipo: "correo", asunto: "Minuta de la sesión 1", autorEmail: "marco@smarteamcr.com" },
  };

  it("lo de Smarteam sin quién lo lleva es de quien mandó el correo", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([compromiso({ que: "Agendar la sesión 2" })], delCorreo)).propuestas;
    expect(p.responsableEmail).toBe("marco@smarteamcr.com");
    expect(p.sugerido).toMatchObject({ seguimiento: true, deUnCorreo: true });
  });

  it("el contexto dice que salió del correo, con su asunto", () => {
    expect(contextoDelCompromiso(compromiso({ que: "Agendar la sesión 2", fecha: "2026-10-13" }), INICIO, delCorreo.fuente)).toBe(
      "Compromiso de Smarteam en el correo del jue 8 oct «Minuta de la sesión 1»: Agendar la sesión 2. Para el mar 13 oct.",
    );
  });

  it("lo que prometió el cliente va al CSE de la cuenta como seguimiento", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([compromiso({ quien: "CLIENTE", responsable: "Ana", que: "Enviar la base", tituloDeSeguimiento: "Recordarle a Ana que envíe la base" })], delCorreo)).propuestas;
    expect(p).toMatchObject({ responsableEmail: "marco@smarteamcr.com", titulo: "Recordarle a Ana que envíe la base", projectId: null });
  });
});

describe("un seguimiento por reunión y cuenta (2026-10-19)", () => {
  const delCliente = (que: string, c: Partial<CompromisoDetectado> = {}) =>
    compromiso({ quien: "CLIENTE", responsable: "Randall Vega Salazar", que, tituloDeSeguimiento: `Recordarle a Randall: ${que}`, cita: `cita de ${que}`, ...c });

  it("tres cosas que prometió el cliente para el CSE son UNA propuesta, con la lista en el contexto", () => {
    const { propuestas } = armarPropuestasDeSeguimiento(
      entrada(
        [
          delCliente("Enviar la decisión sobre la propuesta"),
          delCliente("Enviar el listado de activaciones", { fecha: "2026-10-14", frenaElPlan: true }),
          compromiso({ ownerEmail: "lidia@smarteamcr.com" }),
          delCliente("Mandar el correo a Leo", { fecha: "2026-10-12" }),
        ],
        { empresa: "Honda Costa Rica" },
      ),
    );
    expect(propuestas).toHaveLength(2);
    const seg = propuestas.find((p) => p.sugerido.lado === "cliente")!;
    expect(seg.titulo).toBe("Seguimiento con Honda Costa Rica: 3 cosas que prometió Randall (jue 8 oct)");
    expect(seg.lineaId).toBe(lineaDelSeguimientoAgrupado("marco@smarteamcr.com"));
    expect(seg.lineaId.startsWith("seg-")).toBe(true);
    expect(seg.responsableEmail).toBe("marco@smarteamcr.com");
    expect(seg.contexto).toContain("Lo que falta:");
    expect(seg.contexto).toContain("• Enviar el listado de activaciones (para el mié 14 oct) · frena el plan");
    expect(seg.contexto).toContain("• Mandar el correo a Leo (para el lun 12 oct)");
    expect(seg.venceEl).toBe("2026-10-12");
    expect(seg.sugerido).toMatchObject({ seguimiento: true, frenaElPlan: true, agrupa: 3, responsableDelCliente: "Randall Vega Salazar" });
    expect(JSON.stringify(seg.sugerido)).not.toContain("cita de");
    expect(seg.cita).toContain("cita de Mandar el correo a Leo");
    // Lo de Smarteam sigue suelto.
    expect(propuestas.find((p) => p.sugerido.lado === "smarteam")?.titulo).toBe("Mandar el tablero de ventas");
  });

  it("una sola cosa sigue como antes, con su título propio", () => {
    const [p] = armarPropuestasDeSeguimiento(entrada([delCliente("Enviar la base")])).propuestas;
    expect(p.titulo).toBe("Recordarle a Randall: Enviar la base");
    expect(p.lineaId).toBe(lineaDeSeguimiento({ quien: "CLIENTE", que: "Enviar la base" }));
  });

  it("dos personas del cliente: el título dice «el cliente» y cada línea dice de quién", () => {
    const a = seguimientoAgrupado(
      [
        { que: "enviar la base", quien: "Ana", fecha: null, frenaElPlan: false, cita: "x" },
        { que: "aprobar el diseño", quien: "Luis", fecha: null, frenaElPlan: false, cita: "y" },
      ],
      { empresa: null, inicio: INICIO },
    );
    expect(a.titulo).toBe("Seguimiento: 2 cosas que prometió el cliente (jue 8 oct)");
    expect(a.contexto).toContain("• Ana: Enviar la base");
    expect(a.contexto).toContain("• Luis: Aprobar el diseño");
  });

  it("releer la reunión da el mismo lineaId (no duplica)", () => {
    const cs = [delCliente("Uno"), delCliente("Dos")];
    const a = armarPropuestasDeSeguimiento(entrada(cs)).propuestas.map((p) => p.lineaId);
    const b = armarPropuestasDeSeguimiento(entrada([...cs].reverse())).propuestas.map((p) => p.lineaId);
    expect(a).toEqual(b);
  });

  it("en un correo dice «en el correo del…»", () => {
    const { propuestas } = armarPropuestasDeSeguimiento(entrada([delCliente("Uno"), delCliente("Dos")], { fuente: { tipo: "correo", asunto: "Minuta", autorEmail: "lidia@smarteamcr.com" } }));
    expect(propuestas[0].contexto).toContain("en el correo del jue 8 oct «Minuta»");
  });
});

describe("lo que ya estaba propuesto", () => {
  it("lee quién y qué del contexto que escribió el código", () => {
    const c = compromiso({ quien: "CLIENTE", responsable: "Randall Vega Salazar", que: "Enviar el listado de activaciones", fecha: "2026-10-14", frenaElPlan: true });
    const p = pendienteDesdeLaTarea({ titulo: "Recordarle a Randall…", contexto: contextoDelCompromiso(c, INICIO), venceEl: "2026-10-14", cita: "la cita" });
    expect(p).toEqual({ que: "Enviar el listado de activaciones", quien: "Randall Vega Salazar", fecha: "2026-10-14", frenaElPlan: true, cita: "la cita" });
  });

  it("sin contexto reconocible, el título hace de «qué»", () => {
    expect(pendienteDesdeLaTarea({ titulo: "Recordarle algo", contexto: null, venceEl: null, cita: null })).toMatchObject({ que: "Recordarle algo", quien: null });
  });

  it("reconoce solo los seguimientos sueltos del cliente", () => {
    expect(esSeguimientoSueltoDelCliente("l:lec:seg-c-abc")).toBe(true);
    expect(esSeguimientoSueltoDelCliente("cor:x:seg-c-abc")).toBe(true);
    expect(esSeguimientoSueltoDelCliente("l:lec:seg-c-g-abc")).toBe(false);
    expect(esSeguimientoSueltoDelCliente("l:lec:seg-s-abc")).toBe(false);
    expect(esSeguimientoSueltoDelCliente("l:lec:seg-c-abc:retirada:1")).toBe(false);
  });
});

describe("de quién es (2026-10-20): quien se comprometió, el dueño del negocio en lo de venta, la cuenta al final", () => {
  /* Los de verdad de la reunión «KÖLBI + SMARTEAM | DESPEGUEMOS» (vie 16 oct): estuvieron Marco Salas (Ventas, dueño del
     negocio «KOLBI | RENOVACIÓN MARKETING») y Alexander Vanegas (CSL, dueño del negocio «Kolbi - SmartLoop»); Valentina
     Sandoval lleva la cuenta y no estuvo. */
  const EQUIPO = [
    { email: "msalas@smarteamcr.com", nombre: "Marco Salas", area: "Ventas", roleEnum: "SUPER_ADMIN" },
    { email: "avanegas@smarteamcr.com", nombre: "Alexander Vanegas", area: "CSE", roleEnum: "CSL" },
    { email: "vsandoval@smarteamcr.com", nombre: "Valentina Sandoval Devia", area: "CSE", roleEnum: "CSE" },
    { email: "apinzon@smarteamcr.com", nombre: "Andrés Pinzón", area: "Ventas", roleEnum: "VENTAS" },
  ];
  const SALA = ["gcamacho@ice.go.cr", "avanegas@smarteamcr.com", "psanabriav@ice.go.cr", "msalas@smarteamcr.com", "bmartinez@ice.go.cr"];
  const NEGOCIO = { vendedores: ["msalas@smarteamcr.com", "avanegas@smarteamcr.com"], duenoDeLaEmpresa: "apinzon@smarteamcr.com" };
  const kolbi = (compromisos: CompromisoDetectado[], cambios: Partial<EntradaDeSeguimiento> = {}) =>
    entrada(compromisos, {
      lectura: { id: "lec-k", equipo: "cs" },
      reunion: { id: "despeguemos", inicio: INICIO, participantes: SALA },
      miembros: EQUIPO,
      cseDelProyecto: "vsandoval@smarteamcr.com",
      negocio: NEGOCIO,
      empresa: "kölbi",
      ...cambios,
    });
  const priscilla = (c: Partial<CompromisoDetectado> = {}) =>
    compromiso({
      que: "Preparar y enviar a Priscilla Sanabria la propuesta actualizada de renovación del contrato de marketing",
      titulo: "Enviar la propuesta de renovación de marketing actualizada a kölbi",
      fecha: "2026-10-21",
      cita: "Actualizar propuesta contractual: Presentar una propuesta actualizada que detalle el alcance",
      ...c,
    });

  it("⭐ el caso de Priscilla: lo dijo Marco, es de Marco (Ventas), no de Valentina que lleva la cuenta", () => {
    const [p] = armarPropuestasDeSeguimiento(kolbi([priscilla({ responsable: "Marco Salas" })])).propuestas;
    expect(p).toMatchObject({ responsableEmail: "msalas@smarteamcr.com", equipo: "ventas", porAsignar: false });
  });

  it("⭐ el caso de Priscilla sin nombre y como lo que espera el cliente: va al dueño del negocio que estuvo, no al CSE", () => {
    const [p] = armarPropuestasDeSeguimiento(kolbi([priscilla({ esperaElCliente: true })])).propuestas;
    expect(p).toMatchObject({ responsableEmail: "msalas@smarteamcr.com", equipo: "ventas" });
    expect(p.sugerido.temaDeVenta).toBe(true);
  });

  it("lo de venta sin dueño seguro va a «Por asignar» de Ventas, nunca a quien lleva la cuenta", () => {
    const dosDeVentas = { vendedores: ["msalas@smarteamcr.com", "apinzon@smarteamcr.com"], duenoDeLaEmpresa: null };
    const sinSala = { id: "s", inicio: INICIO, participantes: [] };
    const [p] = armarPropuestasDeSeguimiento(kolbi([priscilla({ esperaElCliente: true })], { negocio: dosDeVentas, reunion: sinSala })).propuestas;
    expect(p).toMatchObject({ responsableEmail: null, porAsignar: true, equipo: "ventas" });
    const [sinDato] = armarPropuestasDeSeguimiento(kolbi([priscilla({ esperaElCliente: true })], { negocio: undefined })).propuestas;
    expect(sinDato).toMatchObject({ responsableEmail: null, equipo: "ventas" });
  });

  it("lo que no es de venta y espera el cliente sigue yendo a quien lleva la cuenta (el último recurso)", () => {
    const [p] = armarPropuestasDeSeguimiento(kolbi([compromiso({ que: "Enviar el reporte de campañas de octubre", esperaElCliente: true })])).propuestas;
    expect(p.responsableEmail).toBe("vsandoval@smarteamcr.com");
  });

  it("quien dijo la cita en la reunión (su turno), si es del equipo y estuvo, manda sobre la cuenta", () => {
    const transcripcion = ["00:10:00", "", "Priscilla Sanabria: ¿y el reporte?", "Alexander Vanegas: Yo te mando el reporte de campañas el viernes sin falta."].join("\n");
    const c = compromiso({ que: "Enviar el reporte de campañas", cita: "te mando el reporte de campañas el viernes", esperaElCliente: true });
    const [p] = armarPropuestasDeSeguimiento(kolbi([c], { reunion: { id: "s", inicio: INICIO, participantes: SALA, transcripcion } })).propuestas;
    expect(p.responsableEmail).toBe("avanegas@smarteamcr.com");
    // Si quien habló no estuvo (o no es del equipo), no cuenta.
    const deAfuera = transcripcion.replace("Alexander Vanegas:", "Andrés Pinzón:");
    const [q] = armarPropuestasDeSeguimiento(kolbi([c], { reunion: { id: "s", inicio: INICIO, participantes: SALA, transcripcion: deAfuera } })).propuestas;
    expect(q.responsableEmail).toBe("vsandoval@smarteamcr.com");
  });

  it("lo que prometió el cliente sobre un tema de venta lo sigue el dueño del negocio; lo demás, el CSE", () => {
    const aprobar = compromiso({
      quien: "CLIENTE",
      responsable: "Priscilla Sanabria",
      que: "Aprobar la propuesta de renovación del contrato de marketing",
      tituloDeSeguimiento: "Recordarle a Priscilla que apruebe la renovación",
    });
    const ti = compromiso({
      quien: "CLIENTE",
      responsable: "Priscilla Sanabria",
      que: "Gestionar internamente con TI el desbloqueo de la integración de Infoclick con HubSpot",
      tituloDeSeguimiento: "Recordarle a Priscilla que escale con TI, requisito para aprobar la renovación",
    });
    const { propuestas } = armarPropuestasDeSeguimiento(kolbi([aprobar, ti]));
    expect(propuestas.map((p) => [p.responsableEmail, p.equipo])).toEqual([
      ["msalas@smarteamcr.com", "ventas"],
      ["vsandoval@smarteamcr.com", "cs"],
    ]);
  });
});

describe("esTemaDeVenta, duenoDelNegocio y quienDijoLaCita", () => {
  it("reconoce lo de venta o negociación, y no lo que solo se le parece", () => {
    for (const t of [
      "Preparar y enviar a Priscilla Sanabria la propuesta actualizada de renovación del contrato de marketing",
      "Agendar la reunión de revisión de la propuesta contractual actualizada",
      "Complementar la propuesta comercial con los costos de licencias de DataHub",
      "Enviar la cotización de la bolsa de horas",
      "Revisar el descuento por pago anticipado",
      "Firmar el contrato de servicio",
      "Emitir la orden de compra",
    ])
      expect(esTemaDeVenta(t), t).toBe(true);
    for (const t of [
      "Configurar los paquetes de renovación automática de sus clientes en HubSpot",
      "Preparar la propuesta de diseño del flujo de leads",
      "Gestionar internamente con TI el desbloqueo de la integración de Infoclick con HubSpot",
      "Cargar la base de contactos",
      // Larce, T-124: la cotización es la del cliente, en HubSpot (trabajo del CSE).
      "Definir con el equipo el formato único de cotización para subirlo a HubSpot",
      "Configurar la automatización de avance de etapa de Prospección a Cotización cuando se envía la cotización",
    ])
      expect(esTemaDeVenta(t), t).toBe(false);
  });

  const activo = (e: string | null | undefined) => (e ? { email: e, nombre: e, area: e.startsWith("v") ? "Ventas" : "CSE", roleEnum: "X" } : null);
  it("el dueño del negocio: el de Ventas que estuvo, el único que hay, o nadie", () => {
    expect(duenoDelNegocio({ vendedores: ["v1@x", "c1@x"], duenoDeLaEmpresa: null }, ["v1@x", "c1@x"], activo)?.email).toBe("v1@x");
    expect(duenoDelNegocio({ vendedores: ["v1@x", "v2@x"], duenoDeLaEmpresa: null }, ["v2@x"], activo)?.email).toBe("v2@x");
    expect(duenoDelNegocio({ vendedores: ["v1@x", "v2@x"], duenoDeLaEmpresa: null }, [], activo)).toBeNull();
    expect(duenoDelNegocio({ vendedores: ["v1@x", "v2@x"], duenoDeLaEmpresa: null }, ["v1@x", "v2@x"], activo)).toBeNull();
    expect(duenoDelNegocio({ vendedores: ["c1@x"], duenoDeLaEmpresa: null }, [], activo)?.email).toBe("c1@x");
    expect(duenoDelNegocio({ vendedores: [], duenoDeLaEmpresa: "v9@x" }, [], activo)?.email).toBe("v9@x");
    expect(duenoDelNegocio(undefined, [], activo)).toBeNull();
  });

  it("quien dijo la cita: el hablante del único turno que la contiene", () => {
    const t = "Marco Salas: Entonces te preparamos la propuesta actualizada para el martes.\nPriscilla Sanabria: Perfecto, gracias.";
    expect(quienDijoLaCita(t, "te preparamos la propuesta actualizada")).toBe("Marco Salas");
    expect(quienDijoLaCita(t, "una frase que no está en ningún turno")).toBeNull();
    expect(quienDijoLaCita(t, "corta")).toBeNull();
    expect(quienDijoLaCita(null, "te preparamos la propuesta actualizada")).toBeNull();
  });
});
