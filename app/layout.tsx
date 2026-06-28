import type { Metadata } from "next";
import { Geist, Geist_Mono, Montserrat, Open_Sans } from "next/font/google";
import "./globals.css";
import "react-day-picker/style.css";
import { ToastProvider } from "@/components/ui/Toast";
import { UndoProvider } from "@/components/ui/UndoProvider";

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

export const metadata: Metadata = {
  title: "Nexus",
  description: "Nexus — planifica y ejecuta tu implementación de HubSpot con IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Previene flash de tema: aplica clase "light" antes de que React hidrate */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')!=='dark')document.documentElement.classList.add('light');}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} ${openSans.variable} antialiased bg-gray-950 text-gray-100`}
      >
        <ToastProvider>
          <UndoProvider>{children}</UndoProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
