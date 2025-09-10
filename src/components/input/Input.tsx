import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  children?: React.ReactNode;
  className?: string;
  displayContent?: "items-first" | "items-last"; // used for children of component
  isValid?: boolean;
  onValueChange?: (value: string, isValid: boolean) => void;
  preText?: string[] | React.ReactNode[] | React.ReactNode;
  postText?: string[] | React.ReactNode[] | React.ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, isValid, onValueChange, onChange, value, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        value={value}
        onChange={(e) => {
          onValueChange?.(e.target.value, true);
          onChange?.(e);
        }}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
