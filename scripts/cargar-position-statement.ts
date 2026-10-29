/**
 * scripts/cargar-position-statement.ts — carga el position statement que escribió Elías el 28 oct (K3 y pregunta 12 del
 * roadmap), tal cual, en el perfil de la empresa que usa Nexus. Después se edita en Marketing › Audiencia.
 *
 * La frase va a `PerfilDeLaEmpresa.positionStatement`; los tres frentes, a `PerfilDeLaEmpresa.frentes`. Acompañamiento
 * entra con su promesa y sin detalle: Audiencia lo muestra como pendiente y la preventa no lo propone por calce.
 *
 * SIMULACRO por defecto. Se puede correr dos veces: si lo guardado ya es esto, no escribe. Si hay OTRO position
 * statement guardado (alguien lo editó en Audiencia), se detiene: pisarlo pide `--reemplazar`.
 *
 * Antes: scripts/sql/2026-10-28-position-statement.sql aplicado.
 * Uso (PowerShell):
 *   npx tsx scripts/cargar-position-statement.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/cargar-position-statement.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { empresaQueUsaNexus } from "@/lib/smarteam/contexto";
import { leerFrentes } from "@/lib/smarteam/posicionamiento";
import { PosicionamientoEdicionSchema, type PosicionamientoEdicion } from "@/lib/smarteam/posicionamiento-esquema";

const APPLY = resolverApply({ tablas: ["PerfilDeLaEmpresa"] });
const REEMPLAZAR = process.argv.includes("--reemplazar");

/** El texto de Elías (28 oct), tal cual. */
const POSITION_STATEMENT_DE_ELIAS: PosicionamientoEdicion = {
  frase:
    "Acompañamos a empresas que están creciendo, pero sienten que su operación comercial no da lo que debería. Primero entendemos cómo trabaja su equipo y dónde se pierde rendimiento, y después lo mejoramos por etapas, hasta que la tecnología realmente se use.",
  frentes: [
    {
      nombre: "Estructura",
      herramienta: "HubSpot",
      promesa: "Ordenar procesos, datos y equipos en un solo lugar",
      titulo: "HubSpot: ordenar la relación con cada cliente",
      queLogra: [
        { titulo: "Un solo lugar por cliente", detalle: "toda su historia, visible para el equipo" },
        { titulo: "Ventas con seguimiento", detalle: "ningún prospecto se pierde" },
        { titulo: "Marketing que se mide", detalle: "de dónde llega cada cliente" },
        { titulo: "Servicio ordenado", detalle: "tickets, tiempos y agentes de IA" },
      ],
      cuandoCabe: [
        "La venta toma semanas o meses",
        "Cada cliente vale mucho",
        "Varios equipos atienden al mismo cliente",
        "La información vive en Excel, correos y WhatsApp",
      ],
      nota: "Ejemplo: “tenemos CRM, pero nadie lo ve”",
    },
    {
      nombre: "Activación",
      herramienta: "Insider One",
      promesa: "Que miles de clientes compren, vuelvan y recompren",
      titulo: "Insider One: activar a miles de clientes",
      queLogra: [
        { titulo: "Ver al cliente completo", detalle: "web, app, tienda y call center" },
        { titulo: "Rescatar al que abandona", detalle: "carritos y solicitudes a medias" },
        { titulo: "Anticipar qué hará", detalle: "quién va a comprar y quién se va" },
        { titulo: "El canal correcto", detalle: "WhatsApp, correo, app o web, según cada cliente" },
      ],
      cuandoCabe: [
        "Le vende a personas, no solo a empresas",
        "Mucho tráfico en su web o su app",
        "Una base grande que aceptó recibir mensajes",
        "Presupuesto y gente para operar campañas",
      ],
      nota: "Sin volumen, la IA no tiene de qué aprender",
    },
    {
      nombre: "Acompañamiento",
      herramienta: null,
      promesa: "Que lo implementado se use y siga dando resultados",
      titulo: null,
      queLogra: [],
      cuandoCabe: [],
      nota: null,
    },
  ],
};

async function main() {
  const empresa = await empresaQueUsaNexus();
  if (!empresa) throw new Error("Nexus no sabe cuál es la empresa que lo usa (ninguna o dos empresas nuestras sin perfil). Corre antes scripts/cargar-perfil-de-smarteam.ts.");
  const nuevo = PosicionamientoEdicionSchema.parse(POSITION_STATEMENT_DE_ELIAS);
  const fila = await prisma.perfilDeLaEmpresa.findUnique({ where: { clientId: empresa.id }, select: { positionStatement: true, frentes: true } });
  const actual = { frase: fila?.positionStatement ?? null, frentes: leerFrentes(fila?.frentes) };
  // Los dos lados por la misma lectura: el Json de la base vuelve con sus claves en otro orden.
  const igual = JSON.stringify(actual) === JSON.stringify({ frase: nuevo.frase, frentes: leerFrentes(nuevo.frentes) });

  console.log(`La empresa que usa Nexus: ${empresa.nombre} (${empresa.id}).`);
  console.log(`  · hoy: ${actual.frase ? "frase escrita" : "sin frase"}, ${actual.frentes.length} frentes`);
  console.log(`  · se carga: la frase de Elías y ${nuevo.frentes.length} frentes (${nuevo.frentes.map((f) => f.nombre).join(", ")})`);
  if (igual) {
    console.log("\nYa está cargado tal cual: no hay nada que escribir.");
    return;
  }
  const hayOtro = !!actual.frase || actual.frentes.length > 0;
  if (hayOtro && !REEMPLAZAR) {
    console.log("\n⚠ Ya hay OTRO position statement guardado (alguien lo editó en Marketing › Audiencia). No se pisa: si de verdad hay que volver al texto de Elías, corre con --reemplazar.");
    return;
  }
  if (!APPLY) {
    console.log("\nSIMULACRO. Con --apply (y ALLOW_PROD_WRITE=1) se escribe.");
    return;
  }
  const datos = { positionStatement: nuevo.frase, frentes: nuevo.frentes as unknown as Prisma.InputJsonValue, actualizadoPorEmail: "carga:cargar-position-statement" };
  await prisma.perfilDeLaEmpresa.upsert({ where: { clientId: empresa.id }, create: { clientId: empresa.id, ...datos }, update: datos });
  console.log("\nListo.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
