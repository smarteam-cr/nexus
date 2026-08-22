/**
 * lib/kickoff/completadores.test.ts — LAS SECCIONES CURADAS DEL KICKOFF, POR CHAT.
 *
 * Elías pidió (2026-08-22) agregar y quitar personas del equipo **por su nombre**, y crear franjas
 * y sesiones. Las tres chocaban con lo mismo: el ítem lleva un identificador que el modelo no puede
 * saber. La salida barata —declarárselo al esquema— habría hecho que lo invente.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { RAIZ } from "@/lib/ui/scan-source";
import { completadorDeEquipo, completadorDeHorarios } from "./completadores";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";
import {
  schemaParaElChat,
  firmaDeSeccion,
  nombreParaElChat,
} from "@/lib/canvas/capacidades-de-documento";

const EQUIPO = [
  { id: "cm_ana", name: "Ana Pérez", area: "Customer Success", photoUrl: "/ana.jpg" },
  { id: "cm_anag", name: "Ana Gómez", area: "Ventas", photoUrl: null },
  { id: "cm_heiver", name: "Heiver Rojas", area: "Desarrollo", photoUrl: null },
];

describe("agregar una persona por su nombre", () => {
  it("⭐ resuelve el nombre y la app pone la identidad y la foto", () => {
    const r = completadorDeEquipo(EQUIPO)("members", { name: "Heiver Rojas" }, { members: [] });
    expect(r).toEqual({
      ok: { teamMemberId: "cm_heiver", name: "Heiver Rojas", role: "Desarrollo", photoUrl: null },
    });
  });

  it("acepta el nombre a medias cuando no es ambiguo, y respeta el rol que dicte el chat", () => {
    const r = completadorDeEquipo(EQUIPO)("members", { name: "heiver", role: "Líder técnico" }, {});
    expect(r).toMatchObject({ ok: { teamMemberId: "cm_heiver", role: "Líder técnico" } });
  });

  it("⛔ un nombre AMBIGUO se rechaza con los candidatos — nunca elige el más parecido", () => {
    /* Es el modo de falla caro de este completador: elegir produce un kickoff con la persona
       equivocada, plausible y silencioso. La edición que lo pone en rojo: devolver `candidatos[0]`
       cuando hay más de uno. */
    const r = completadorDeEquipo(EQUIPO)("members", { name: "Ana" }, {});
    expect(r).toMatchObject({ error: expect.stringContaining("Ana Pérez") });
    expect(r).toMatchObject({ error: expect.stringContaining("Ana Gómez") });
  });

  it("⛔ y un nombre COMPLETO gana sobre el parcial: «Ana Pérez» no es ambiguo", () => {
    const r = completadorDeEquipo(EQUIPO)("members", { name: "Ana Pérez" }, {});
    expect(r).toMatchObject({ ok: { teamMemberId: "cm_ana" } });
  });

  it("⛔ alguien que no está en el directorio se rechaza CON la lista de quiénes hay", () => {
    const r = completadorDeEquipo(EQUIPO)("members", { name: "Juan Ficticio" }, {});
    expect(r).toMatchObject({ error: expect.stringContaining("Ana Pérez") });
    expect(r).toMatchObject({ error: expect.stringContaining("no hay nadie") });
  });

  it("no agrega dos veces a la misma persona", () => {
    const r = completadorDeEquipo(EQUIPO)(
      "members",
      { name: "Ana Pérez" },
      { members: [{ teamMemberId: "cm_ana" }] },
    );
    expect(r).toMatchObject({ error: expect.stringContaining("ya está") });
  });
});

describe("crear franjas y sesiones", () => {
  it("⭐ SIEMPRE inyecta el id: sin él, el motor filtra el ítem y el agregado se evapora", () => {
    /* `normalizeHorarios` descarta lo que no tenga id. Un agregado sin id desaparece al pintar
       mientras el chat dice «aplicado» — el modo de falla más caro del carril.
       La edición que lo pone en rojo: devolver el ítem tal cual. */
    const c = completadorDeHorarios(() => "id_1");
    expect(c("options", { label: "Martes 11:00" }, {})).toEqual({
      ok: { id: "id_1", label: "Martes 11:00" },
    });
  });

  it("⛔ una sesión nace SIN franja: la asignación no vive en este bloque", () => {
    /* Vive en `Project.kickoffHorarioAssignments`, superpuesta al pintar. Escribir `optionId` acá
       sería escribir donde nadie lee. Se asigna arrastrando. */
    const c = completadorDeHorarios(() => "id_2");
    expect(c("sessions", { label: "Marketing Hub" }, {})).toEqual({
      ok: { id: "id_2", label: "Marketing Hub", optionId: null },
    });
  });

  it("una franja sin horario se rechaza diciendo qué falta", () => {
    const c = completadorDeHorarios(() => "id_3");
    expect(c("options", { label: "  " }, {})).toMatchObject({
      error: expect.stringContaining("Martes 11:00"),
    });
  });
});

describe("el nombre con el que se habla de una sección", () => {
  it("⭐ una portada se llama «Portada», no por su titular", () => {
    /* El chip decía literalmente «kickoff Wherex» —el titleOverride del documento— mientras el
       contexto que lee el modelo la llamaba «Bienvenida y contexto». Dos nombres para la misma
       sección, en el mismo prompt. Visto en pantalla el 2026-08-22.
       La edición que lo pone en rojo: sacarle el `chatLabel` a los heroes, o volver a pasarle
       `effTitle` al chip. */
    expect(nombreParaElChat(KICKOFF_DEF_BY_KEY.bienvenida, "lo que sea")).toBe("Portada");

    const view = fs.readFileSync(path.join(RAIZ, "components/landing/LandingView.tsx"), "utf8");
    const i = view.lastIndexOf("<ChatDeSeccionBtn");
    expect(i, "desapareció el botón de conversar sobre una sección").toBeGreaterThan(-1);
    const btn = view.slice(i, view.indexOf("/>", i));
    expect(btn, "el chip volvió al título del documento").toContain("nombreParaElChat(def");
    expect(btn).not.toContain("label={effTitle}");
  });

  it("y una sección normal conserva su rótulo", () => {
    expect(nombreParaElChat(KICKOFF_DEF_BY_KEY.objetivos, "x")).toBe("Objetivos del proyecto");
    expect(nombreParaElChat(undefined, "el respaldo")).toBe("el respaldo");
  });
});

describe("el esquema del CHAT no es el del agente", () => {
  it("⭐ las tres curadas son alcanzables por chat, y el agente sigue sin escribirlas", () => {
    /* Llenarles el `schema` habría sido la salida fácil y es la peligrosa: el agente empezaría a
       escribirlas en la próxima regeneración y se perdería lo que curó una persona.
       La edición que lo pone en rojo: mover `schemaDelChat` a `schema`. */
    for (const key of ["equipo", "horarios", "canales"]) {
      const def = KICKOFF_DEF_BY_KEY[key];
      expect(def?.agentGenerated, `${key} dejó de ser curada`).toBe(false);
      expect(def?.schema, `${key}: el agente volvió a tener contrato sobre una sección curada`).toEqual({});
      expect(firmaDeSeccion(schemaParaElChat(def)), `${key} sigue sin ser alcanzable`).not.toBe(
        "[sin campos editables]",
      );
    }
  });

  it("⛔ el chat NO puede escribir identidades ni asignaciones", () => {
    /* `teamMemberId` lo resuelve la app contra el directorio; `id` lo genera el motor; `optionId`
       vive en OTRA columna. Declarar cualquiera de los tres invita al modelo a inventarlo.
       La edición que la pone en rojo: «completar» el esquema del chat con esos campos. */
    const equipo = JSON.stringify(schemaParaElChat(KICKOFF_DEF_BY_KEY.equipo));
    expect(equipo).not.toContain("teamMemberId");
    expect(equipo).not.toContain("photoUrl");
    const horarios = JSON.stringify(schemaParaElChat(KICKOFF_DEF_BY_KEY.horarios));
    expect(horarios, "el chat podría escribir la asignación, que vive en otra columna").not.toContain(
      "optionId",
    );
    expect(horarios).not.toContain('"id"');
  });

  it("⭐ el servidor y el editor resuelven el esquema por la MISMA función", () => {
    /* Si uno leyera `def.schema` y el otro `schemaDelChat`, el chat acordaría un cambio que el
       editor rechaza al aplicar. La edición que la pone en rojo: volver a `def?.schema` en
       cualquiera de los dos. */
    for (const archivo of ["lib/asistente/contexto.ts", "components/asistente/ejecutar-operaciones.ts"]) {
      const src = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
      expect(src, `${archivo} dejó de usar el esquema del chat`).toContain("schemaParaElChat(def)");
    }
  });
});
