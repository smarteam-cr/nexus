import { cn } from "@/lib/cn";

// ── Card root ──────────────────────────────────────────────────────────────────

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** "default" = borde gris estándar | "accent" = borde brand | "flat" = sin borde */
  variant?: "default" | "accent" | "flat";
}

export function Card({ className, variant = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-gray-900 overflow-hidden",
        variant === "default" && "border border-gray-800",
        variant === "accent"  && "border border-brand/20",
        variant === "flat"    && "",
        className
      )}
      {...props}
    />
  );
}

// ── Card.Header ────────────────────────────────────────────────────────────────

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  divided?: boolean;
}

function CardHeader({ className, divided = true, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-5 py-4",
        divided && "border-b border-gray-800",
        className
      )}
      {...props}
    />
  );
}

// ── Card.Body ──────────────────────────────────────────────────────────────────

function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 py-4", className)} {...props} />
  );
}

// ── Card.Footer ────────────────────────────────────────────────────────────────

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-5 py-3.5 border-t border-gray-800",
        className
      )}
      {...props}
    />
  );
}

// ── Card.Icon ──────────────────────────────────────────────────────────────────

interface CardIconProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: "brand" | "purple" | "green" | "blue" | "gray";
}

function CardIcon({ className, color = "brand", children, ...props }: CardIconProps) {
  const colors = {
    brand:  "bg-brand/10 border-brand/20 text-brand-light",
    purple: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    green:  "bg-green-500/10  border-green-500/20  text-green-400",
    blue:   "bg-blue-500/10   border-blue-500/20   text-blue-400",
    gray:   "bg-gray-800      border-gray-700      text-gray-400",
  };

  return (
    <div
      className={cn(
        "w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0",
        colors[color],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Namespace export ───────────────────────────────────────────────────────────

Card.Header = CardHeader;
Card.Body   = CardBody;
Card.Footer = CardFooter;
Card.Icon   = CardIcon;
