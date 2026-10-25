/**
 * lib/google/conferencias-reglas.test.ts — las reglas de U3: qué conferencia es de qué reunión, si ocurrió, la asistencia,
 * las frases y cuándo el texto de las frases reemplaza a la transcripción. Los casos salen de lo medido en U2 (2026-10-25).
 *
 * Correr: `npx vitest run lib/google/conferencias-reglas.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import {
  asistenciaDeLaReunion,
  buscarConferencias,
  cerrarSinCuenta,
  queSeCopia,
  conferenciasDeLaReunion,
  decidirConferencia,
  esGrabador,
  frasesParaGuardar,
  lecturaConFrases,
  mismaConversacion,
  textoDeLasFrases,
  transcripcionGuardada,
  usarLasFrases,
  vuelveALeerse,
  type ParticipanteVisto,
} from "./conferencias-reglas";
import { procedenciaDelTexto } from "@/lib/sessions/texto-de-otra-reunion";
import { comprimirConversacion } from "@/lib/sessions/conversacion";

const t = (iso: string) => new Date(iso);
const conf = (nombre: string, inicio: string, fin: string | null = null) => ({ nombre, inicio: t(inicio), fin: fin ? t(fin) : null });

describe("conferenciasDeLaReunion", () => {
  const reunion = { id: "r", inicio: t("2026-10-23T22:00:00Z"), duracion: 60 };
  const nombres = (r: { conferencias: { nombre: string }[] }) => r.conferencias.map((c) => c.nombre);

  it("«Custom Agent en HubSpot»: junta las dos de «salió y volvió», deja afuera las de otras semanas y su texto es de fiar", () => {
    const todas = [
      conf("a", "2026-10-23T21:56:28Z", "2026-10-23T23:25:28Z"),
      conf("b", "2026-10-23T21:53:14Z", "2026-10-23T21:55:44Z"),
      conf("c", "2026-10-13T20:58:41Z", "2026-10-13T21:50:27Z"),
      conf("d", "2026-10-06T20:56:12Z", "2026-10-06T22:03:38Z"),
    ];
    const r = conferenciasDeLaReunion(reunion, [], todas);
    expect(nombres(r)).toEqual(["b", "a"]);
    expect(r.textoConfiable).toBe(true);
  });

  it("«Cemaco | Data Hub»: el evento quedó a las 3 y la conferencia fue a las 9: ocurrió, pero su texto no se copia", () => {
    const evento = { id: "cemaco", inicio: t("2026-10-22T21:00:00Z"), duracion: 60 };
    const r = conferenciasDeLaReunion(evento, [], [conf("x", "2026-10-22T14:58:00Z", "2026-10-22T15:46:00Z")]);
    expect(nombres(r)).toEqual(["x"]);
    expect(r.textoConfiable, "puede ser otra llamada por el mismo enlace").toBe(false);
  });

  it("la sala fija: una llamada aparte a las 8:30 con otro cliente no le deja su texto a la reunión de las 9", () => {
    const x = { id: "x", inicio: t("2026-10-23T15:00:00Z"), duracion: 30 };
    const conY = conf("y", "2026-10-23T14:30:00Z", "2026-10-23T14:55:00Z");
    const deX = conf("x1", "2026-10-23T15:00:30Z", "2026-10-23T15:30:00Z");
    expect(conferenciasDeLaReunion(x, [], [conY, deX]).textoConfiable, "la de las 8:30 cae en el margen: duda").toBe(false);
    // Una llamada 45 minutos después del fin no es de la reunión, y deja en duda el texto de la reunión.
    const despues = conf("z", "2026-10-23T16:15:00Z", "2026-10-23T16:45:00Z");
    const r = conferenciasDeLaReunion(x, [], [deX, despues]);
    expect(nombres(r)).toEqual(["x1"]);
    expect(r.textoConfiable).toBe(false);
    expect(conferenciasDeLaReunion(x, [], [deX]).textoConfiable, "sola, en su hora: de fiar").toBe(true);
  });

  it("el cliente que entra 15 minutos tarde: ocurrió, sin copiar su texto", () => {
    const a = { id: "a", inicio: t("2026-10-23T15:00:00Z"), duracion: 30 };
    const r = conferenciasDeLaReunion(a, [], [conf("c", "2026-10-23T15:45:00Z", "2026-10-23T16:10:00Z")]);
    expect(nombres(r)).toEqual(["c"]);
    expect(r.textoConfiable).toBe(false);
  });

  it("dos reuniones seguidas con el mismo enlace: la que salió y volvió a las 15:32 sigue siendo de la primera", () => {
    const a = { id: "a", inicio: t("2026-10-23T15:00:00Z"), duracion: 60 };
    const b = { id: "b", inicio: t("2026-10-23T16:00:00Z"), duracion: 60 };
    const confs = [conf("a1", "2026-10-23T15:00:00Z", "2026-10-23T15:30:00Z"), conf("a2", "2026-10-23T15:32:00Z", "2026-10-23T16:00:00Z"), conf("b1", "2026-10-23T16:01:00Z", "2026-10-23T17:00:00Z")];
    const ra = conferenciasDeLaReunion(a, [b], confs);
    const rb = conferenciasDeLaReunion(b, [a], confs);
    expect(nombres(ra)).toEqual(["a1", "a2"]);
    expect(ra.textoConfiable).toBe(true);
    expect(nombres(rb)).toEqual(["b1"]);
    expect(rb.textoConfiable).toBe(true);
  });

  it("una que entra un minuto antes de la siguiente la reclaman las dos: cuenta para ambas, sin texto", () => {
    const a = { id: "a", inicio: t("2026-10-23T15:00:00Z"), duracion: 30 };
    const b = { id: "b", inicio: t("2026-10-23T15:30:00Z"), duracion: 30 };
    const confs = [conf("x", "2026-10-23T15:29:00Z", "2026-10-23T16:00:00Z")];
    expect(conferenciasDeLaReunion(a, [b], confs)).toMatchObject({ textoConfiable: false });
    expect(conferenciasDeLaReunion(b, [a], confs)).toMatchObject({ textoConfiable: false });
    expect(nombres(conferenciasDeLaReunion(b, [a], confs))).toEqual(["x"]);
  });

  it("nunca toma la conferencia que le queda más cerca a otra reunión con el mismo código (el texto de otra reunión)", () => {
    const nueve = { id: "nueve", inicio: t("2026-10-22T15:00:00Z"), duracion: 30 };
    const tres = { id: "tres", inicio: t("2026-10-22T21:00:00Z"), duracion: 30 };
    const unica = [conf("x", "2026-10-22T21:02:00Z", "2026-10-22T21:30:00Z")];
    expect(conferenciasDeLaReunion(nueve, [tres], unica).conferencias).toEqual([]);
    expect(nombres(conferenciasDeLaReunion(tres, [nueve], unica))).toEqual(["x"]);
  });

  it("la cancelada y la que la reemplazó: la conferencia es de la vigente", () => {
    const cancelada = { id: "c", inicio: t("2026-10-23T15:00:00Z"), duracion: 60, cancelada: true };
    const nueva = { id: "n", inicio: t("2026-10-23T15:30:00Z"), duracion: 60 };
    const confs = [conf("x", "2026-10-23T15:31:00Z", "2026-10-23T16:30:00Z")];
    expect(conferenciasDeLaReunion(cancelada, [nueva], confs).conferencias).toEqual([]);
    expect(conferenciasDeLaReunion(nueva, [cancelada], confs)).toMatchObject({ textoConfiable: true });
  });

  it("una cancelada que sí ocurrió no le pasa su conferencia a otra reunión del mismo enlace ese día", () => {
    const cancelada = { id: "c", inicio: t("2026-10-23T15:00:00Z"), duracion: 60, cancelada: true };
    const tarde = { id: "t", inicio: t("2026-10-23T21:00:00Z"), duracion: 60 };
    const confs = [conf("x", "2026-10-23T15:02:00Z", "2026-10-23T16:00:00Z")];
    expect(conferenciasDeLaReunion(tarde, [cancelada], confs).conferencias, "la de las 9 le queda más cerca a la cancelada").toEqual([]);
    expect(nombres(conferenciasDeLaReunion(cancelada, [tarde], confs))).toEqual(["x"]);
  });

  it("a más de 12 horas no es de la reunión", () => {
    expect(conferenciasDeLaReunion(reunion, [], [conf("x", "2026-10-24T11:00:00Z", "2026-10-24T12:00:00Z")]).conferencias).toEqual([]);
  });
});

describe("decidirConferencia", () => {
  const fin = t("2026-10-23T23:00:00Z");
  const base = { organizadorDelEquipo: true, participantesDistintos: 4, hayFrases: false, archivos: [] as string[], finDelEvento: fin };
  const ahora = (h: number) => new Date(fin.getTime() + h * 3_600_000);

  it("sin conferencias: espera 6 horas; después «no ocurrió» si la organizó el equipo y «sin acceso» si no", () => {
    expect(decidirConferencia({ ...base, conferencias: [], ahora: ahora(2) })).toEqual({ estado: null, cerrar: false });
    expect(decidirConferencia({ ...base, conferencias: [], ahora: ahora(7) })).toEqual({ estado: "NO_OCURRIO", cerrar: true });
    expect(decidirConferencia({ ...base, organizadorDelEquipo: false, conferencias: [], ahora: ahora(7) })).toEqual({ estado: "SIN_ACCESO", cerrar: true });
  });

  it("SMATAGRO: una conferencia sin nadie (o con una sola persona) no ocurrió, pero se sigue mirando 6 horas", () => {
    const c = [conf("x", "2026-10-24T21:00:03Z", "2026-10-24T21:15:05Z")];
    // La CSE esperó sola a la hora; el cliente puede entrar más tarde por el mismo enlace y abrir otra conferencia.
    expect(decidirConferencia({ ...base, participantesDistintos: 0, conferencias: c, ahora: ahora(1) })).toEqual({ estado: "NO_OCURRIO", cerrar: false });
    expect(decidirConferencia({ ...base, participantesDistintos: 0, conferencias: c, ahora: ahora(7) })).toEqual({ estado: "NO_OCURRIO", cerrar: true });
    expect(decidirConferencia({ ...base, participantesDistintos: 1, conferencias: c, ahora: ahora(1) }).estado).toBe("NO_OCURRIO");
    expect(decidirConferencia({ ...base, participantesDistintos: 1, hayFrases: true, conferencias: c, ahora: ahora(1) }).estado, "uno solo que habló, grabándose").toBe("OCURRIO");
  });

  it("ocurrió: se cierra cuando la transcripción y las notas están generadas, o a las 48 horas", () => {
    const c = [conf("x", "2026-10-23T22:00:00Z", "2026-10-23T23:00:00Z")];
    expect(decidirConferencia({ ...base, conferencias: c, archivos: ["ENDED", "FILE_GENERATED"], ahora: ahora(1) })).toEqual({ estado: "OCURRIO", cerrar: false });
    expect(decidirConferencia({ ...base, conferencias: c, archivos: ["FILE_GENERATED", "FILE_GENERATED"], ahora: ahora(1) })).toEqual({ estado: "OCURRIO", cerrar: true });
    expect(decidirConferencia({ ...base, conferencias: c, archivos: ["ENDED"], ahora: ahora(49) }).cerrar).toBe(true);
  });

  it("no se cierra antes de 20 minutos del fin: puede abrirse otra conferencia suya (salió y volvió, o llegó tarde)", () => {
    const c = [conf("x", "2026-10-23T22:00:00Z", "2026-10-23T22:50:00Z")];
    const r = decidirConferencia({ ...base, conferencias: c, archivos: ["FILE_GENERATED"], ahora: new Date(fin.getTime() + 10 * 60_000) });
    expect(r).toEqual({ estado: "OCURRIO", cerrar: false });
  });

  it("en curso: nunca se cierra", () => {
    const c = [conf("x", "2026-10-23T22:00:00Z", null)];
    expect(decidirConferencia({ ...base, conferencias: c, ahora: ahora(1) })).toEqual({ estado: "OCURRIO", cerrar: false });
  });
});

describe("asistenciaDeLaReunion", () => {
  const directorio = new Map([["users/1", "lnavarro@smarteamcr.com"]]);
  const p = (x: Partial<ParticipanteVisto> & { nombre: string }): ParticipanteVisto => ({
    mostrado: "Alguien",
    usuario: null,
    primeraEntrada: null,
    ultimaSalida: null,
    sesiones: [],
    ...x,
  });

  it("el del equipo con su correo, el de fuera con «meet:» y su id; la misma persona en dos conferencias se junta", () => {
    const r = asistenciaDeLaReunion(
      [
        p({ nombre: "c1/p/1", mostrado: "Liz Navarro", usuario: "users/1", primeraEntrada: t("2026-10-23T17:00:00Z"), ultimaSalida: t("2026-10-23T17:30:00Z"), sesiones: [{ inicio: t("2026-10-23T17:00:00Z"), fin: t("2026-10-23T17:30:00Z") }] }),
        p({ nombre: "c2/p/9", mostrado: "Liz Navarro", usuario: "users/1", primeraEntrada: t("2026-10-23T17:40:00Z"), ultimaSalida: t("2026-10-23T18:00:00Z"), sesiones: [{ inicio: t("2026-10-23T17:40:00Z"), fin: t("2026-10-23T18:00:00Z") }] }),
        p({ nombre: "c1/p/2", mostrado: "José Ponce", usuario: "users/77", primeraEntrada: t("2026-10-23T17:05:00Z"), ultimaSalida: t("2026-10-23T17:45:00Z") }),
      ],
      directorio,
    );
    const liz = r.find((a) => a.correo === "lnavarro@smarteamcr.com")!;
    expect(liz).toMatchObject({ esDelEquipo: true, nombre: "Liz Navarro", minutos: 50 });
    expect(liz.entro?.toISOString()).toBe("2026-10-23T17:00:00.000Z");
    expect(liz.salio?.toISOString()).toBe("2026-10-23T18:00:00.000Z");
    expect(r.find((a) => a.correo === "meet:users/77")).toMatchObject({ esDelEquipo: false, minutos: 40, idEnMeet: "users/77" });
    expect(r).toHaveLength(2);
  });

  it("los grabadores no son personas (Camosa: «Smarteam's Notetaker», anónimo)", () => {
    expect(esGrabador({ mostrado: "Smarteam's Notetaker", usuario: null })).toBe(true);
    expect(esGrabador({ mostrado: "Fireflies.ai Notetaker", usuario: null })).toBe(true);
    expect(esGrabador({ mostrado: "Robot Pérez", usuario: "users/5" }), "con cuenta de Google es una persona").toBe(false);
    expect(esGrabador({ mostrado: "Roberto", usuario: null })).toBe(false);
    expect(asistenciaDeLaReunion([p({ nombre: "c/p/1", mostrado: "Smarteam's Notetaker" })], directorio)).toEqual([]);
  });
});

describe("las frases", () => {
  const hablantes = new Map([
    ["c/p/1", { mostrado: "Liz Navarro", correo: "lnavarro@smarteamcr.com" }],
    ["c/p/2", { mostrado: "José Ponce", correo: null }],
  ]);
  const f = (participante: string, inicio: string, texto: string) => ({ participante, inicio: t(inicio), fin: null, texto, idioma: "es-ES" });

  it("dos transcripciones con las mismas frases se juntan sin repetir, en orden", () => {
    const una = [f("c/p/2", "2026-10-23T17:00:10Z", "Buenas."), f("c/p/1", "2026-10-23T17:00:00Z", "Hola.")];
    const r = frasesParaGuardar([...una, ...una], hablantes);
    expect(r.map((x) => [x.orden, x.hablante, x.correo, x.texto])).toEqual([
      [1, "Liz Navarro", "lnavarro@smarteamcr.com", "Hola."],
      [2, "José Ponce", null, "Buenas."],
    ]);
  });

  it("el texto tiene la forma de la transcripción de Gemini: es propio para el detector y se parte en turnos", () => {
    const frases = frasesParaGuardar(
      [
        f("c/p/1", "2026-10-23T17:00:00Z", "Hola, ¿cómo están?"),
        f("c/p/1", "2026-10-23T17:00:05Z", "Arrancamos."),
        f("c/p/2", "2026-10-23T17:02:00Z", "Bien: con dudas del inventario."),
      ],
      hablantes,
    );
    const texto = textoDeLasFrases("Camosa l Exploración de retos operativos ", frases)!;
    expect(texto.split("\n")[0]).toBe("Camosa l Exploración de retos operativos - Transcripción");
    expect(procedenciaDelTexto("Camosa l Exploración de retos operativos ", texto).tipo).toBe("propia");
    expect(texto).toContain("00:02:00");
    const { turnos } = comprimirConversacion(texto, 10_000);
    expect(turnos.map((x) => [x.hablante, x.texto])).toEqual([
      ["Liz Navarro", "Hola, ¿cómo están? Arrancamos."],
      ["José Ponce", "Bien: con dudas del inventario."],
    ]);
    expect(textoDeLasFrases("x", [])).toBeNull();
  });

  it("las frases entran si no había transcripción o era de otra reunión; una propia se queda", () => {
    const largo = "x".repeat(300);
    expect(usarLasFrases(largo, "vacia")).toBe(true);
    expect(usarLasFrases(largo, "ajena")).toBe(true);
    expect(usarLasFrases(largo, "propia")).toBe(false);
    expect(usarLasFrases("corto", "vacia"), "debajo del mínimo no es una transcripción").toBe(false);
    expect(usarLasFrases(null, "vacia")).toBe(false);
  });
});

describe("buscarConferencias", () => {
  const reunion = { id: "r", inicio: t("2026-10-23T15:00:00Z"), duracion: 60 };
  const errorDeCuenta = Object.assign(new Error("permiso"), { cuenta: true });
  const esDeCuenta = (e: unknown) => !!(e as { cuenta?: boolean }).cuenta;
  const hoy = conf("hoy", "2026-10-23T15:01:00Z", "2026-10-23T16:00:00Z");
  const semanaPasada = conf("antes", "2026-10-16T15:01:00Z", "2026-10-16T16:00:00Z");

  it("la organizadora decide sola, aunque no vea nada (lo que no ve no pasó)", async () => {
    const r = await buscarConferencias(reunion, ["liz", "ana"], "liz", async () => [], esDeCuenta);
    expect(r).toMatchObject({ cuenta: "liz", leyoLaOrganizadora: true, sinCuentaQueLea: false });
  });

  it("un invitado que solo ve la de la semana pasada no decide: se le pregunta al siguiente", async () => {
    const vistas: Record<string, typeof hoy[]> = { a: [semanaPasada], b: [semanaPasada, hoy] };
    const r = await buscarConferencias(reunion, ["a", "b"], null, async (c) => vistas[c], esDeCuenta);
    expect(r).toMatchObject({ cuenta: "b", leyoLaOrganizadora: false });
    expect(r.conferencias.map((x) => x.nombre)).toContain("hoy");
  });

  it("con el permiso de Meet quitado (todas las cuentas fallan) no decide nada", async () => {
    const r = await buscarConferencias(
      reunion,
      ["liz", "ana"],
      "liz",
      async () => {
        throw errorDeCuenta;
      },
      esDeCuenta,
    );
    expect(r).toMatchObject({ cuenta: null, sinCuentaQueLea: true, leyoLaOrganizadora: false });
  });

  it("si la organizadora falla y un invitado la ve, cuenta el invitado; sin nadie a quién preguntar no es «sin cuenta»", async () => {
    const r = await buscarConferencias(
      reunion,
      ["liz", "ana"],
      "liz",
      async (c) => {
        if (c === "liz") throw errorDeCuenta;
        return [hoy];
      },
      esDeCuenta,
    );
    expect(r).toMatchObject({ cuenta: "ana", leyoLaOrganizadora: false });
    expect((await buscarConferencias(reunion, [], null, async () => [hoy], esDeCuenta)).sinCuentaQueLea).toBe(false);
  });

  it("un error que no es de cuenta (cuota, red) sube: no se toma por «no ocurrió»", async () => {
    await expect(
      buscarConferencias(
        reunion,
        ["liz"],
        "liz",
        async () => {
          throw new Error("429");
        },
        esDeCuenta,
      ),
    ).rejects.toThrow("429");
  });
});

describe("cuándo las frases cambian la lectura", () => {
  const frases = "Reunión - Transcripción\n" + "Liz: hola. ".repeat(40);
  const leidaOk = { ok: true as const, transcript: "texto del Doc ".repeat(30), summary: { overview: "notas del Doc" }, diagnostico: null };
  const leidaFallo = { ok: false as const, error: "403", status: 403 };

  it("vacía o de otra reunión: entra el texto de las frases, con las notas del Doc", () => {
    for (const guardada of ["vacia", "ajena"] as const) {
      const r = lecturaConFrases({ textoFrases: frases, guardada, leida: leidaOk, textoGuardado: null, hayNotasGuardadas: false });
      expect(r).toMatchObject({ ok: true, transcript: frases, summary: { overview: "notas del Doc" } });
    }
  });

  it("⛔ propia: se queda la guardada aunque el Doc traiga otra versión", () => {
    const r = lecturaConFrases({ textoFrases: frases, guardada: "propia", leida: leidaOk, textoGuardado: "la guardada", hayNotasGuardadas: false });
    expect(r).toMatchObject({ ok: true, transcript: "la guardada" });
    expect(lecturaConFrases({ textoFrases: frases, guardada: "propia", leida: leidaFallo, textoGuardado: "la guardada", hayNotasGuardadas: false }), "con el Doc que falló sigue siendo un fallo").toBeNull();
  });

  it("vacía, el Doc falla y ya había notas: sigue siendo un fallo (las notas de Gemini no se tapan con un resumen de Claude)", () => {
    expect(lecturaConFrases({ textoFrases: frases, guardada: "vacia", leida: leidaFallo, textoGuardado: null, hayNotasGuardadas: true })).toBeNull();
    expect(lecturaConFrases({ textoFrases: frases, guardada: "vacia", leida: leidaFallo, textoGuardado: null, hayNotasGuardadas: false })).toMatchObject({ ok: true, transcript: frases, summary: null });
  });

  it("de otra reunión y el Doc falla: entran las frases sin notas (las guardadas salieron del documento ajeno)", () => {
    expect(lecturaConFrases({ textoFrases: frases, guardada: "ajena", leida: leidaFallo, textoGuardado: null, hayNotasGuardadas: true })).toMatchObject({ ok: true, transcript: frases, summary: null });
  });

  it("una «propia» por el encabezado que no es la misma conversación (otro día de la serie) es de otra reunión", () => {
    const deHoy = "Serie - Transcripción\nLiz: revisamos inventario bodega cartago pedidos atrasados proveedor chino contenedores";
    const deAyer = "Serie - Transcripción\nAndrés: campañas correo marketing presupuesto anuncios linkedin formularios landing";
    const largo = 500;
    expect(transcripcionGuardada({ largo, propiaPorEncabezado: true, texto: deAyer, textoFrases: deHoy.repeat(5) })).toBe("ajena");
    expect(transcripcionGuardada({ largo, propiaPorEncabezado: true, texto: deHoy, textoFrases: deHoy.repeat(5) })).toBe("propia");
    expect(transcripcionGuardada({ largo: 50, propiaPorEncabezado: true, texto: deHoy, textoFrases: deHoy })).toBe("vacia");
    expect(transcripcionGuardada({ largo, propiaPorEncabezado: false, texto: null, textoFrases: null })).toBe("ajena");
    expect(mismaConversacion(deHoy, deHoy.toUpperCase())).toBe(true);
  });

  it("vuelve a la cola: frases nuevas sin transcripción propia, o el Doc recién conocido sin texto ni notas; nunca con una propia", () => {
    expect(vuelveALeerse({ guardada: "vacia", frasesNuevas: true, docNuevo: false, tieneNotas: true })).toBe(true);
    expect(vuelveALeerse({ guardada: "ajena", frasesNuevas: true, docNuevo: false, tieneNotas: true }), "la transcripción de otra reunión se corrige").toBe(true);
    expect(vuelveALeerse({ guardada: "propia", frasesNuevas: true, docNuevo: true, tieneNotas: false })).toBe(false);
    expect(vuelveALeerse({ guardada: "vacia", frasesNuevas: false, docNuevo: false, tieneNotas: false }), "sin nada nuevo no se vuelve a pedir").toBe(false);
    expect(vuelveALeerse({ guardada: "vacia", frasesNuevas: false, docNuevo: true, tieneNotas: false })).toBe(true);
    expect(vuelveALeerse({ guardada: "vacia", frasesNuevas: false, docNuevo: true, tieneNotas: true })).toBe(false);
  });
});

describe("qué se copia y cuándo", () => {
  it("las frases solo al cerrar y con el texto de fiar; con el texto en duda, ni Docs ni gente de fuera", () => {
    expect(queSeCopia({ textoConfiable: true, cerrar: true })).toEqual({ frases: true, docs: true, deFuera: true });
    expect(queSeCopia({ textoConfiable: true, cerrar: false }), "a medias (entre «salió» y «volvió») no se copian").toEqual({ frases: false, docs: true, deFuera: true });
    expect(queSeCopia({ textoConfiable: false, cerrar: true })).toEqual({ frases: false, docs: false, deFuera: false });
  });

  it("sin cuenta que lea: se cierra «sin acceso» a las 48 horas solo con el permiso bien", () => {
    const fin = t("2026-10-20T15:00:00Z");
    expect(cerrarSinCuenta({ permisoBien: true, finDelEvento: fin, ahora: t("2026-10-22T16:00:00Z") })).toBe(true);
    expect(cerrarSinCuenta({ permisoBien: true, finDelEvento: fin, ahora: t("2026-10-21T15:00:00Z") })).toBe(false);
    expect(cerrarSinCuenta({ permisoBien: false, finDelEvento: fin, ahora: t("2026-10-30T15:00:00Z") }), "con el permiso quitado no se cierra nada").toBe(false);
  });
});
