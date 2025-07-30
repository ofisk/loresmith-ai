import { createContext, type ReactNode, useContext, useState } from "react";
import { Modal } from "@/components/modal/Modal";

/**
 * Context type for modal state management
 */
type ModalContextType = {
  isOpen: boolean;
  content: ReactNode;
  openModal: (content: ReactNode) => void;
  closeModal: () => void;
};

const ModalContext = createContext<ModalContextType | undefined>(undefined);

/**
 * Modal provider component that manages modal state and provides modal functionality
 *
 * @param children - React children to wrap with modal context
 */
export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode>(null);

  const openModal = (content: ReactNode) => {
    setContent(content);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setContent(null);
  };

  return (
    <ModalContext.Provider value={{ isOpen, content, openModal, closeModal }}>
      {children}
      {isOpen && (
        <Modal isOpen={isOpen} onClose={closeModal}>
          {content}
        </Modal>
      )}
    </ModalContext.Provider>
  );
};

/**
 * Hook to access modal context
 *
 * @returns Modal context with isOpen, content, openModal, and closeModal
 * @throws Error if used outside of ModalProvider
 */
export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
};
