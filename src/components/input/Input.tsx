import { forwardRef } from "react";

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
        className={className}
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
