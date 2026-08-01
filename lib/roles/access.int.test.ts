/**
 * lib/roles/access.int.test.ts — visibleRoleWhere contra una base REAL (F4, 2026-08-01).
 *
 * `access.test.ts` (unit) congela el SHAPE del where; esto prueba lo que el unit no puede:
 * que compuesto con Prisma sobre filas de verdad, un documento NO compartido no existe
 * para el lector (la semántica 404), que compartir lo hace aparecer, y que la trampa del
 * SYSTEM_SUBJECT copiado (identidad referencial) falla CERRADA también en la base.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  canReadRoleDoc,
  hasSharedRoleDocs,
  visibleRoleWhere,
  SYSTEM_SUBJECT,
} from "./access";

async function mundoMinimo() {
  const lector = await prisma.teamMember.create({
    data: { name: "Lector de Prueba", email: "lector@test.local" },
  });
  const propuesta = await prisma.roleProfile.create({
    data: { title: "Propuesta Confidencial (test)" },
  });
  const perfil = await prisma.roleProfile.create({
    data: { title: "Perfil Compartible (test)" },
  });
  return { lector, propuesta, perfil };
}

const subjectDe = (tm: { id: string }, role = "CSE") => ({ role, teamMemberId: tm.id });

describe("visibleRoleWhere compuesto sobre la base — DB real", () => {
  it("sin share, el documento NO EXISTE para el lector (semántica 404); SUPER_ADMIN ve todo", async () => {
    const { lector, propuesta } = await mundoMinimo();

    expect(await canReadRoleDoc(subjectDe(lector), propuesta.id)).toBe(false);
    expect(await canReadRoleDoc({ role: "SUPER_ADMIN", teamMemberId: "x" }, propuesta.id)).toBe(true);
  });

  it("compartir hace aparecer EXACTAMENTE ese documento, no los demás", async () => {
    const { lector, propuesta, perfil } = await mundoMinimo();
    await prisma.roleProfileShare.create({
      data: { roleId: perfil.id, teamMemberId: lector.id, grantedByEmail: "direccion@test.local" },
    });

    expect(await canReadRoleDoc(subjectDe(lector), perfil.id)).toBe(true);
    expect(await canReadRoleDoc(subjectDe(lector), propuesta.id)).toBe(false);

    const lista = await prisma.roleProfile.findMany({ where: visibleRoleWhere(subjectDe(lector)) });
    expect(lista.map((r) => r.id)).toEqual([perfil.id]);
  });

  it("hasSharedRoleDocs: false sin nada, true con un share (el gate del sidebar)", async () => {
    const { lector, perfil } = await mundoMinimo();
    expect(await hasSharedRoleDocs(lector.id)).toBe(false);
    await prisma.roleProfileShare.create({
      data: { roleId: perfil.id, teamMemberId: lector.id, grantedByEmail: "direccion@test.local" },
    });
    expect(await hasSharedRoleDocs(lector.id)).toBe(true);
  });

  it("la trampa del SYSTEM_SUBJECT: la constante ve todo; una COPIA no ve NADA (fail-closed)", async () => {
    const { propuesta } = await mundoMinimo();

    expect(await canReadRoleDoc(SYSTEM_SUBJECT, propuesta.id)).toBe(true);
    // Un subject "system" armado a mano (spread, body de un request, etc.) no ES la
    // constante → cae al filtro de compartidos con un teamMemberId inexistente → nada.
    expect(await canReadRoleDoc({ ...SYSTEM_SUBJECT }, propuesta.id)).toBe(false);
  });

  it("borrar el share revoca en el acto (la fila ES el acceso)", async () => {
    const { lector, perfil } = await mundoMinimo();
    const share = await prisma.roleProfileShare.create({
      data: { roleId: perfil.id, teamMemberId: lector.id, grantedByEmail: "direccion@test.local" },
    });
    expect(await canReadRoleDoc(subjectDe(lector), perfil.id)).toBe(true);

    await prisma.roleProfileShare.delete({ where: { id: share.id } });
    expect(await canReadRoleDoc(subjectDe(lector), perfil.id)).toBe(false);
  });
});
