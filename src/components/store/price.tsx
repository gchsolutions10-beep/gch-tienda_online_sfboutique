import { formatUsd, formatVes, usdToVesCents } from "@/lib/money";
import { cn } from "@/components/ui/styles";

/**
 * Precio dual: el principal en USD y debajo el equivalente en bolívares a la
 * tasa vigente (BCV por defecto). Si hay precio "antes", sale tachado.
 */
export function Price({
  cents,
  compareAtCents,
  rate,
  size = "md",
  className,
}: {
  cents: number;
  compareAtCents?: number | null;
  /** Bs por USD; null = no mostrar Bs */
  rate: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("leading-tight", className)}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn("font-display font-semibold text-store-ink", size === "lg" ? "text-3xl" : size === "md" ? "text-lg" : "text-base")}>
          {formatUsd(cents)}
        </span>
        {compareAtCents ? (
          <s className={cn("text-store-muted", size === "lg" ? "text-base" : "text-xs")} aria-label={`Antes ${formatUsd(compareAtCents)}`}>
            {formatUsd(compareAtCents)}
          </s>
        ) : null}
      </p>
      {rate ? (
        <p className={cn("text-store-muted", size === "lg" ? "text-sm" : "text-xs")}>
          {formatVes(usdToVesCents(cents, rate))}
        </p>
      ) : null}
    </div>
  );
}
