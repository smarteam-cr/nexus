import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import CategoriesClient from "./CategoriesClient";

// Admin de categorías de dominios — cambia poco. ISR 5 min.
// Las mutaciones de SessionCategory deben llamar revalidatePath("/sessions/categories").
export const revalidate = 300;

export default async function SessionCategoriesPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const categories = await prisma.sessionCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  return (
    <AppShell>
      <CategoriesClient initialCategories={categories.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }))} />
    </AppShell>
  );
}
