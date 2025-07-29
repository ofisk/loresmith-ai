// Base hooks
export { useBaseAsync, useBaseAsyncVoid } from "./useBaseAsync";
export { useAuthenticatedRequest } from "./useAuthenticatedRequest";
export { useToast } from "./useToast";

// Form submission hooks
export {
  useFormSubmission,
  useFormSubmissionWithData,
} from "./useFormSubmission";

// Data hooks
export { useCampaigns } from "./useCampaigns";
export { useOpenAIKey } from "./useOpenAIKey";
export { useProcessingProgress } from "./useProcessingProgress";

// UI and interaction hooks
export { default as useClickOutside } from "./useClickOutside";
export { useMenuNavigation } from "./useMenuNavigation";
export { default as useTheme } from "./useTheme";

// Authentication hooks
export { useJwtExpiration } from "./useJwtExpiration";

// Legacy exports (for backward compatibility)
export { useAsyncOperation, useAsyncVoidOperation } from "./useAsyncOperation";
