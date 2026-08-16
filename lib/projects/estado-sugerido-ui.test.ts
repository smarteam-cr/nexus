import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { proponerEstadoDesdeMotivo } from "./estado-hubspot";

/**
 * lib/projects/estado-sugerido-ui.test.ts — EL CHIP QUE OFRECE ARREGLAR LA CONTRADICCIÓN.
 *
 * En HubSpot hay un campo «motivo de bloqueo» que el equipo carga a mano y un campo «estado» que
 * casi nadie actualiza: 29 proyectos con motivo y solo 3 en Bloqueado (medido el 2026-08-15). El
 * chip aparece cuando esas dos mitades del MISMO registro se contradicen.
 *
 * ── EL FALLO QUE ESTE ARCHIVO EXISTE PARA CAZAR ──────────────────────────────
 * El endpoint se protege de pisar una decisión ajena devolviendo 409 cuando lo que la pantalla
 * mostraba ya no coincide con HubSpot. Esa protección **depende de que el cliente mande `visto`**.
 * Si alguien "simplifica" el body y lo saca, el endpoint deja de tener con qué comparar, la
 * protección se evapora, y NO PASA NADA VISIBLE: los tests del servidor siguen verdes, `tsc`
 * también, y el 409 simplemente nunca vuelve a dispararse. Es la forma exacta en que una guarda
 * del servidor se apaga desde el cliente.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** MENCIONAR NO ES USAR: el chip explica en su docblock por qué NO tiene descartar, y ese texto
 *  haría fallar un escaneo ingenuo — dejándolo verde solo si alguien borra la explicación. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const CHIP = "components/cs/account/EstadoSugeridoChip.tsx";
const SECCION = "components/cs/account/ActiveProjectsSection.tsx";

describe("⭐ aceptar no puede pisar lo que alguien cambió a mano", () => {
  it("el chip manda `visto` con el estado que la pantalla tenía", () => {
    /* Sin esto el endpoint no puede detectar la divergencia y escribe igual. Falla silenciosa
       total: nada se rompe, solo deja de protegerse. */
    const src = leer(CHIP);
    expect(src, "el chip dejó de mandar `visto`: el 409 del endpoint queda inerte").toContain(
      "visto: { estado: estadoActual }",
    );
  });

  it("pega contra el endpoint que escribe en HubSpot, no contra la base", () => {
    const src = leer(CHIP);
    expect(src).toContain("/estado-hubspot");
    expect(src).toContain('method: "PATCH"');
  });

  it("anuncia lo que VOLVIÓ, no lo que se pidió", () => {
    /* Si HubSpot normaliza o rechaza el valor, celebrar el pedido sería mentir en verde. */
    const src = leer(CHIP);
    expect(src, "el toast celebra el pedido en vez del resultado").toMatch(/r\.estado/);
  });

  it("un fallo se ve como fallo", () => {
    // Un catch mudo dejaría el chip ahí, sin explicación, y la persona apretaría de nuevo.
    expect(leer(CHIP)).toContain("toast.error");
  });
});

describe("el chip aparece SOLO cuando hay contradicción", () => {
  it("no se pinta si el estado ya coincide con el motivo", () => {
    /* Un aviso que aparece cuando no hay nada que hacer enseña a ignorarlo, y ahí el próximo
       —el que sí importaba— también se ignora. */
    expect(proponerEstadoDesdeMotivo("delayed", "Atraso por cliente")).toBeNull();
    expect(proponerEstadoDesdeMotivo("blocked", "Cliente no responde")).toBeNull();
  });

  it("no se pinta sin motivo cargado, ni con uno que no conocemos", () => {
    expect(proponerEstadoDesdeMotivo("on_track", null)).toBeNull();
    expect(proponerEstadoDesdeMotivo("on_track", "Reprogramado por vacaciones")).toBeNull();
  });

  it("sí se pinta cuando el registro se contradice", () => {
    expect(proponerEstadoDesdeMotivo("on_track", "Atraso por cliente")?.valor).toBe("delayed");
    expect(proponerEstadoDesdeMotivo(null, "Cliente pidió pausa")?.valor).toBe("on_hold");
  });

  it("el guard de render existe en el componente", () => {
    /* La tabla de arriba prueba la función; esto prueba que el componente la OBEDECE. Sin el
       early-return, un chip vacío se pintaría en cada fila de la cartera. */
    expect(leer(CHIP)).toContain("if (!propuesta || resuelto) return null;");
  });
});

describe("⚠ el chip NO ofrece descartar, y es deliberado", () => {
  it("no hay botón de descartar", () => {
    /* `HealthProposalChip` sí lo tiene porque propone una INFERENCIA del watchdog, que puede
       estar mal. Acá los dos valores salen del mismo registro de HubSpot y se contradicen:
       descartar no arreglaría la contradicción, la escondería, y el tablero seguiría mintiendo
       con la bendición de un clic. La otra salida legítima —borrar el motivo viejo en HubSpot—
       está escrita en el `title` del chip.
       ⚠ Si algún día se agrega, tiene que venir con dónde se PERSISTE el descarte: sin eso el
       aviso vuelve en la próxima recarga y el botón es decorativo. */
    const codigo = sinComentarios(leer(CHIP));
    expect(codigo.toLowerCase(), "apareció un descartar sin dónde persistirlo").not.toContain(
      "descartar",
    );
    expect(leer(CHIP), "el chip dejó de decir cuál es la otra salida").toContain(
      "borralo en HubSpot",
    );
  });
});

describe("dónde vive", () => {
  it("va junto al rótulo del estado que contradice", () => {
    /* Separarlo en un cartel aparte obligaría a la persona a acordarse de qué decía el otro. */
    const src = leer(SECCION);
    expect(src).toContain("<EstadoSugeridoChip");
    const i = src.indexOf("<EstadoSugeridoChip");
    const antes = src.slice(Math.max(0, i - 900), i);
    expect(antes, "el chip se alejó del badge de estado de HubSpot").toContain("HS_STATUS_LABEL");
  });

  it("usa tokens del tema, no colores crudos", () => {
    // La pantalla tiene ratchet de grises; un ámbar a mano rompe además el modo claro.
    const src = leer(CHIP);
    expect(src).toContain("border-warn-line bg-warn-surface text-warn-ink");
    expect(src, "colores crudos en el chip").not.toMatch(/\b(bg|text|border)-(gray|slate|zinc)-\d/);
  });
});
