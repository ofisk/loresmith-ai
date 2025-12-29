/**
 * Standard modal size configurations for consistent UI across the application
 */

export const STANDARD_MODAL_SIZE = {
  width: 600,
  height: 600,
  maxWidth: "90vw",
  maxHeight: "90vh",
} as const;

export const STANDARD_MODAL_SIZE_OBJECT = {
  width: STANDARD_MODAL_SIZE.width,
  height: STANDARD_MODAL_SIZE.height,
};
