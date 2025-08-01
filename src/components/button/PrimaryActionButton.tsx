import { Button, type ButtonProps } from "./Button";
import { cn } from "@/lib/utils";

interface PrimaryActionButtonProps
  extends Omit<ButtonProps, "variant" | "size"> {
  children: React.ReactNode;
  className?: string;
}

export function PrimaryActionButton({
  children,
  className,
  ...props
}: PrimaryActionButtonProps) {
  return (
    <Button
      variant="primary"
      size="sm"
      className={cn(
        "w-40 h-10 text-center justify-center text-base font-medium",
        "bg-[#F48120] hover:bg-[#F48120]/90 text-white border-[#F48120]",
        "shadow-lg hover:shadow-xl transition-all duration-200",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
