import type { ReactNode } from "react";

/**
 * Common API response structure
 */
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
  error?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Common loading states
 */
export interface LoadingState {
  loading: boolean;
  error: string | null;
  data: any | null;
}

/**
 * Async operation result
 */
export interface AsyncResult<T = any> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: () => Promise<T>;
  retry: () => Promise<T>;
  reset: () => void;
}

/**
 * Form field configuration
 */
export interface FormField {
  name: string;
  label: string;
  type:
    | "text"
    | "email"
    | "password"
    | "number"
    | "textarea"
    | "select"
    | "checkbox"
    | "radio";
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  validation?: (value: any) => string | null;
  disabled?: boolean;
}

/**
 * Form submission result
 */
export interface FormSubmissionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Modal configuration
 */
export interface ModalConfig {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnOverlayClick?: boolean;
  showCloseButton?: boolean;
}

/**
 * List item with common properties
 */
export interface ListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  status?: string;
  type?: string;
}

/**
 * Resource item with metadata
 */
export interface ResourceItem extends ListItem {
  type: "pdf" | "character" | "note" | "image" | "campaign";
  size?: number;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * File upload configuration
 */
export interface FileUploadConfig {
  accept: string[];
  maxSize: number; // in bytes
  multiple?: boolean;
  onUpload: (files: File[]) => Promise<void>;
  onError?: (error: string) => void;
}

/**
 * Action button configuration
 */
export interface ActionButton {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

/**
 * Table column configuration
 */
export interface TableColumn<T = any> {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: "left" | "center" | "right";
}

/**
 * Table configuration
 */
export interface TableConfig<T = any> {
  columns: TableColumn<T>[];
  data: T[];
  loading?: boolean;
  error?: string;
  onSort?: (key: string, direction: "asc" | "desc") => void;
  onRowClick?: (item: T) => void;
  selectable?: boolean;
  onSelectionChange?: (selectedItems: T[]) => void;
}

/**
 * Filter configuration
 */
export interface FilterConfig {
  key: string;
  label: string;
  type: "text" | "select" | "date" | "checkbox" | "radio";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  defaultValue?: any;
}

/**
 * Search configuration
 */
export interface SearchConfig {
  placeholder?: string;
  onSearch: (query: string) => void;
  debounceMs?: number;
  filters?: FilterConfig[];
}

/**
 * Navigation item
 */
export interface NavigationItem {
  label: string;
  href?: string;
  icon?: ReactNode;
  children?: NavigationItem[];
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * Breadcrumb item
 */
export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

/**
 * Tab configuration
 */
export interface TabConfig {
  key: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
}

/**
 * Accordion item
 */
export interface AccordionItem {
  key: string;
  title: string;
  content: ReactNode;
  disabled?: boolean;
  defaultOpen?: boolean;
}

/**
 * Context menu item
 */
export interface ContextMenuItem {
  key: string;
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  divider?: boolean;
  children?: ContextMenuItem[];
}

/**
 * Tooltip configuration
 */
export interface TooltipConfig {
  content: string | ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
  disabled?: boolean;
}

/**
 * Popover configuration
 */
export interface PopoverConfig {
  trigger: ReactNode;
  content: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  disabled?: boolean;
}

/**
 * Dialog configuration
 */
export interface DialogConfig {
  title: string;
  content: ReactNode;
  actions?: ActionButton[];
  onClose?: () => void;
  size?: "sm" | "md" | "lg" | "xl";
}

/**
 * Confirmation dialog configuration
 */
export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: "danger" | "warning" | "info";
}

/**
 * Progress configuration
 */
export interface ProgressConfig {
  value: number;
  max: number;
  label?: string;
  showPercentage?: boolean;
  variant?: "default" | "success" | "warning" | "error";
  size?: "sm" | "md" | "lg";
}

/**
 * Status badge configuration
 */
export interface StatusBadgeConfig {
  status: string;
  variant?: "default" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

/**
 * Avatar configuration
 */
export interface AvatarConfig {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg" | "xl";
  shape?: "circle" | "square";
}

/**
 * Card configuration
 */
export interface CardConfig {
  title?: string;
  subtitle?: string;
  content: ReactNode;
  actions?: ActionButton[];
  variant?: "default" | "outlined" | "elevated";
  size?: "sm" | "md" | "lg";
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  type: "success" | "error" | "warning" | "info";
  title?: string;
  message: string;
  actions?: ActionButton[];
  dismissible?: boolean;
  onDismiss?: () => void;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title?: string;
  message: string;
  duration?: number;
  actions?: ActionButton[];
  onDismiss?: () => void;
}

/**
 * Sidebar configuration
 */
export interface SidebarConfig {
  items: NavigationItem[];
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  width?: string;
  position?: "left" | "right";
}

/**
 * Header configuration
 */
export interface HeaderConfig {
  title?: string;
  subtitle?: string;
  actions?: ActionButton[];
  breadcrumbs?: BreadcrumbItem[];
  avatar?: AvatarConfig;
}

/**
 * Footer configuration
 */
export interface FooterConfig {
  content: ReactNode;
  links?: Array<{ label: string; href: string }>;
  copyright?: string;
}

/**
 * Layout configuration
 */
export interface LayoutConfig {
  header?: HeaderConfig;
  sidebar?: SidebarConfig;
  footer?: FooterConfig;
  children: ReactNode;
}

/**
 * Theme configuration
 */
export interface ThemeConfig {
  mode: "light" | "dark" | "system";
  primaryColor?: string;
  borderRadius?: "none" | "sm" | "md" | "lg" | "xl";
  fontSize?: "sm" | "md" | "lg";
}

/**
 * User configuration
 */
export interface UserConfig {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
  preferences?: Record<string, any>;
}

/**
 * App configuration
 */
export interface AppConfig {
  name: string;
  version: string;
  theme: ThemeConfig;
  user?: UserConfig;
  features?: Record<string, boolean>;
}
