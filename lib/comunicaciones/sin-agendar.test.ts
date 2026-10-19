import { describe, expect, it } from "vitest";
import { compromisoSinAgendar, esCompromisoConElCliente, esReunionPrometida, tituloDelAviso, type CompromisoParaAvisar, type LoQueSabemosDeLaCuenta } from "./sin-agendar";

const ahora = new Date("2026-10-18T15:00:00.000Z");
const hace = (horas: number) => new Date(+ahora - horas * 3_600_000);

const reunion = (o: Partial<CompromisoParaAvisar> = {}): CompromisoParaAvisar => ({
  tareaId: "t1",
  numero: 12,
  titulo: "Agendar la sesión de revisión del diagnóstico",
  estado: "propuesta",
  responsableEmail: "ana@smarteamcr.com",
  origen: "correo",
  origenId: "cor:x:seg-s-abc",
  creadaAt: hace(50),
  venceEl: "2026-10-21",
  clientId: "c1",
  ...o,
});

const nada: LoQueSabemosDeLaCuenta = { reunionPlaneada: false, eventosProximos: [], reunionesHechas: [] };

describe("el aviso de las 48 horas", () => {
  it("el caso de Marco: una reunión prometida por correo que nadie agendó en 48 horas → avisa", () => {
    expect(compromisoSinAgendar(reunion(), nada, ahora)).toEqual({ motivo: "reunion_sin_agendar", horas: 50, sinCalendario: false });
  });

  it("antes de las 48 horas, no", () => {
    expect(compromisoSinAgendar(reunion({ creadaAt: hace(47) }), nada, ahora)).toBeNull();
  });

  it("después de 21 días ya es limpieza, no", () => {
    expect(compromisoSinAgendar(reunion({ creadaAt: hace(22 * 24) }), nada, ahora)).toBeNull();
  });

  it("si alguien la tomó, no: está en Tareas", () => {
    expect(compromisoSinAgendar(reunion({ estado: "pendiente" }), nada, ahora)).toBeNull();
    expect(compromisoSinAgendar(reunion({ estado: "en_curso" }), nada, ahora)).toBeNull();
  });

  it("«Por asignar» (pendiente sin responsable) sigue sin tomar: avisa", () => {
    expect(compromisoSinAgendar(reunion({ estado: "pendiente", responsableEmail: null }), nada, ahora)?.motivo).toBe("reunion_sin_agendar");
  });

  it("rechazarla es una decisión: no avisa", () => {
    expect(compromisoSinAgendar(reunion({ estado: "rechazada" }), nada, ahora)).toBeNull();
    expect(compromisoSinAgendar(reunion({ estado: "no_se_hara" }), nada, ahora)).toBeNull();
  });

  it("en el calendario, planeada en Tareas o ya ocurrió → no avisa", () => {
    expect(compromisoSinAgendar(reunion(), { ...nada, eventosProximos: [new Date("2026-10-21T16:00:00.000Z")] }, ahora)).toBeNull();
    expect(compromisoSinAgendar(reunion(), { ...nada, reunionPlaneada: true }, ahora)).toBeNull();
    expect(compromisoSinAgendar(reunion(), { ...nada, reunionesHechas: [hace(10)] }, ahora)).toBeNull();
    // Una reunión de ANTES de prometerla no cuenta.
    expect(compromisoSinAgendar(reunion(), { ...nada, reunionesHechas: [hace(80)] }, ahora)?.motivo).toBe("reunion_sin_agendar");
  });

  it("sin el calendario, avisa por Tareas y lo dice", () => {
    expect(compromisoSinAgendar(reunion(), { ...nada, eventosProximos: null }, ahora)?.sinCalendario).toBe(true);
  });

  it("una entrega con fecha que nadie tomó → avisa sin mirar el calendario", () => {
    const t = reunion({ titulo: "Enviar la propuesta de integración", venceEl: "2026-10-20" });
    expect(compromisoSinAgendar(t, { ...nada, eventosProximos: [new Date("2026-10-19T16:00:00.000Z")] }, ahora)?.motivo).toBe("sin_tomar");
  });

  it("sin fecha y sin ser reunión, no", () => {
    expect(compromisoSinAgendar(reunion({ titulo: "Enviar la propuesta", venceEl: null }), nada, ahora)).toBeNull();
  });

  it("solo lo que salió de un correo o de la lectura de seguimiento de una reunión", () => {
    expect(esCompromisoConElCliente({ origen: "correo", origenId: null })).toBe(true);
    expect(esCompromisoConElCliente({ origen: "reunion", origenId: "l:lec1:seg-c-123" })).toBe(true);
    expect(esCompromisoConElCliente({ origen: "reunion", origenId: "l:lec1:huella" })).toBe(false);
    expect(esCompromisoConElCliente({ origen: "mano", origenId: null })).toBe(false);
    expect(compromisoSinAgendar(reunion({ origen: "mano", origenId: null }), nada, ahora)).toBeNull();
  });

  it("qué es una reunión prometida", () => {
    expect(esReunionPrometida("Agendar la sesión de revisión")).toBe(true);
    expect(esReunionPrometida("Llamada de seguimiento con Ana")).toBe(true);
    expect(esReunionPrometida("Enviar la base de datos")).toBe(false);
    expect(esReunionPrometida("Realizar reunión interna el lunes")).toBe(false);
    // «Sesión» solo como algo a agendar, no como mención (T-103 de Seléctrica, 2026-10-19).
    expect(esReunionPrometida("Revisar los archivos que Mariela reenvió durante la sesión")).toBe(false);
    expect(esReunionPrometida("Enviar el resumen de lo visto en la sesión del lunes")).toBe(false);
    expect(esReunionPrometida("Programar una sesión con Ana para revisar el diagnóstico")).toBe(true);
    expect(esReunionPrometida("Coordinar la próxima sesión con Ana")).toBe(true);
    expect(esReunionPrometida("Preparar el material para la siguiente sesión")).toBe(true);
    expect(esReunionPrometida("Sesión de seguimiento con Ana el jueves")).toBe(true);
    expect(esReunionPrometida("Reunión con el equipo para definir el plan internamente")).toBe(false);
  });

  it("el título del aviso", () => {
    const a = compromisoSinAgendar(reunion(), nada, ahora)!;
    expect(tituloDelAviso(a, reunion(), "Larce")).toBe("Larce: se prometió una reunión por correo y no está agendada");
  });
});
