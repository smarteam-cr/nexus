/**
 * lib/invariantes/empresa.ts — los invariantes de la empresa como objeto central (la empresa, parte 2, 2026-10-25).
 */
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * INV51 · Cada documento tiene UN dueño, y una persona del cliente nunca es alguien del equipo.
 *   a) Ningún documento queda sin dueño (sin proyecto, sin propuesta y sin empresa): no se podría saber de quién es, y la
 *      vista del cliente no tendría a quién preguntarle (R3).
 *   b) Ninguna `PersonaDeLaEmpresa` es un correo del equipo de Smarteam: la copia los descarta; uno que aparece es una
 *      regla rota que pondría a alguien de Smarteam como «quien decide» en un cliente (R6).
 * Que la REGLA esté en la base (el CHECK `ProjectCanvas_un_solo_dueno` y el único parcial `ProjectCanvas_clientId_slug_key`,
 * que `check:esquema` no ve) lo mira scripts/check-invariants.ts, que puede leer el catálogo de Postgres.
 */
export const INV51: Invariante = {
  id: "51",
  nombre: "cada documento tiene un dueño y ninguna persona del cliente es del equipo",
  async correr(db) {
    const equipo = (await db.teamMember.findMany({ select: { email: true } })).map((t) => t.email.toLowerCase());
    let sinDueno: number;
    let delEquipo: number;
    try {
      [sinDueno, delEquipo] = await Promise.all([
        db.projectCanvas.count({ where: { projectId: null, businessCaseId: null, clientId: null } }),
        equipo.length ? db.personaDeLaEmpresa.count({ where: { correo: { in: equipo }, vigente: true } }) : Promise.resolve(0),
      ]);
    } catch (e) {
      // Sin el SQL de la parte 2 no hay qué medir: se dice y el resto del gate sigue.
      if (esquemaDesactualizado(e)) return viola("✗ INV51 VIOLADO: falta aplicar scripts/sql/2026-10-25-empresa-parte-2.sql (la columna ProjectCanvas.clientId y la tabla PersonaDeLaEmpresa).");
      throw e;
    }
    if (sinDueno === 0 && delEquipo === 0) {
      return cumple("✓ INV51: cada documento tiene un dueño (proyecto, propuesta o empresa) y ninguna persona del cliente es del equipo.");
    }
    const partes = [
      sinDueno && `${sinDueno} documento(s) sin dueño (ni proyecto, ni propuesta, ni empresa)`,
      delEquipo && `${delEquipo} persona(s) del cliente que son del equipo de Smarteam`,
    ].filter(Boolean);
    return viola(
      `✗ INV51 VIOLADO: ${partes.join(" y ")}.` +
        `\n    Remedio: un documento sin dueño se asigna a su empresa (clientId) o se borra a mano, revisado; una persona del equipo` +
        `\n    se da de baja (vigente = false) y se revisa la regla de lib/clients/personas-de-la-empresa.ts.`,
    );
  },
};

/**
 * INV56 · Una investigación que salió de una preventa es de la MISMA empresa que esa preventa (R5, segunda parte,
 * 2026-10-26). Desde ese día la radiografía de una preventa sin investigación vigente queda guardada en la empresa
 * (`InvestigacionDeEmpresa.origen = "preventa"`), y la próxima preventa de esa empresa la lee como su radiografía: una
 * colgada de otra empresa le llevaría a una preventa lo que se investigó de otro cliente (invariante 1).
 */
export const INV56: Invariante = {
  id: "56",
  nombre: "cada investigación que salió de una preventa es de la empresa de esa preventa",
  async correr(db) {
    const filas = await db.investigacionDeEmpresa.findMany({
      where: { exploracionId: { not: null } },
      select: { id: true, clientId: true, exploracion: { select: { clientId: true } } },
    });
    const cruzadas = filas.filter((f) => f.exploracion && f.exploracion.clientId !== f.clientId);
    if (!cruzadas.length) return cumple(`✓ INV56: las ${filas.length} investigaciones que salieron de una preventa son de la empresa de su preventa.`);
    return viola(
      `✗ INV56 VIOLADO: ${cruzadas.length} investigación(es) colgadas de una empresa distinta a la de su preventa (${cruzadas.slice(0, 5).map((f) => f.id).join(", ")}).` +
        `\n    Remedio: revisar a mano de quién es cada una (la radiografía es de la empresa de la preventa) y moverla o borrarla; la` +
        `\n    preventa de la otra empresa no debe leerla. Regla: lib/exploraciones/agente.ts › correr (preparar).`,
    );
  },
};
