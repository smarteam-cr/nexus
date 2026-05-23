import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { readAccountState } from "@/lib/hubspot/reader";
import { streamPlanningChat, extractPlanFromMessage } from "@/lib/ai/planning-agent";

export const POST = withAuth(async (request) => {
  try {
    const { implementationId, message } = await request.json() as {
      implementationId: string;
      message: string;
    };

    const implementation = await prisma.implementation.findUnique({
      where: { id: implementationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!implementation) {
      return new Response("Not found", { status: 404 });
    }

    // Save user message
    await prisma.message.create({
      data: {
        implementationId,
        role: "user",
        content: message,
      },
    });

    // Obtener la cuenta HubSpot del cliente (via implementation.clientId) o la primera disponible
    const hubspotAccount = implementation.clientId
      ? await prisma.hubspotAccount.findUnique({ where: { clientId: implementation.clientId } })
      : implementation.accountId
        ? await prisma.hubspotAccount.findUnique({ where: { id: implementation.accountId } })
        : await prisma.hubspotAccount.findFirst();

    if (!hubspotAccount) {
      return new Response("No hay cuenta HubSpot conectada", { status: 400 });
    }

    // Get account state for context
    const accountState = await readAccountState(hubspotAccount.id);

    // Build messages history
    const chatHistory = implementation.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    chatHistory.push({ role: "user", content: message });

    // Stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";

        try {
          await streamPlanningChat(
            chatHistory,
            accountState,
            (chunk) => {
              fullText += chunk;
              controller.enqueue(encoder.encode(chunk));
            },
            async (complete) => {
              // Save assistant message
              await prisma.message.create({
                data: {
                  implementationId,
                  role: "assistant",
                  content: complete,
                },
              });

              // Check if message contains a plan
              const plan = extractPlanFromMessage(complete);
              if (plan) {
                await prisma.implementation.update({
                  where: { id: implementationId },
                  data: { plan, status: "READY" },
                });
              }

              controller.close();
            }
          );
        } catch (err) {
          const status = (err as { status?: number })?.status;
          const isRateLimit = status === 429;
          const errMsg = isRateLimit
            ? "\n\n⚠️ El servicio está temporalmente saturado. Espera unos segundos e intenta de nuevo."
            : "\n\n⚠️ Error al procesar tu mensaje. Por favor intenta de nuevo.";

          // Si ya hay texto parcial, salvar lo que llegó
          if (fullText.trim()) {
            await prisma.message.create({
              data: {
                implementationId,
                role: "assistant",
                content: fullText + errMsg,
              },
            }).catch(() => {});
          }

          controller.enqueue(encoder.encode(errMsg));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") {
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response(message, { status: 500 });
  }
});
