/**
 * lib/cobranza/ingest.ts
 *
 * Núcleo compartido de INGESTA de cuentas (puerto 1 — lo usan los adapters
 * "manual" y "sheet"). Upsert idempotente por (fuente + id_externo) con dedup
 * por dominio (índices en memoria, patrón lib/cs/partner-sync). TX POR FILA:
 * una fila que falla se reporta en su resultado y no tumba el batch.
 *
 * Guardas del resolver de sesiones (post-mortem 2026-07-10):
 *  - nombres en skip-list NUNCA se auto-crean (error de fila);
 *  - dominios compartidos (gmail…) JAMÁS se registran en emailDomains;
 *  - este módulo NO llama resolveAllSessions — eso lo hace el caller UNA vez
 *    al final del batch (jamás por fila).
 */
import { prisma } from "@/lib/db/prisma";
import { effectiveDomainsForClient } from "@/lib/sessions/categorize";
import type { CuentaEntrante, IngestResultado } from "./ports";
import { clampInicioCicloCorriente, esDominioCompartido, nombreEnSkipList } from "./import-core";

const dayUTC = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

export async function ingestCuentasEntrantes(
  cuentas: CuentaEntrante[],
  ctx: { byEmail: string; todayISO: string },
): Promise<IngestResultado[]> {
  // Índices en memoria UNA vez (patrón partner-sync byCompanyId/byDomain); se
  // actualizan durante el batch para que dos filas de la misma empresa no dupliquen.
  const clients = await prisma.client.findMany({
    where: { isProspect: false },
    select: { id: true, name: true, company: true, emailDomains: true, source: true, sourceExternalId: true },
  });
  const byFuenteId = new Map<string, string>();
  const byDomain = new Map<string, string>();
  for (const c of clients) {
    if (c.source && c.sourceExternalId) byFuenteId.set(`${c.source}:${c.sourceExternalId}`, c.id);
    for (const d of effectiveDomainsForClient(c)) {
      if (!byDomain.has(d)) byDomain.set(d, c.id);
    }
  }

  const resultados: IngestResultado[] = [];
  for (const cta of cuentas) {
    try {
      resultados.push(await ingestUna(cta));
    } catch (e) {
      resultados.push({
        fuenteRef: cta.fuenteRef,
        clientId: "",
        cuentaId: "",
        clientCreado: false,
        cuentaCreada: false,
        servicioCreado: false,
        error: e instanceof Error ? e.message : "Fila falló al aplicarse.",
      });
    }
  }
  return resultados;

  async function ingestUna(cta: CuentaEntrante): Promise<IngestResultado> {
    const fuenteKey = `${cta.fuenteRef.fuente}:${cta.fuenteRef.idExterno}`;
    const dominioUsable = cta.dominio && !esDominioCompartido(cta.dominio) ? cta.dominio : null;

    // Match: fuente_id (re-import idempotente) → confirmación de la persona → dominio.
    const matchId =
      byFuenteId.get(fuenteKey) ??
      cta.dedupClientId ??
      (dominioUsable ? byDomain.get(dominioUsable) : undefined) ??
      null;

    return prisma.$transaction(async (tx) => {
      let clientId: string;
      let clientCreado = false;

      if (!matchId) {
        // Guarda dura del resolver: la cola de revisión ya filtró, pero acá no se confía.
        if (nombreEnSkipList(cta.clienteNombre)) {
          throw new Error(`"${cta.clienteNombre}" está en la lista de exclusión — no se crea automáticamente.`);
        }
        try {
          const client = await tx.client.create({
            data: {
              name: cta.clienteNombre,
              isProspect: false,
              emailDomains: dominioUsable ? [dominioUsable] : [], // jamás dominios compartidos
              source: cta.fuenteRef.fuente,
              sourceExternalId: cta.fuenteRef.idExterno,
            },
          });
          clientId = client.id;
          clientCreado = true;
        } catch (e: unknown) {
          // Carrera sobre @@unique([source, sourceExternalId]) → adoptar la fila ganadora.
          if ((e as { code?: string }).code === "P2002") {
            const ganadora = await tx.client.findUnique({
              where: {
                source_sourceExternalId: {
                  source: cta.fuenteRef.fuente,
                  sourceExternalId: cta.fuenteRef.idExterno,
                },
              },
              select: { id: true },
            });
            if (!ganadora) throw e;
            clientId = ganadora.id;
          } else {
            throw e;
          }
        }
      } else {
        clientId = matchId;
        // "Adopción" de procedencia: solo si el existente no tenía (jamás pisar).
        const existente = await tx.client.findUnique({
          where: { id: clientId },
          select: { source: true },
        });
        if (existente && existente.source === null) {
          await tx.client
            .update({
              where: { id: clientId },
              data: { source: cta.fuenteRef.fuente, sourceExternalId: cta.fuenteRef.idExterno },
            })
            .catch(() => {
              /* otra fila/cliente ya tiene ese fuenteRef (P2002) — la adopción es best-effort */
            });
        }
      }

      // Cuenta 1:1 — get-or-create; si existe, solo COMPLETA campos null (no pisa curaduría).
      let cuentaCreada = false;
      let cuenta = await tx.cuentaFinanciera.findUnique({ where: { clientId } });
      if (!cuenta) {
        cuenta = await tx.cuentaFinanciera.create({
          data: {
            clientId,
            tipo: cta.tipo ?? "NACIONAL",
            viaCobro: cta.viaCobro ?? "ODOO",
            moneda: cta.moneda ?? "CRC",
            terminosPago: cta.terminosPago ?? "ANTICIPADO",
            diaCobroAncla: cta.diaCobroAncla ?? null,
            correoCobro: cta.correoCobro ?? null,
            razonSocial: cta.razonSocial ?? null,
            cedulaJuridica: cta.cedulaJuridica ?? null,
            notas: cta.notas ?? null,
            fuente: cta.fuenteRef.fuente,
            fuenteIdExterno: cta.fuenteRef.idExterno,
          },
        });
        cuentaCreada = true;
      } else {
        const completar: Record<string, unknown> = {};
        if (cuenta.fuente === null) {
          completar.fuente = cta.fuenteRef.fuente;
          completar.fuenteIdExterno = cta.fuenteRef.idExterno;
        }
        if (cuenta.correoCobro === null && cta.correoCobro) completar.correoCobro = cta.correoCobro;
        if (cuenta.razonSocial === null && cta.razonSocial) completar.razonSocial = cta.razonSocial;
        if (cuenta.cedulaJuridica === null && cta.cedulaJuridica)
          completar.cedulaJuridica = cta.cedulaJuridica;
        if (cuenta.diaCobroAncla === null && cta.diaCobroAncla != null)
          completar.diaCobroAncla = cta.diaCobroAncla;
        if (Object.keys(completar).length > 0) {
          await tx.cuentaFinanciera
            .update({ where: { id: cuenta.id }, data: completar })
            .catch(() => {
              /* P2002 en (fuente, fuenteIdExterno) — otra cuenta ya lo tiene; best-effort */
            });
        }
      }

      // Suscripción pre-armada (si la fuente la trae y la cuenta no tiene una ACTIVA).
      let servicioCreado = false;
      let notaClamp = "";
      if (cta.suscripcion) {
        const yaExiste = await tx.servicioContratado.findFirst({
          where: { cuentaId: cuenta.id, tipoServicio: "SUSCRIPCION", estado: "ACTIVO" },
          select: { id: true },
        });
        if (!yaExiste) {
          let fechaInicio: Date | null = null;
          if (cta.suscripcion.fechaInicio) {
            const clamp = clampInicioCicloCorriente(cta.suscripcion.fechaInicio, ctx.todayISO);
            fechaInicio = dayUTC(clamp.fechaISO);
            if (clamp.clampeada) {
              notaClamp = ` Inicio original ${cta.suscripcion.fechaInicio} clampeado a ${clamp.fechaISO} (sin backfill de historia).`;
            }
          }
          const servicio = await tx.servicioContratado.create({
            data: {
              cuentaId: cuenta.id,
              tipoServicio: "SUSCRIPCION",
              modalidad: "RECURRENTE",
              montoTotal: cta.suscripcion.montoMensual,
              moneda: cta.suscripcion.moneda,
              fechaInicioFacturacion: fechaInicio,
              descripcion: `[import ${cta.fuenteRef.fuente}] Suscripción mensual${notaClamp}`,
            },
          });
          // Plan pre-armado (origen MANUAL: el enum no distingue import todavía — v1).
          await tx.planDePago.create({
            data: { servicioId: servicio.id, template: "SUSCRIPCION" },
          });
          servicioCreado = true;
        }
      }

      if (clientCreado || cuentaCreada || servicioCreado) {
        await tx.bitacoraCobro.create({
          data: {
            cuentaId: cuenta.id,
            tipo: "ACTUALIZACION_IA",
            contenido: `Cuenta ingresada por ${cta.fuenteRef.fuente} (${ctx.byEmail}): ${[
              clientCreado ? "empresa creada" : "empresa vinculada",
              cuentaCreada ? "cuenta creada" : "cuenta existente",
              servicioCreado ? "suscripción pre-armada" : null,
            ]
              .filter(Boolean)
              .join(", ")}.${notaClamp}`,
          },
        });
      }

      // Actualizar índices en memoria (misma corrida no duplica).
      byFuenteId.set(fuenteKey, clientId);
      if (dominioUsable && !byDomain.has(dominioUsable)) byDomain.set(dominioUsable, clientId);

      return {
        fuenteRef: cta.fuenteRef,
        clientId,
        cuentaId: cuenta.id,
        clientCreado,
        cuentaCreada,
        servicioCreado,
      };
    });
  }
}
