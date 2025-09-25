import { cn } from "../../lib/utils";

type CardProps = {
  as?: React.ElementType;
  children?: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLElement>;
  tabIndex?: number;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  style?: React.CSSProperties;
};

export const Card = ({
  as,
  children,
  className,
  ref,
  tabIndex,
  variant = "secondary",
  style,
}: CardProps) => {
  const Component = as ?? "div";
  return (
    <Component
      className={cn(
        "w-full rounded-lg p-4",
        {
          "btn-primary": variant === "primary",
          "btn-secondary": variant === "secondary",
        },
        className
      )}
      ref={ref}
      tabIndex={tabIndex}
      style={style}
    >
      {children}
    </Component>
  );
};
