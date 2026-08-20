export { Button } from "./Button";
// ⚠ Desde el módulo neutral y NO desde "./Button": re-exportar a través de un módulo
// "use client" marca la función como de cliente y llamarla desde un Server Component
// revienta la página. Lo sostiene components/ui/button-variants.test.ts.
export { buttonVariants } from "./button-variants";
export type { ButtonVariantProps } from "./button-variants";
export type { ButtonProps } from "./Button";

export { Badge }     from "./Badge";
export type { BadgeProps } from "./Badge";

export { Card }      from "./Card";

export { Input, Textarea, Select } from "./Input";
export type { InputProps, TextareaProps, SelectProps } from "./Input";

export { Field, useFieldContext } from "./Field";
export type { FieldProps, FieldContextValue } from "./Field";

export { Alert } from "./Alert";
export type { AlertProps, AlertVariant } from "./Alert";

export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";

export { AcceptButton, RejectButton, IconCheck, IconX } from "./AcceptReject";
export type { AccionProps } from "./AcceptReject";

export { Tabs } from "./Tabs";
export type { TabsProps, TabItem } from "./Tabs";

export { Menu } from "./Menu";
export type { MenuProps, MenuItemDef } from "./Menu";

export { Spinner }   from "./Spinner";

export { Modal }     from "./Modal";
export type { ModalProps } from "./Modal";

export { Drawer }    from "./Drawer";
export type { DrawerProps } from "./Drawer";

export { ConfirmDialog } from "./ConfirmDialog";
export type { ConfirmDialogProps } from "./ConfirmDialog";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

export { BackLink } from "./BackLink";
export type { BackLinkProps } from "./BackLink";

export { Breadcrumbs } from "./Breadcrumbs";
export type { Crumb } from "./Breadcrumbs";

export {
  Skeleton,
  SkeletonText,
  SkeletonPanel,
  PageHeaderSkeleton,
  CardsSkeleton,
  ListSkeleton,
  SkeletonTabs,
  SkeletonChart,
} from "./Skeleton";
export type {
  SkeletonProps,
  SkeletonTextProps,
  SkeletonPanelProps,
  PageHeaderSkeletonProps,
  CardsSkeletonProps,
  ListSkeletonProps,
  SkeletonTabsProps,
  SkeletonChartProps,
} from "./Skeleton";

export { Avatar }    from "./Avatar";
export type { AvatarProps } from "./Avatar";

export { SearchFilterBar } from "./SearchFilterBar";
export type { SearchFilterBarProps } from "./SearchFilterBar";

export { Table, TableSkeleton } from "./Table";
export type { TableProps, TableColumn, TableSkeletonProps } from "./Table";

export { ToastProvider, useToast } from "./Toast";
export type { ToastApi, ToastOptions, ToastAction, ToastType } from "./Toast";
