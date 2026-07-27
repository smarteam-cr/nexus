/**
 * Loading de /finanzas/costos/planillas — la forma la define el skeleton
 * compartido de las 3 hojas de categoría (components/finanzas/skeletons.tsx):
 * es la MISMA en las tres, así que vive una sola vez.
 */
import { CostosCategoriaSkeleton } from "@/components/finanzas/skeletons";

export default function PlanillasLoading() {
  return <CostosCategoriaSkeleton />;
}
