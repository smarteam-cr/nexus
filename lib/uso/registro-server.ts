/**
 * lib/uso/registro-server.ts — el ÚNICO escritor de `UsoDeNexus` (etapa 4a de docs/mi-dia-plan.md).
 *
 * Una fila por persona, sección y día; cada apertura suma una y mueve la última hora. Nunca lanza: perder una apertura
 * es menos grave que fallarle una pantalla a alguien.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { diaEnCostaRica } from "./secciones";

export async function anotarApertura(personaEmail: string, seccion: string, ahora = new Date()): Promise<boolean> {
  const email = personaEmail.trim().toLowerCase();
  const dia = diaEnCostaRica(ahora);
  const sumar = () =>
    prisma.usoDeNexus.update({
      where: { personaEmail_seccion_dia: { personaEmail: email, seccion, dia } },
      data: { aperturas: { increment: 1 }, ultimaAt: ahora },
    });
  try {
    await prisma.usoDeNexus.upsert({
      where: { personaEmail_seccion_dia: { personaEmail: email, seccion, dia } },
      create: { personaEmail: email, seccion, dia, primeraAt: ahora, ultimaAt: ahora },
      update: { aperturas: { increment: 1 }, ultimaAt: ahora },
    });
    return true;
  } catch (e) {
    // Dos pestañas a la vez: la otra creó la fila primero. Se suma en la que quedó.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      try {
        await sumar();
        return true;
      } catch {
        return false;
      }
    }
    console.error("[uso] no se pudo anotar la apertura", e instanceof Error ? e.message : e);
    return false;
  }
}
