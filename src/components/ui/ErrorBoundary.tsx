import React, { Component, type ReactNode } from "react";
import { StatusMessage } from "./StatusMessage";

/**
 * Props for the ErrorBoundary component
 */
export interface ErrorBoundaryProps {
  /** The content to render when there's no error */
  children: ReactNode;
  /** Custom fallback component to render when an error occurs */
  fallback?:
    | ReactNode
    | ((error: Error, errorInfo: React.ErrorInfo) => ReactNode);
  /** Whether to show error details in development */
  showErrorDetails?: boolean;
  /** Custom error message to display */
  errorMessage?: string;
  /** Function to call when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** CSS class name */
  className?: string;
}

/**
 * State for the ErrorBoundary component
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * A reusable error boundary component that catches React errors and displays a fallback UI.
 *
 * This component provides graceful error handling for React components and prevents
 * the entire application from crashing when an error occurs in a component tree.
 *
 * @example
 * ```typescript
 * <ErrorBoundary
 *   fallback={<div>Something went wrong</div>}
 *   onError={(error) => console.error('Component error:', error)}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * @example
 * ```typescript
 * <ErrorBoundary
 *   fallback={(error, errorInfo) => (
 *     <div>
 *       <h2>Something went wrong</h2>
 *       <p>{error.message}</p>
 *       <details>
 *         <summary>Error details</summary>
 *         <pre>{errorInfo.componentStack}</pre>
 *       </details>
 *     </div>
 *   )}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback component
      if (this.props.fallback) {
        if (typeof this.props.fallback === "function") {
          return this.props.fallback(this.state.error!, this.state.errorInfo!);
        }
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className={`p-6 ${this.props.className || ""}`}>
          <StatusMessage type="error" showIcon>
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-2">
                  {this.props.errorMessage || "Something went wrong"}
                </h2>
                <p className="text-sm">
                  An unexpected error occurred. Please try refreshing the page
                  or contact support if the problem persists.
                </p>
              </div>

              {this.props.showErrorDetails && this.state.error && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Error Details
                  </summary>
                  <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono overflow-auto">
                    <div className="mb-2">
                      <strong>Error:</strong> {this.state.error.message}
                    </div>
                    {this.state.errorInfo && (
                      <div>
                        <strong>Component Stack:</strong>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Refresh Page
                </button>
                <button
                  type="button"
                  onClick={() =>
                    this.setState({
                      hasError: false,
                      error: null,
                      errorInfo: null,
                    })
                  }
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          </StatusMessage>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook to create an error boundary with a custom fallback
 *
 * @example
 * ```typescript
 * const MyComponent = () => {
 *   const ErrorBoundaryWithFallback = useErrorBoundary({
 *     fallback: <div>Custom error UI</div>,
 *     onError: (error) => console.error(error)
 *   });
 *
 *   return (
 *     <ErrorBoundaryWithFallback>
 *       <ComponentThatMightError />
 *     </ErrorBoundaryWithFallback>
 *   );
 * };
 * ```
 */
export function useErrorBoundary(config: Omit<ErrorBoundaryProps, "children">) {
  return ({ children }: { children: ReactNode }) => (
    <ErrorBoundary {...config}>{children}</ErrorBoundary>
  );
}
