import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import ClientsGrid from "./ClientsGrid";
import ICPSection from "./ICPSection";

export default async function ClientsPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      hubspotAccount: {
        select: { id: true, hubName: true, hubspotPortalId: true },
      },
      _count: {
        select: { audits: true, implementations: true, documents: true },
      },
    },
  });

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Clientes</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {clients.length === 0
                ? "Sin clientes aún"
                : `${clients.length} cliente${clients.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        <ClientsGrid clients={clients} />
        <ICPSection />
      </div>
    </AppShell>
  );
}
