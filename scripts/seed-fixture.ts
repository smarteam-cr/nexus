/**
 * scripts/seed-fixture.ts — el MUNDO FICTICIO de la base local (F3, 2026-08-01).
 *
 * Siembra un mundo mínimo pero completo para desarrollar contra `nexus_local`:
 * equipo (7 roles), 3 empresas (CLIENTE/PROSPECTO/INTERNO), 2 proyectos con sus
 * canvases reales (reusa createDefaultCanvases/createHandoffCanvas — el MISMO
 * código que corre en producción, no una copia), sesiones + SessionProject,
 * cronograma con avance, una cuenta de cobranza que enciende los 5 colores del
 * semáforo (respetando INV3 confirmadoPor e INV5 facturadoPor) y dos documentos
 * de /roles (PERFIL + PROPUESTA) con un share.
 *
 * ⛔ SOLO corre contra una base LOCAL. Rechaza prod SIN excepción: acá NO existe
 *    la salida ALLOW_PROD_WRITE (decisión de Elías, 2026-08-01 — los datos
 *    ficticios jamás tocan la base compartida). Solo acepta hosts loopback.
 *
 * IDEMPOTENTE: todos los ids llevan prefijo `fx-`; cada corrida borra el mundo
 * anterior (deleteMany por prefijo, las cascadas hacen el resto) y lo recrea.
 * Los datos son deliberadamente falsos (dominio example.com, RFC 2606).
 *
 * Uso:  npx tsx scripts/seed-fixture.ts        (DATABASE_URL debe apuntar a local)
 *       npm run db:local -- seed               (bootstrap completo: catálogo + esto)
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { createDefaultCanvases, createHandoffCanvas } from "@/lib/canvas/default-canvases";
import { describirDestino, esHostProduccion } from "./lib/guard";

// ── Rechazo duro de prod (sin la salida ALLOW_PROD_WRITE, a propósito) ─────────
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function assertBaseLocal(): void {
  const url = process.env.DATABASE_URL;
  let host = "";
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    host = "";
  }
  if (!url || esHostProduccion(url) || !HOSTS_LOCALES.has(host)) {
    console.error(`⛔ seed-fixture SOLO corre contra una base LOCAL (localhost). Destino: ${describirDestino(url)}`);
    console.error("   Este script NO acepta ALLOW_PROD_WRITE: el mundo ficticio jamás va a la base compartida.");
    console.error("   Levantá la local con `npm run db:local -- up` y corré `npm run db:local -- seed`.");
    process.exit(1);
  }
  console.log(`[db] destino: ${describirDestino(url)} (local ✓)`);
}
assertBaseLocal();

// ── Helpers ────────────────────────────────────────────────────────────────────
const dia = (offset: number): Date => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0); // mediodía UTC: estable ante zonas horarias
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const periodo = (d: Date): string => d.toISOString().slice(0, 7); // "YYYY-MM"

// ── El elenco (todo ficticio: example.com, RFC 2606) ───────────────────────────
const SUPER = { id: "fx-team-super", name: "Sara Superadmin Ficticia", email: "fx.superadmin@example.com", area: "CSE", roleEnum: "SUPER_ADMIN" as const };
const EQUIPO = [
  SUPER,
  { id: "fx-team-cse", name: "Carlos CSE Ficticio", email: "fx.cse@example.com", area: "CSE", roleEnum: "CSE" as const },
  { id: "fx-team-ventas", name: "Vera Ventas Ficticia", email: "fx.ventas@example.com", area: "Ventas", roleEnum: "VENTAS" as const },
  { id: "fx-team-csl", name: "Lucía CSL Ficticia", email: "fx.csl@example.com", area: "CSL", roleEnum: "CSL" as const },
  { id: "fx-team-marketing", name: "Mario Marketing Ficticio", email: "fx.marketing@example.com", area: "Marketing", roleEnum: "MARKETING" as const },
  { id: "fx-team-dev", name: "Diana Dev Ficticia", email: "fx.dev@example.com", area: "Development", roleEnum: "DEV" as const },
  { id: "fx-team-admin", name: "Andrés Admin Ficticio", email: "fx.admin@example.com", area: "Admin", roleEnum: "ADMIN" as const },
];
const CSE = EQUIPO[1];

const CLIENTE_A = { id: "fx-client-alfa", name: "FX Alfa Industrias (ficticia)", dominio: "fx-alfa.example.com" };
const CLIENTE_B = { id: "fx-client-beta", name: "FX Beta Comercial (ficticia)", dominio: "fx-beta.example.com" };
const CLIENTE_C = { id: "fx-client-interna", name: "FX Interna (nuestro propio equipo, ficticio)", dominio: "fx-interna.example.com" };

async function borrarMundoAnterior() {
  // Orden: documentos → sesiones → clientes (cascadas: proyectos, canvases,
  // timeline, cuenta+cobros, AppUsers EXTERNAL) → AppUsers internos → equipo.
  await prisma.roleProfile.deleteMany({ where: { id: { startsWith: "fx-" } } });
  await prisma.firefliesSession.deleteMany({ where: { id: { startsWith: "fx-" } } });
  await prisma.client.deleteMany({ where: { id: { startsWith: "fx-" } } });
  await prisma.appUser.deleteMany({ where: { id: { startsWith: "fx-" } } });
  await prisma.teamMember.deleteMany({ where: { id: { startsWith: "fx-" } } });
}

async function sembrarEquipo() {
  for (const m of EQUIPO) {
    await prisma.teamMember.create({ data: m });
    await prisma.appUser.create({
      data: { id: m.id.replace("fx-team-", "fx-user-"), email: m.email, kind: "INTERNAL", teamMemberId: m.id },
    });
  }
  console.log(`✓ Equipo: ${EQUIPO.length} miembros (uno por rol) + AppUsers INTERNAL`);
}

async function sembrarClientes() {
  await prisma.client.create({
    data: {
      id: CLIENTE_A.id,
      name: CLIENTE_A.name,
      kind: "CLIENTE",
      industry: "Manufactura (ficticia)",
      emailDomains: [CLIENTE_A.dominio],
      tamUsd: 25000,
    },
  });
  await prisma.client.create({
    data: { id: CLIENTE_B.id, name: CLIENTE_B.name, kind: "PROSPECTO", emailDomains: [CLIENTE_B.dominio] },
  });
  await prisma.client.create({
    data: { id: CLIENTE_C.id, name: CLIENTE_C.name, kind: "INTERNO", emailDomains: [CLIENTE_C.dominio] },
  });
  // Un usuario EXTERNAL del cliente A (para probar superficies externas logueadas).
  await prisma.appUser.create({
    data: { id: "fx-user-externo-alfa", email: `gerencia@${CLIENTE_A.dominio}`, kind: "EXTERNAL", clientId: CLIENTE_A.id },
  });
  console.log("✓ Empresas: CLIENTE / PROSPECTO / INTERNO + 1 AppUser EXTERNAL");
}

async function sembrarProyectos() {
  await prisma.project.create({
    data: {
      id: "fx-project-crm",
      clientId: CLIENTE_A.id,
      name: "Implementación CRM (ficticio)",
      status: "active",
      tags: ["sales_hub"],
      hubspotOwnerEmail: CSE.email, // el CSE ficticio es owner → el scoping por rol funciona
      hubspotOwnerName: CSE.name,
      handoffGeneratedAt: dia(-45),
    },
  });
  await prisma.project.create({
    data: {
      id: "fx-project-web",
      clientId: CLIENTE_A.id,
      name: "Sitio web (ficticio)",
      status: "active",
      tags: ["sitio_web"],
      hubspotOwnerEmail: CSE.email,
      hubspotOwnerName: CSE.name,
    },
  });

  // Canvases REALES: el mismo código que usa producción al crear un proyecto.
  for (const projectId of ["fx-project-crm", "fx-project-web"]) {
    await createDefaultCanvases(projectId, null);
  }
  const handoffCanvasId = await createHandoffCanvas("fx-project-crm");

  // Contenido CONFIRMED en el handoff (2 secciones con bloque de texto).
  const secciones = await prisma.canvasSection.findMany({
    where: { canvasId: handoffCanvasId },
    orderBy: { order: "asc" },
    take: 2,
    select: { id: true, key: true },
  });
  for (const [i, s] of secciones.entries()) {
    await prisma.canvasBlock.create({
      data: {
        sectionId: s.id,
        blockType: "TEXT",
        content:
          i === 0
            ? "Se vendió una implementación de Sales Hub para FX Alfa (empresa ficticia). Alcance: pipeline, propiedades y automatizaciones básicas. **Todo este contenido es de utilería.**"
            : "El sponsor ficticio (gerencia@fx-alfa.example.com) espera el arranque en 2 semanas. ⚠️ Por validar con cliente: alcance de integraciones.",
        order: 0,
        source: "AGENT",
        status: "CONFIRMED",
      },
    });
  }
  console.log("✓ Proyectos: 2 con canvases default + handoff con bloques CONFIRMED");
}

async function sembrarSesiones() {
  const sesiones = [
    {
      id: "fx-ses-descubrimiento",
      title: "FX Alfa — Descubrimiento (ficticia)",
      date: dia(-50),
      clientId: CLIENTE_A.id,
      dominio: CLIENTE_A.dominio,
      projectId: "fx-project-crm",
    },
    {
      id: "fx-ses-kickoff",
      title: "FX Alfa — Kickoff CRM (ficticia)",
      date: dia(-40),
      clientId: CLIENTE_A.id,
      dominio: CLIENTE_A.dominio,
      projectId: "fx-project-crm",
    },
    // Sesión del PROSPECTO, resuelta a B y SIN link a proyectos de A: el fixture
    // jamás siembra un SessionProject cross-cliente (INV1 debe quedar verde).
    {
      id: "fx-ses-beta-demo",
      title: "FX Beta — Demo inicial (ficticia)",
      date: dia(-30),
      clientId: CLIENTE_B.id,
      dominio: CLIENTE_B.dominio,
      projectId: null,
    },
  ];
  for (const s of sesiones) {
    await prisma.firefliesSession.create({
      data: {
        id: s.id,
        title: s.title,
        date: s.date,
        duration: 45,
        participants: [CSE.email, `gerencia@${s.dominio}`],
        transcript: `Transcripción ficticia de "${s.title}". Nada de esto ocurrió: es utilería del fixture local.`,
        source: "google_meet",
        organizerEmail: CSE.email,
        resolvedClientId: s.clientId,
      },
    });
    if (s.projectId) {
      await prisma.sessionProject.create({
        data: {
          id: s.id.replace("fx-ses-", "fx-sp-"),
          sessionId: s.id,
          projectId: s.projectId,
          isPrimary: true,
          source: "manual",
          included: true,
        },
      });
    }
  }
  console.log("✓ Sesiones: 3 (2 de A linkeadas, 1 de B sin link — cero cruces, INV1 verde)");
}

async function sembrarCronograma() {
  const anchor = dia(-42); // arrancó hace 6 semanas
  await prisma.projectTimeline.create({
    data: { id: "fx-tl-crm", projectId: "fx-project-crm", anchorStartDate: anchor },
  });
  const fases = [
    { id: "fx-ph-arranque", name: "Arranque y arquitectura", order: 0, durationWeeks: 2, status: "DONE" as const, activityType: "PLANIFICACION" as const },
    { id: "fx-ph-config", name: "Configuración", order: 1, durationWeeks: 3, status: "IN_PROGRESS" as const, activityType: "CONFIGURACION" as const },
    { id: "fx-ph-adopcion", name: "Capacitación y adopción", order: 2, durationWeeks: 3, status: "PENDING" as const, activityType: "ADOPCION" as const },
  ];
  for (const f of fases) {
    await prisma.timelinePhase.create({
      data: {
        id: f.id,
        timelineId: "fx-tl-crm",
        name: f.name,
        order: f.order,
        durationWeeks: f.durationWeeks,
        activityType: f.activityType,
        source: "AGENT",
        status: f.status,
        ...(f.status !== "PENDING"
          ? { statusSource: "HUMAN" as const, statusChangedByEmail: CSE.email, statusChangedAt: dia(-7), actualStart: dia(-40) }
          : {}),
        ...(f.status === "DONE" ? { actualEnd: dia(-28) } : {}),
      },
    });
  }
  const tareas = [
    { id: "fx-task-kickoff", phaseId: "fx-ph-arranque", title: "Sesión de kickoff (ficticia)", weekIndex: 0, order: 0, status: "DONE" as const, party: "AMBOS" as const, type: "SESSION" as const },
    { id: "fx-task-accesos", phaseId: "fx-ph-arranque", title: "Entregar accesos y listados", weekIndex: 1, order: 0, status: "DONE" as const, party: "CLIENTE" as const, type: "TASK" as const },
    { id: "fx-task-pipeline", phaseId: "fx-ph-config", title: "Configurar pipeline de ventas", weekIndex: 0, order: 0, status: "IN_PROGRESS" as const, party: "SMARTEAM" as const, type: "TASK" as const },
    { id: "fx-task-workflows", phaseId: "fx-ph-config", title: "Workflows de asignación", weekIndex: 1, order: 0, status: "PENDING" as const, party: "SMARTEAM" as const, type: "TASK" as const },
    { id: "fx-task-capacitacion", phaseId: "fx-ph-adopcion", title: "Capacitación al equipo comercial", weekIndex: 0, order: 0, status: "PENDING" as const, party: "AMBOS" as const, type: "SESSION" as const },
  ];
  for (const t of tareas) {
    await prisma.timelineTask.create({
      data: {
        ...t,
        source: "AGENT",
        ...(t.status !== "PENDING"
          ? { statusSource: "HUMAN" as const, statusChangedByEmail: CSE.email, statusChangedAt: dia(-7), actualStart: dia(-35) }
          : {}),
        ...(t.status === "DONE" ? { actualEnd: dia(-30) } : {}),
      },
    });
  }
  console.log("✓ Cronograma: 3 fases / 5 tareas (con avance humano sellado)");
}

async function sembrarCobranza() {
  await prisma.cuentaFinanciera.create({
    data: {
      id: "fx-cta-alfa",
      clientId: CLIENTE_A.id,
      tipo: "NACIONAL",
      viaCobro: "ODOO",
      moneda: "USD",
      creditoDias: 15,
      diaCobroAncla: 15,
      estadoCuenta: "ACTIVA",
      correoCobro: `pagos@${CLIENTE_A.dominio}`,
      razonSocial: "FX Alfa Industrias Sociedad Ficticia S.A.",
      cedulaJuridica: "3-101-000000",
      fuente: "manual",
      fuenteIdExterno: "fx-alfa",
    },
  });
  await prisma.servicioContratado.create({
    data: {
      id: "fx-svc-impl",
      cuentaId: "fx-cta-alfa",
      tipoServicio: "IMPLEMENTACION",
      modalidad: "PROYECTO",
      montoTotal: 5000,
      moneda: "USD",
      fechaInicioFacturacion: dia(-75),
      duracionMeses: 5,
      projectId: "fx-project-crm",
      descripcion: "Implementación CRM ficticia — 5 cuotas de $1000",
    },
  });

  // Los 5 colores del semáforo two-clock, con INV3 (COBRADO ⇒ confirmadoPor) e
  // INV5 (fechaEmision ⇒ facturadoPor) respetados fila por fila:
  const ADMIN_EMAIL = "fx.admin@example.com";
  const cobros: Array<{
    id: string;
    numCuota: number;
    fechaProgramada: Date;
    estado: "COBRADO" | "POR_COBRAR" | "PROGRAMADO";
    fechaEmision?: Date;
    facturado?: boolean;
    fechaCobro?: Date;
    confirmado?: boolean;
  }> = [
    // VERDE — cobrado, con toda la auditoría.
    { id: "fx-cobro-verde", numCuota: 1, fechaProgramada: dia(-70), estado: "COBRADO" as const, fechaEmision: dia(-70), facturado: true, fechaCobro: dia(-58), confirmado: true },
    // ROJO — facturado hace 40 días con crédito de 15: mora real.
    { id: "fx-cobro-rojo", numCuota: 2, fechaProgramada: dia(-42), estado: "POR_COBRAR" as const, fechaEmision: dia(-40), facturado: true },
    // AZUL — facturado hace 3 días: el crédito todavía corre, nadie debe actuar.
    { id: "fx-cobro-azul", numCuota: 3, fechaProgramada: dia(-5), estado: "POR_COBRAR" as const, fechaEmision: dia(-3), facturado: true },
    // AMARILLO — sin facturar y en ventana (±15 días): backlog de facturación.
    { id: "fx-cobro-amarillo", numCuota: 4, fechaProgramada: dia(5), estado: "PROGRAMADO" as const },
    // GRIS — programado lejos en el futuro: nada que hacer aún.
    { id: "fx-cobro-gris", numCuota: 5, fechaProgramada: dia(60), estado: "PROGRAMADO" as const },
  ];
  for (const c of cobros) {
    await prisma.cobro.create({
      data: {
        id: c.id,
        servicioId: "fx-svc-impl",
        cuentaId: "fx-cta-alfa",
        numCuota: c.numCuota,
        periodo: periodo(c.fechaProgramada),
        fechaProgramada: c.fechaProgramada,
        monto: 1000,
        moneda: "USD",
        estado: c.estado,
        origen: "MANUAL", // sin PlanDePago: el engine no propone cambios fantasma
        ...(c.fechaEmision ? { fechaEmision: c.fechaEmision } : {}),
        ...(c.facturado ? { facturadoPor: ADMIN_EMAIL, facturadoEn: c.fechaEmision } : {}),
        ...(c.fechaCobro ? { fechaCobro: c.fechaCobro } : {}),
        ...(c.confirmado ? { confirmadoPor: ADMIN_EMAIL, confirmadoEn: c.fechaCobro } : {}),
        notas: "Cobro ficticio del fixture local.",
      },
    });
  }
  console.log("✓ Cobranza: cuenta USD con 5 cobros — verde/rojo/azul/amarillo/gris (INV3+INV5 OK)");
}

async function sembrarRoles() {
  await prisma.roleProfile.create({
    data: {
      id: "fx-role-perfil-cse",
      docType: "PERFIL",
      title: "CSE Ficticio",
      area: "Customer Success",
      summary: "Perfil de puesto de utilería para la base local.",
      content: { perfil: { md: "Acompaña a los clientes ficticios de la base local. **Nada de esto es real.**" } },
      createdByEmail: SUPER.email,
      order: 0,
    },
  });
  await prisma.roleProfile.create({
    data: {
      id: "fx-role-propuesta-demo",
      docType: "PROPUESTA",
      title: "Propuesta de contratación (ficticia)",
      area: "Dirección",
      summary: "Propuesta de utilería — para probar compartir y el link público.",
      content: { perfil: { md: "Documento ficticio para ejercitar visibleRoleWhere en local." } },
      createdByEmail: SUPER.email,
      order: 1,
    },
  });
  // Compartida SOLO LECTURA con el CSE ficticio → ejercita visibleRoleWhere/hasSharedDocs.
  await prisma.roleProfileShare.create({
    data: {
      id: "fx-share-propuesta-cse",
      roleId: "fx-role-propuesta-demo",
      teamMemberId: CSE.id,
      grantedByEmail: SUPER.email,
    },
  });
  console.log("✓ Roles: PERFIL + PROPUESTA (compartida con el CSE ficticio)");
}

async function main() {
  console.log("Sembrando el mundo ficticio fx-*…\n");
  await borrarMundoAnterior();
  await sembrarEquipo();
  await sembrarClientes();
  await sembrarProyectos();
  await sembrarSesiones();
  await sembrarCronograma();
  await sembrarCobranza();
  await sembrarRoles();
  console.log("\n✅ Fixture listo. Todo lleva prefijo fx- y es re-sembrable (idempotente).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
