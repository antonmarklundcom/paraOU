import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Política de privacidad de ParaOU.",
  alternates: { canonical: "/privacidad" },
};

/**
 * Agent-drafted per PLAN.md Phase 0 decision #4 — owner/lawyer review required
 * before this is relied on as a binding privacy notice. Update LAST_UPDATED
 * when reviewed/changed.
 */
const LAST_UPDATED = "17 de julio de 2026";

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1>Política de privacidad</h1>
      <p className="text-sm text-muted-foreground">Última actualización: {LAST_UPDATED}</p>

      <h2>1. Qué datos recolectamos</h2>
      <ul>
        <li>
          <strong>Cuenta:</strong> tu correo electrónico (para el enlace de acceso y las alertas),
          y opcionalmente tu nombre/foto si ingresás con Google.
        </li>
        <li>
          <strong>Perfil de empresa:</strong> la descripción de tu empresa, rubros, departamentos
          de interés y demás datos que cargás voluntariamente en{" "}
          <code>/perfil</code> para recibir coincidencias relevantes.
        </li>
        <li>
          <strong>Uso del producto:</strong> búsquedas guardadas, licitaciones seguidas o
          marcadas, preferencias de idioma y de alertas.
        </li>
        <li>
          <strong>Facturación:</strong> si te suscribís a un plan pago, Stripe procesa los datos de
          pago directamente — nunca almacenamos números de tarjeta en nuestros servidores.
        </li>
        <li>
          <strong>Datos técnicos básicos</strong> (dirección IP, tipo de navegador) con fines de
          seguridad y, si está habilitada, analítica de uso agregada y anónima.
        </li>
      </ul>

      <h2>2. Para qué usamos tus datos</h2>
      <p>
        Para operar el servicio: mostrar tu panel, calcular coincidencias entre tu perfil de
        empresa y las licitaciones públicas (usando modelos de IA), enviarte alertas por correo
        según tu frecuencia elegida, procesar pagos y darte soporte. No vendemos tus datos
        personales a terceros.
      </p>

      <h2>3. Con quién compartimos datos</h2>
      <p>
        Usamos proveedores de infraestructura para operar el servicio, que procesan datos en
        nuestro nombre bajo sus propias políticas de privacidad:
      </p>
      <ul>
        <li>
          <strong>Google Gemini</strong> — recibe el texto de tu perfil de empresa y el de las
          licitaciones públicas para calcular coincidencias y resúmenes. No recibe tu correo ni
          datos de pago.
        </li>
        <li>
          <strong>Stripe</strong> — procesa pagos de suscripción.
        </li>
        <li>
          <strong>Resend</strong> — envía los correos de acceso y las alertas.
        </li>
        <li>Nuestro proveedor de hosting (VPS), donde corre la base de datos y la aplicación.</li>
      </ul>
      <p>No compartimos tus datos con fines publicitarios ni de venta a terceros.</p>

      <h2>4. Cuánto tiempo conservamos los datos</h2>
      <p>
        Mientras tu cuenta esté activa. Podés eliminar tu cuenta en cualquier momento desde{" "}
        <code>/cuenta</code>, lo que borra tu perfil de empresa, coincidencias, búsquedas
        guardadas y alertas asociadas. Las licitaciones públicas en sí no son datos personales
        tuyos y permanecen en la plataforma como registro público.
      </p>

      <h2>5. Tus derechos</h2>
      <p>
        Podés acceder, corregir o eliminar tus datos personales desde <code>/cuenta</code>, o
        escribiéndonos a <a href="mailto:hola@paraou.com">hola@paraou.com</a>.
      </p>

      <h2>6. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta política ocasionalmente. Los cambios relevantes se reflejarán en
        la fecha de &ldquo;Última actualización&rdquo; de esta página.
      </p>

      <h2>7. Contacto</h2>
      <p>
        Consultas sobre privacidad: <a href="mailto:hola@paraou.com">hola@paraou.com</a>.
      </p>
    </main>
  );
}
