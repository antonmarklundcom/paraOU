import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Política de privacidad de ParaOU.",
  alternates: { canonical: "/privacidad" },
};

/**
 * Draft legal copy (PLAN.md Phase L1 #3) — needs an owner/lawyer review before
 * go-live; not a substitute for professional legal advice.
 */
export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Política de privacidad</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Última actualización: 16 de julio de 2026. Este texto es un borrador — pendiente de
        revisión legal antes de su publicación definitiva.
      </p>

      <section className="mt-8 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">1. Qué datos recolectamos</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Correo electrónico, para crear tu cuenta e iniciar sesión (enlace mágico o Google).</li>
            <li>
              Datos de perfil de empresa que cargás voluntariamente (rubro, ubicación, tamaño,
              etc.) para calcular coincidencias con licitaciones.
            </li>
            <li>Búsquedas guardadas, licitaciones seguidas y preferencias de alertas.</li>
            <li>
              Datos de facturación (procesados por Stripe; ParaOU no almacena números de tarjeta).
            </li>
            <li>Registros técnicos básicos (IP, user agent) para seguridad y límites de uso.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold">2. Para qué usamos tus datos</h2>
          <p className="mt-1 text-muted-foreground">
            Para operar el servicio: calcular coincidencias de licitaciones (incluyendo el uso de
            modelos de inteligencia artificial de terceros, actualmente Google Gemini, para
            puntuar y resumir licitaciones frente a tu perfil), enviar alertas por correo
            electrónico según tu frecuencia elegida, procesar pagos y responder consultas de
            soporte. No vendemos tus datos personales a terceros.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">3. Con quién compartimos datos</h2>
          <p className="mt-1 text-muted-foreground">
            Con proveedores que operan el servicio en nuestro nombre: hosting (VPS propio),
            Google Gemini (procesamiento de coincidencias y resúmenes con IA), Stripe (pagos),
            Resend (envío de correos). Cada uno procesa únicamente los datos necesarios para su
            función y bajo sus propios términos de privacidad.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">4. Cuánto tiempo conservamos tus datos</h2>
          <p className="mt-1 text-muted-foreground">
            Mientras tu cuenta esté activa. Si eliminás tu cuenta desde /cuenta, tu perfil de
            empresa, coincidencias, búsquedas guardadas, licitaciones seguidas y registros de
            alertas se eliminan en cascada. Los datos de licitaciones en sí son públicos y no te
            pertenecen a vos como usuario, por lo que no se eliminan.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">5. Tus derechos</h2>
          <p className="mt-1 text-muted-foreground">
            Podés acceder, corregir o eliminar tus datos personales en cualquier momento desde
            /cuenta, o escribiéndonos. No usamos cookies de seguimiento publicitario; la
            analítica del sitio, si está activa, es sin cookies (Plausible/Umami).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">6. Contacto</h2>
          <p className="mt-1 text-muted-foreground">
            Consultas sobre privacidad o para ejercer tus derechos:{" "}
            <a href="mailto:hola@paraou.com" className="text-primary underline">
              hola@paraou.com
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
