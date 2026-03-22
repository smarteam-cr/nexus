import { NextRequest } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { executeTask, type ApiTask } from "@/lib/hubspot/executor";

export async function POST(request: NextRequest) {
  try {
    await requireConsultantSession();
    const { implementationId } = await request.json() as { implementationId: string };

    const implementation = await prisma.implementation.findUnique({
      where: { id: implementationId },
    });

    if (!implementation) {
      return new Response("Not found", { status: 404 });
    }

    if (!implementation.plan) {
      return new Response("No plan found", { status: 400 });
    }

    const plan = implementation.plan as unknown as {
      apiTasks: ApiTask[];
      manualTasks: unknown[];
    };

    // Obtener la cuenta HubSpot del cliente
    const hubspotAccount = implementation.clientId
      ? await prisma.hubspotAccount.findUnique({ where: { clientId: implementation.clientId } })
      : implementation.accountId
        ? await prisma.hubspotAccount.findUnique({ where: { id: implementation.accountId } })
        : await prisma.hubspotAccount.findFirst();

    if (!hubspotAccount) {
      return new Response("No hay cuenta HubSpot conectada", { status: 400 });
    }
    const hubspotAccountId = hubspotAccount.id;

    // Update status to EXECUTING
    await prisma.implementation.update({
      where: { id: implementationId },
      data: { status: "EXECUTING" },
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: object) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        sendEvent({
          type: "start",
          total: plan.apiTasks.length,
          message: `Iniciando ejecución de ${plan.apiTasks.length} tareas...`,
        });

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < plan.apiTasks.length; i++) {
          const task = plan.apiTasks[i];

          sendEvent({
            type: "task_start",
            taskId: task.id,
            index: i + 1,
            total: plan.apiTasks.length,
            message: `Ejecutando: ${task.description}`,
          });

          const result = await executeTask(hubspotAccountId, task);

          // Log to database
          await prisma.executionLog.create({
            data: {
              implementationId,
              action: task.action,
              resource: task.resource,
              status: result.status,
              details: (result.status === "SUCCESS"
                ? { data: String(result.data) }
                : result.status === "FAILED"
                ? { error: result.error }
                : { instructions: result.instructions }) as Record<string, string>,
            },
          });

          if (result.status === "SUCCESS") {
            successCount++;
          } else if (result.status === "FAILED") {
            failCount++;
          }

          sendEvent({
            type: "task_complete",
            taskId: task.id,
            status: result.status,
            result,
          });
        }

        // Update status to DONE
        await prisma.implementation.update({
          where: { id: implementationId },
          data: { status: "DONE" },
        });

        sendEvent({
          type: "done",
          successCount,
          failCount,
          manualTaskCount: plan.manualTasks.length,
          message: `Ejecución completada. ${successCount} exitosas, ${failCount} fallidas, ${plan.manualTasks.length} tareas manuales pendientes.`,
        });

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") {
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response(message, { status: 500 });
  }
}
