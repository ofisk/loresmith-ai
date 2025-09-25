import { cn } from "@/lib/utils";
import type React from "react";

export type FormButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "destructive";
  loading?: boolean;
  icon?: React.ReactNode;
};

export const FormButton: React.FC<FormButtonProps> = ({
  children,
  className,
  variant = "primary",
  loading = false,
  icon,
  disabled,
  ...props
}) => {
  const baseClasses =
    "flex items-center gap-2 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const variantClasses = {
    primary:
      "text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300",
    secondary:
      "text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300",
    destructive:
      "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300",
  };

  return (
    <button
      type="button"
      className={cn(baseClasses, variantClasses[variant], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
};
