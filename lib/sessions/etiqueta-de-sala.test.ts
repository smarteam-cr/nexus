/**
 * lib/sessions/etiqueta-de-sala.test.ts — CON EL CLIENTE vs PUERTAS ADENTRO.
 *
 * El dato de quién estuvo en la sala viajaba hasta el último paso del ensamblado del prompt y se
 * descartaba justo ahí (`regenerate-progress.ts`, en la línea que serializa cada reunión). Para el
 * modelo, «lo que le prometimos al cliente en su cara» y «lo que dijimos entre nosotros» eran el
 * mismo tipo de frase — y una interna es donde se dice «esto va a llegar tarde», mientras que una
 * con el cliente es donde se acuerda una fecha.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { etiquetaDeSala, prefijoDeSala } from "./etiqueta-de-sala";
import { DOMINIO_PROPIO } from "./dominio-propio";

const RAIZ = path.resolve(__dirname, "..", "..");
const PROPIOS = new Set([DOMINIO_PROPIO]);
const YO = "msalas@smarteamcr.com";
const OTRO = "bcenteno@smarteamcr.com";
const CLIENTE = "heylin@agrosmartcr.com";
const CALENDARIO = "c_987cec@group.calendar.google.com";

describe("con quién fue la reunión", () => {
  it("todos nuestros → puertas adentro", () => {
    expect(etiquetaDeSala({ participants: [YO, OTRO] }, PROPIOS)).toBe("PUERTAS ADENTRO");
  });

  it("uno de afuera → con el cliente", () => {
    expect(etiquetaDeSala({ participants: [YO, CLIENTE] }, PROPIOS)).toBe("CON EL CLIENTE");
  });

  it("el organizador cuenta aunque no esté en la lista", () => {
    /* En muchas reuniones el organizador no figura entre los participantes. Sin plegarlo, una que
       convocó el cliente se leería como si hubiéramos estado solos — la conclusión contraria. */
    expect(etiquetaDeSala({ participants: [YO], organizerEmail: CLIENTE }, PROPIOS)).toBe(
      "CON EL CLIENTE",
    );
    expect(etiquetaDeSala({ participants: [YO], organizerEmail: OTRO }, PROPIOS)).toBe(
      "PUERTAS ADENTRO",
    );
  });

  it("un calendario de Google no convierte una interna en reunión con el cliente", () => {
    // Mismo criterio que el resto del sistema: un mueble no es un invitado.
    expect(etiquetaDeSala({ participants: [YO], organizerEmail: CALENDARIO }, PROPIOS)).toBe(
      "PUERTAS ADENTRO",
    );
  });

  it("⚠ sin nadie registrado NO se rotula: no se adivina", () => {
    /* Un default le daría al modelo una certeza que nadie tiene, y ese error se propaga al
       documento. Cuando no se sabe, la reunión entra sin etiqueta. */
    expect(etiquetaDeSala({ participants: [] }, PROPIOS)).toBeNull();
    expect(etiquetaDeSala({ participants: ["sin-arroba"] }, PROPIOS)).toBeNull();
    expect(prefijoDeSala(null)).toBe("");
  });

  it("el prefijo va entre corchetes y con un espacio, listo para pegar", () => {
    expect(prefijoDeSala("PUERTAS ADENTRO")).toBe("[PUERTAS ADENTRO] ");
    expect(prefijoDeSala("CON EL CLIENTE")).toBe("[CON EL CLIENTE] ");
  });
});

describe("⭐ el rótulo llega al prompt del agente de avance", () => {
  const src = fs.readFileSync(
    path.join(RAIZ, "lib", "timeline", "regenerate-progress.ts"),
    "utf8",
  );

  it("la serialización de cada reunión antepone el prefijo", () => {
    /* Es el punto exacto donde el dato se tiraba. Si alguien «simplifica» esta línea, el prompt
       vuelve a no distinguir con quién se habló y ningún test de comportamiento se entera. */
    expect(src, "el prefijo desapareció de la serialización de sesiones").toContain(
      "prefijoDeSala(etiquetaDeSala(s, dominiosPropios))",
    );
  });

  it("los dominios propios salen de las categorías, no de una constante", () => {
    /* La lista se edita en /sessions/categories sin deploy. Hardcodearla acá haría que el rótulo
       se separe de la atribución el día que entre un dominio nuevo. */
    expect(src).toContain("buildInternalDomainsSet(categorias)");
    expect(src).toContain("getSessionCategories()");
  });

  it("el organizador viaja hasta acá: sin él la mitad de las reuniones se rotula mal", () => {
    const ps = fs.readFileSync(path.join(RAIZ, "lib", "sessions", "project-sessions.ts"), "utf8");
    expect(ps, "project-sessions dejó de traer organizerEmail").toContain("organizerEmail: true");
    expect(ps, "organizerEmail no llega al DTO").toContain("organizerEmail: s.organizerEmail");
  });
});
