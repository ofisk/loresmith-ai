import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function for merging CSS classes with Tailwind CSS
 *
 * This function combines clsx and tailwind-merge to provide
 * intelligent class merging that handles Tailwind CSS conflicts.
 *
 * @param inputs - CSS class names to merge
 * @returns Merged CSS class string
 *
 * @example
 * ```typescript
 * const className = cn(
 *   "text-red-500",
 *   isActive && "bg-blue-500",
 *   "p-4"
 * );
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
