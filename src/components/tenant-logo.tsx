import Image from "next/image";
import { cn } from "@/components/ui/styles";

/**
 * Logo del tenant dentro de una caja cuadrada. Usa `fill` + `object-contain`
 * porque cada marca sube un logo con proporciones distintas.
 */
export function TenantLogo({
  src,
  alt,
  className,
  sizes,
  preload,
}: {
  src: string;
  alt: string;
  /** Tamaño de la caja, ej. "size-16" */
  className: string;
  /** Ancho renderizado para el optimizador, ej. "72px" */
  sizes: string;
  preload?: boolean;
}) {
  return (
    <span className={cn("relative block shrink-0", className)}>
      {/* El logo subido desde Configuración (/marca/logo) ya viene reducido: no pasa por el optimizador. */}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        preload={preload}
        unoptimized={src.startsWith("/marca/")}
        className="object-contain"
      />
    </span>
  );
}
