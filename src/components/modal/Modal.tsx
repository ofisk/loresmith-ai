import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/card/Card";
import useClickOutside from "@/hooks/useClickOutside";
import { cn } from "../../lib/utils";

type ModalProps = {
  className?: string;
  children: React.ReactNode;
  clickOutsideToClose?: boolean;
  isOpen: boolean;
  onClose: () => void;
  cardStyle?: React.CSSProperties;
  showCloseButton?: boolean;
  allowEscape?: boolean;
  animatedBackground?: boolean; // New prop for animated background
};

// Generate random particles
const generateRandomParticles = (
  count: number,
  sizeRange: [number, number],
  opacityRange: [number, number]
) => {
  return Array.from({ length: count }, (_, i) => {
    const size = Math.random() * (sizeRange[1] - sizeRange[0]) + sizeRange[0];
    const opacity =
      Math.random() * (opacityRange[1] - opacityRange[0]) + opacityRange[0];
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    const animationDelay = Math.random() * 5; // Random delay up to 5 seconds

    return {
      id: i,
      size: Math.round(size),
      opacity: Math.round(opacity * 100) / 100,
      top: Math.round(top * 100) / 100,
      left: Math.round(left * 100) / 100,
      animationDelay,
    };
  });
};

export const Modal = ({
  className,
  children,
  clickOutsideToClose = false,
  isOpen,
  onClose,
  cardStyle,
  showCloseButton = true,
  allowEscape = true,
  animatedBackground = false,
}: ModalProps) => {
  const clickOutsideRef = useClickOutside(onClose);
  const defaultRef = useRef<HTMLDivElement>(null);
  const modalRef = clickOutsideToClose ? clickOutsideRef : defaultRef;

  // Generate random particles when modal opens
  const [particles, setParticles] = useState(() => ({
    large: generateRandomParticles(8, [8, 16], [0.25, 0.4]),
    medium: generateRandomParticles(20, [5, 7], [0.4, 0.6]),
    small: generateRandomParticles(40, [2, 3], [0.5, 0.9]),
  }));

  // Regenerate particles when modal opens
  useEffect(() => {
    if (isOpen && animatedBackground) {
      setParticles({
        large: generateRandomParticles(8, [8, 16], [0.25, 0.4]),
        medium: generateRandomParticles(20, [5, 7], [0.4, 0.6]),
        small: generateRandomParticles(40, [2, 3], [0.5, 0.9]),
      });
    }
  }, [isOpen, animatedBackground]);

  // Stop site overflow when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Tab focus
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modalElement = modalRef.current;
    const focusableElements = modalElement.querySelectorAll(
      'a, button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Only focus the first element when modal initially opens
    // Don't refocus if user is already interacting with an input
    const activeElement = document.activeElement as HTMLElement;
    const isInputActive =
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable);

    if (firstElement && !isInputActive) {
      firstElement.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        if (e.shiftKey) {
          // Shift + Tab moves focus backward
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab moves focus forward
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
      if (e.key === "Escape" && allowEscape) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, allowEscape]);

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 left-0 z-50 flex h-screen w-full items-center justify-center bg-transparent p-6 overflow-y-auto">
      {/* Modal overlay - clickable background */}
      {animatedBackground ? (
        <div
          className="absolute inset-0 overflow-hidden"
          onClick={onClose}
          aria-hidden="true"
        >
          {/* Base dark background */}
          <div className="absolute inset-0 bg-black" />

          {/* Animated gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-purple-800/20 animate-pulse" />

          {/* Floating particles */}
          <div className="absolute inset-0">
            {/* Large floating orbs - randomly positioned */}
            {particles.large.map((particle) => (
              <div
                key={`large-${particle.id}`}
                className="absolute rounded-full bg-purple-500/30 blur-lg animate-float-slow"
                style={{
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  top: `${particle.top}%`,
                  left: `${particle.left}%`,
                  opacity: particle.opacity,
                  animationDelay: `${particle.animationDelay}s`,
                }}
              />
            ))}

            {/* Medium particles - randomly positioned */}
            {particles.medium.map((particle) => (
              <div
                key={`medium-${particle.id}`}
                className="absolute rounded-full bg-purple-400/60 blur-sm animate-float-medium"
                style={{
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  top: `${particle.top}%`,
                  left: `${particle.left}%`,
                  opacity: particle.opacity,
                  animationDelay: `${particle.animationDelay}s`,
                }}
              />
            ))}

            {/* Small sparkles - randomly positioned */}
            {particles.small.map((particle) => (
              <div
                key={`small-${particle.id}`}
                className="absolute rounded-full bg-purple-300/70 animate-twinkle"
                style={{
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  top: `${particle.top}%`,
                  left: `${particle.left}%`,
                  opacity: particle.opacity,
                  animationDelay: `${particle.animationDelay}s`,
                }}
              />
            ))}
          </div>

          {/* Subtle wave pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-purple-500/20 to-transparent animate-wave" />
          </div>
        </div>
      ) : (
        <div
          className="absolute inset-0 bg-black/70"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Modal content container */}
      <div
        className="relative z-10 bg-white dark:bg-neutral-900 rounded-lg shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        tabIndex={-1}
      >
        <Card
          className={cn("reveal reveal-sm relative z-50", className)}
          style={cardStyle}
          ref={modalRef}
          tabIndex={-1}
        >
          {children}

          {showCloseButton && (
            <button
              type="button"
              aria-label="Close Modal"
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          )}
        </Card>
      </div>
    </div>
  );
};
