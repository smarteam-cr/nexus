import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Montserrat, Open_Sans, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "react-day-picker/style.css";
import { ToastProvider } from "@/components/ui/Toast";
import { UndoProvider } from "@/components/ui/UndoProvider";
import NotificationsInit from "@/components/notifications/NotificationsInit";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Design system del landing de Kickoff (Smarteam). Solo se usan dentro de
// `.kickoff-landing` vía sus CSS variables; no cambian la fuente del resto de la app.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Línea gráfica Smarteam (retema 2026-07): familia ÚNICA de las landings
// cliente-facing (BC/Kickoff/Desarrollo/website). Solo la consumen los scopes
// `.stl` y `.kickoff-landing` vía var(--font-jakarta) — la app interna no cambia.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexus",
  description: "Nexus — planifica y ejecuta tu implementación de HubSpot con IA",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fuente de verdad del tema: cookie `nexus-theme` leída en el server → la clase `light`
  // se renderiza ya en el HTML inicial (autoritativa, sin parpadeo). Default: claro.
  const theme = (await cookies()).get("nexus-theme")?.value === "dark" ? "dark" : "light";

  return (
    <html lang="es" className={theme === "light" ? "light" : ""} suppressHydrationWarning>
      <head>
        {/*
         * Migración/fallback de una sola pasada (corre ANTES del paint): si todavía no hay
         * cookie `nexus-theme` pero existe el legacy localStorage('theme'), lo respeta,
         * corrige la clase y escribe la cookie para que el próximo SSR sea autoritativo.
         * Cubre a los usuarios actuales (su tema vivía solo en localStorage) sin flash.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(!document.cookie.includes('nexus-theme=')){var t=localStorage.getItem('theme'),d=t==='dark';document.documentElement.classList.toggle('light',!d);document.cookie='nexus-theme='+(d?'dark':'light')+';path=/;max-age=31536000;SameSite=Lax';}}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} ${openSans.variable} ${jakarta.variable} antialiased`}
      >
        <ToastProvider>
          <UndoProvider>
            {children}
            <NotificationsInit />
          </UndoProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
