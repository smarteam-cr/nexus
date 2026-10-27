/**
 * components/external/test/PixelesDelTest.tsx — carga los píxeles de anuncios en la página del test (O6 etapa 2,
 * 2026-10-26). Server component: los ids salen de lib/tests-diagnostico/pixeles.ts (cada uno con su variable; vacía =
 * no se carga) y van validados por su forma. Los mismos que la página vieja, con el mismo código de cada proveedor.
 *
 * ⛔ Solo en la página del test y en la de elegir el área: nunca en el resultado (su dirección lleva el token).
 */
import Script from "next/script";
import type { PixelesDelTest as Pixeles } from "@/lib/tests-diagnostico/pixeles";

export default function PixelesDelTest({ pixeles }: { pixeles: Pixeles }) {
  const { googleAds, meta, hubspot } = pixeles;
  return (
    <>
      {googleAds && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${googleAds}`} strategy="afterInteractive" />
          <Script id="test-google-ads" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${googleAds}');`}
          </Script>
        </>
      )}
      {meta && (
        <Script id="test-meta" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${meta}');fbq('track','PageView');`}
        </Script>
      )}
      {hubspot && (
        <>
          {/* Sin el chat: en el teléfono su burbuja tapa el botón de empezar (lo mismo que la página vieja). */}
          <Script id="test-hubspot-ajustes" strategy="afterInteractive">{`window.hsConversationsSettings={loadImmediately:false};`}</Script>
          <Script id="hs-script-loader" src={`https://js.hs-scripts.com/${hubspot}.js`} strategy="afterInteractive" />
        </>
      )}
    </>
  );
}
