import { redirect } from "next/navigation";

// Ruta renombrada a /customer-success (CS360). El redirect se queda: las push
// notifications viejas guardan "/exito-cliente" en su payload y deben seguir abriendo.
export default function ExitoClienteRedirect() {
  redirect("/customer-success");
}
