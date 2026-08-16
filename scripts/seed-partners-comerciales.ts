/**
 * scripts/seed-partners-comerciales.ts — da de alta los aliados que ya pagaron y
 * liga los pagos existentes.
 *
 * DRY-RUN por default; escribe solo con `--apply` + ALLOW_PROD_WRITE=1.
 *
 * ⚠ Las frecuencias salen de lo OBSERVADO, no de una suposición: HubSpot y Atom
 * Chat pagaron el 15-feb y el 15-may (3 meses exactos) ⇒ trimestral. **Cooby
 * pagó UNA sola vez**, así que su ritmo no se puede deducir de la data — se
 * carga en trimestral como punto de partida editable y ESTE COMENTARIO lo dice
 * para que nadie lea ese 3 como un hecho medido. Nua talk no se carga: su
 * columna en el Excel está en cero y no hay ni un pago del que inferir nada.
 *
 * Idempotente: el aliado se busca por clave normalizada y no se pisa si ya
 * existe (alguien pudo haberle cambiado la frecuencia por UI y eso manda).
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import { normalizePartner } from "../lib/cobranza/schema";

interface Semilla {
  nombre: string;
  frecuenciaMeses: number;
  /** Por qué ese número. Se guarda en `notas` para que la decisión viaje con el dato. */
  razon: string;
}

const SEMILLAS: Semilla[] = [
  {
    nombre: "HubSpot",
    frecuenciaMeses: 3,
    razon: "Observado: pagos el 15-feb y el 15-may de 2026, 3 meses exactos.",
  },
  {
    nombre: "Atom Chat",
    frecuenciaMeses: 3,
    razon: "Observado: pagos el 15-feb y el 15-may de 2026, 3 meses exactos.",
  },
  {
    nombre: "Cooby",
    frecuenciaMeses: 3,
    razon:
      "SUPUESTO, no medido: un solo pago (30-jul-2026) no permite deducir el ritmo. Corregir por UI cuando se sepa.",
  },
];

async function main() {
  const apply = resolverApply();
  const { prisma, close } = createScriptDb();

  let altas = 0;
  let yaEstaban = 0;
  let ligados = 0;

  for (const s of SEMILLAS) {
    const clave = normalizePartner(s.nombre);
    const existente = await prisma.partnerComercial.findUnique({ where: { clave } });

    let partnerId = existente?.id ?? null;
    if (existente) {
      yaEstaban++;
      console.log(`  =  ${s.nombre.padEnd(12)} ya existe (frecuencia ${existente.frecuenciaMeses}m) — no se pisa`);
    } else {
      altas++;
      console.log(`  +  ${s.nombre.padEnd(12)} cada ${s.frecuenciaMeses} meses · ${s.razon}`);
      if (apply) {
        const creado = await prisma.partnerComercial.create({
          data: {
            nombre: s.nombre,
            clave,
            frecuenciaMeses: s.frecuenciaMeses,
            notas: s.razon,
          },
          select: { id: true },
        });
        partnerId = creado.id;
      }
    }

    // Liga los pagos que ya existen y todavía no apuntan a nadie. El match es
    // por la clave normalizada del string que se escribió en su momento.
    const sueltos = await prisma.comisionPartner.findMany({
      where: { partnerId: null },
      select: { id: true, partner: true },
    });
    const mios = sueltos.filter((c) => normalizePartner(c.partner) === clave);
    if (mios.length > 0) {
      ligados += mios.length;
      console.log(`     ↳ ${mios.length} pago(s) suelto(s) a ligar`);
      if (apply && partnerId) {
        await prisma.comisionPartner.updateMany({
          where: { id: { in: mios.map((c) => c.id) } },
          data: { partnerId },
        });
      }
    }
  }

  console.log(`\n${altas} alta(s) · ${yaEstaban} ya estaban · ${ligados} pago(s) ligado(s)`);
  console.log(apply ? "APLICADO.\n" : "DRY-RUN. Volvé a correr con --apply para escribir.\n");
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
