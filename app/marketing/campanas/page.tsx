import { redirect } from "next/navigation";

// "Campañas" se renombró a "Ideas de campaña". Redirect para no romper bookmarks.
export default function MarketingCampanasRedirect() {
  redirect("/marketing/ideas-de-campana");
}
