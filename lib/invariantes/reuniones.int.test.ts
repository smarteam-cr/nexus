/**
 * lib/invariantes/reuniones.int.test.ts — INV47 contra una base REAL (T1, 2026-10-24).
 *
 * Una reunión con texto y gente de fuera, sin empresa, de hace 3 días: INV47 la cuenta. Una igual de hace 30 días: no
 * (la resuelve T3, fuera de la ventana). Una de puertas adentro, una sin texto, una con empresa y una cuyo texto llegó
 * hace menos de 48 horas tampoco. Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { INV47, INV47_BLOQUEA, reunionesConTextoSinEmpresa } from "./reuniones";

const DIA = 86_400_000;
const TEXTO = "Ana: les mando la base de clientes el miércoles. ".repeat(10);

describe("INV47 · ninguna reunión reciente con texto queda sin empresa", () => {
  it("una de 3 días cuenta; una de 30 no; ni las de puertas adentro, sin texto, con empresa o recién llegadas", async () => {
    const ahora = new Date();
    await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteam.test"] } });
    const empresa = await prisma.client.create({ data: { name: "Cliente INV47 (test)" } });
    const fuera = ["ana@cliente.test", "liz@smarteam.test"];
    const hace = (d: number) => new Date(+ahora - d * DIA);
    await prisma.firefliesSession.createMany({
      data: [
        { id: "inv47-3-dias", title: "Reunión de 3 días", date: hace(3), enrichedAt: hace(3), participants: fuera, organizerEmail: "liz@smarteam.test", transcript: TEXTO },
        { id: "inv47-solo-notas", title: "Solo notas", date: hace(4), enrichedAt: hace(4), participants: fuera, summary: { overview: TEXTO } },
        { id: "inv47-30-dias", title: "Reunión de 30 días", date: hace(30), enrichedAt: hace(30), participants: fuera, transcript: TEXTO },
        { id: "inv47-adentro", title: "Interna", date: hace(3), enrichedAt: hace(3), participants: ["liz@smarteam.test", "marco@smarteam.test"], transcript: TEXTO },
        { id: "inv47-sin-texto", title: "Sin texto", date: hace(3), enrichedAt: hace(3), participants: fuera, summary: { overview: "corto" } },
        { id: "inv47-con-empresa", title: "Con empresa", date: hace(3), enrichedAt: hace(3), participants: fuera, transcript: TEXTO, resolvedClientId: empresa.id },
        { id: "inv47-reciente", title: "Llegó hace un día", date: hace(1), enrichedAt: hace(1), participants: fuera, transcript: TEXTO },
      ],
    });

    const sinEmpresa = await reunionesConTextoSinEmpresa(prisma, ahora);
    expect(sinEmpresa.map((s) => s.id).sort()).toEqual(["inv47-3-dias", "inv47-solo-notas"]);
    expect(sinEmpresa.find((s) => s.id === "inv47-3-dias")).toMatchObject({ dominios: ["cliente.test"], clase: "transcripcion" });
    expect(sinEmpresa.find((s) => s.id === "inv47-solo-notas")?.clase).toBe("solo_notas");

    const r = await INV47.correr(prisma, ahora);
    // Nació «no bloquea»: avisa sin poner el semáforo en rojo hasta su primer verde.
    expect(r.ok).toBe(!INV47_BLOQUEA);
    expect(r.lineas.join("\n")).toContain("«Reunión de 3 días» (inv47-3-dias)");
    expect(r.lineas.join("\n")).not.toContain("inv47-30-dias");

    // Con su empresa, queda en verde.
    await prisma.firefliesSession.updateMany({ where: { id: { in: ["inv47-3-dias", "inv47-solo-notas"] } }, data: { manualClientId: empresa.id } });
    const verde = await INV47.correr(prisma, ahora);
    expect(verde.ok).toBe(true);
    expect(verde.lineas[0]).toMatch(/^✓ INV47/);
  });
});
