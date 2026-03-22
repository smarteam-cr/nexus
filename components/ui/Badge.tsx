import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// ── Variantes ──────────────────────────────────────────────────────────────────

const badge = cva(
  "inline-flex items-center gap-1.5 font-medium rounded-full",
  {
    variants: {
      variant: {
        default:
          "bg-gray-800 text-gray-400 border border-gray-700",
        primary:
          "bg-brand/10 text-brand-light border border-brand/20",
        success:
          "bg-green-500/10 text-green-400 border border-green-500/20",
        warning:
          "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        destructive:
          "bg-red-500/10 text-red-400 border border-red-500/20",
        info:
          "bg-blue-500/10 text-blue-400 border border-blue-500/20",
        purple:
          "bg-purple-500/10 text-purple-400 border border-purple-500/20",
        // Badge sólido — para IDs, versiones, etc.
        solid:
          "bg-brand text-white",
      },
      size: {
        xs: "text-2xs px-2 py-0.5",
        sm: "text-xs px-2.5 py-1",
        md: "text-xs px-3 py-1",
      },
      dot: {
        true: "",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
      dot: false,
    },
  }
);

// ── Colores del dot por variante ───────────────────────────────────────────────

const DOT_COLOR: Record<string, string> = {
  default:     "bg-gray-500",
  primary:     "bg-brand-light",
  success:     "bg-green-400",
  warning:     "bg-amber-400",
  destructive: "bg-red-400",
  info:        "bg-blue-400",
  purple:      "bg-purple-400",
  solid:       "bg-white/70",
};

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {
  dot?: boolean;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function Badge({
  className,
  variant = "default",
  size,
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const dotColor = DOT_COLOR[variant ?? "default"] ?? "bg-gray-500";

  return (
    <span className={cn(badge({ variant, size, dot }), className)} {...props}>
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dotColor)} />
      )}
      {children}
    </span>
  );
}
