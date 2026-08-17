/**
 * lib/sessions/dominio-propio.test.ts — UN CALENDARIO NO ES UNA EMPRESA.
 *
 * Google mete el calendario compartido o la sala de reuniones en la lista de invitados como si
 * fuera una persona más (`c_987cec9d…@group.calendar.google.com`). Los tres lugares del sistema
 * que deciden «esto es de afuera» miran dominios, así que un mueble hacía que una reunión nuestra
 * dejara de ser interna.
 *
 * Medido contra producción el 2026-08-15: **158 reuniones de puertas adentro** quedaban huérfanas
 * por eso — y son las que se repiten todas las semanas, «[Interno] Daily Stand Up» y «📚 Sesión de
 * aprendizaje», que son exactamente el material del que se quiere sacar contexto.
 *
 * ── POR QUÉ LOS TRES CASOS VIVEN EN EL MISMO ARCHIVO ─────────────────────────
 * Porque el invariante es uno solo y los implementadores son tres, cada uno con su propio
 * extractor de dominio y sin importarse entre sí: la cascada de atribución (`categorize.ts`), el
 * criterio de puertas adentro (`candidatas-internas.ts`) y el resumen de la sala
 * (`participantes.ts`). Repartir los asserts en tres archivos es cómo se separan: alguien
 * «limpia» uno, sus dos vecinos siguen en verde, y la reunión vuelve a perderse en una sola de
 * las tres pantallas. Acá, sacar el filtro de cualquiera de los tres pone esto en rojo.
 */
import { describe, expect, it } from "vitest";
import {
  DOMINIO_PROPIO,
  esDeNuestroEquipo,
  esDominioDeCalendario,
  esRecursoDeCalendario,
} from "./dominio-propio";
import { extractParticipantDomains } from "./categorize";
import { esReunionDePuertasAdentro } from "./candidatas-internas";
import { resumirSala } from "./participantes";

/** Casos reales, transcritos de los organizadores que aparecen en producción. */
const CALENDARIO = "c_987cec9d1a2b3c4d@group.calendar.google.com";
const SALA = "sala-piso-3@resource.calendar.google.com";
const YO = "msalas@smarteamcr.com";
const CLIENTE = "heylin@agrosmartcr.com";
const PROPIOS = new Set([DOMINIO_PROPIO]);

describe("reconocer un recurso de calendario", () => {
  it("los dos sabores: calendario de grupo y sala", () => {
    expect(esRecursoDeCalendario(CALENDARIO)).toBe(true);
    expect(esRecursoDeCalendario(SALA)).toBe(true);
  });

  it("una persona NO es un recurso, ni nuestra ni de afuera", () => {
    expect(esRecursoDeCalendario(YO)).toBe(false);
    expect(esRecursoDeCalendario(CLIENTE)).toBe(false);
  });

  it("tolera espacios y mayúsculas, como el resto del módulo", () => {
    expect(esRecursoDeCalendario("  C_ABC@Group.Calendar.Google.COM ")).toBe(true);
  });

  it("el chequeo por dominio y el chequeo por correo dicen lo mismo", () => {
    /* Son dos puertas a la misma lista: quien ya extrajo el dominio usa una, quien tiene el
       correo entero usa la otra. Si divergen, dos de los tres consumidores filtran distinto. */
    expect(esDominioDeCalendario("group.calendar.google.com")).toBe(true);
    expect(esDominioDeCalendario("resource.calendar.google.com")).toBe(true);
    expect(esDominioDeCalendario("agrosmartcr.com")).toBe(false);
    expect(esDominioDeCalendario(DOMINIO_PROPIO)).toBe(false);
  });

  it("un recurso no cuenta como del equipo aunque el filtro se saltee", () => {
    // Defensa en profundidad: si alguien olvida el filtro, al menos no se pinta como nuestro.
    expect(esDeNuestroEquipo(CALENDARIO)).toBe(false);
  });
});

describe("⭐ los TRES lugares que deciden «esto es de afuera» ignoran los calendarios", () => {
  it("1/3 · la cascada de atribución no ve el calendario como un dominio más", () => {
    const d = extractParticipantDomains([YO, CALENDARIO, SALA]);
    expect([...d]).toEqual([DOMINIO_PROPIO]);
  });

  it("2/3 · una reunión nuestra organizada por un calendario SIGUE siendo de puertas adentro", () => {
    /* EL caso de las 158: «[Interno] Daily Stand Up», organizador `c_…@group.calendar.google.com`.
       Sin el filtro, ese organizador es «una empresa de afuera» y la reunión se pierde. */
    expect(
      esReunionDePuertasAdentro({ participants: [YO], organizerEmail: CALENDARIO }, PROPIOS),
    ).toBe(true);
    expect(esReunionDePuertasAdentro({ participants: [YO, SALA] }, PROPIOS)).toBe(true);
  });

  it("3/3 · el resumen de la sala no cuenta el mueble ni como nuestro ni como de afuera", () => {
    const r = resumirSala([YO, CALENDARIO], SALA);
    expect(r.nuestros).toBe(1);
    expect(r.externos).toBe(0);
    expect(r.dominiosExternos).toEqual([]);
  });
});

describe("lo que el filtro NO cambia", () => {
  it("un invitado de verdad sigue haciendo que la reunión no sea interna", () => {
    expect(
      esReunionDePuertasAdentro({ participants: [YO, CLIENTE], organizerEmail: CALENDARIO }, PROPIOS),
    ).toBe(false);
    expect(resumirSala([YO, CLIENTE, CALENDARIO]).externos).toBe(1);
  });

  it("una sesión que SOLO tiene calendarios no es una reunión interna: es un dato incompleto", () => {
    /* Ofrecerla llenaría la lista de filas que nadie puede evaluar — el mismo criterio que ya
       aplica a una sesión sin participantes. */
    expect(esReunionDePuertasAdentro({ participants: [CALENDARIO, SALA] }, PROPIOS)).toBe(false);
    expect(extractParticipantDomains([CALENDARIO]).size).toBe(0);
  });

  it("un correo ilegible sigue contando como alguien de afuera", () => {
    // No es lo mismo «no pude leer el dominio» que «esto no es una persona». Solo lo segundo sale.
    expect(esReunionDePuertasAdentro({ participants: ["sin-arroba"] }, PROPIOS)).toBe(false);
    expect(resumirSala([YO, "sin-arroba"]).externos).toBe(1);
  });
});
