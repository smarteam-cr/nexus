import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import CategoriesClient from "./CategoriesClient";

// Página DINÁMICA (cada page llama a un `require…User` y el layout lee la cookie del tema): un
// `export const revalidate` acá nunca cacheó nada — se retiró en C-15 (2026-09-04).

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
    <CategoriesClient initialCategories={categories.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))} />
  );
}
