/**
 * Loading skeleton de la sección Marketing — UNO a nivel de sección.
 *
 * FORMA REAL: el PageHeader y las tabs del grupo activo viven en marketing/layout.tsx y
 * PERSISTEN durante la navegación; esto solo llena el slot `{children}`. Las tabs
 * (MarketingSectionTabs) ya traen su propio `mb-6`, y TODOS los clientes de las sub-vistas
 * abren con un root `space-y-*` SIN margen superior — por eso acá no va ningún `mt-*`
 * (el `mt-4` anterior metía 16px que la pantalla real no tiene: el contenido saltaba
 * hacia arriba al resolver).
 *
 * Un solo loading cubre ~10 sub-rutas (contenido, generación, temas, fuentes, voz, personas,
 * ICP, ideas de campaña…), así que se pinta el DENOMINADOR COMÚN: la lista. Todas esas
 * vistas usan `ListSkeleton lines={2}` en su PROPIO estado de carga (contenido y temas 6
 * filas, fuentes 5, ideas de campaña 4, generación 3) → 5 filas es la mediana y minimiza el
 * salto contra cualquiera de ellas al montar el cliente. Deliberadamente NO se reserva la
 * barra del motor de /contenido: existe en 2 de las 10 sub-vistas, y prometerla sería
 * anunciar una pantalla que en la mayoría de los casos no llega.
 */
import { ListSkeleton } from "@/components/ui";

export default function MarketingLoading() {
  return <ListSkeleton rows={5} lines={2} />;
}
