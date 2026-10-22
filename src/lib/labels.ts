import type { CustomerTier, CustomerType, ProductKind, SupplierType } from "@/db/schema";

export const TIER_LABEL: Record<CustomerTier, string> = { vip: "VIP", regular: "Regular", new: "New" };
export const TIER_ORDER: CustomerTier[] = ["vip", "regular", "new"];
export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = { retail: "Retail", wholesale: "Wholesale" };
export const SUPPLIER_TYPE_LABEL: Record<SupplierType, string> = {
  fabric: "Fabric supplier",
  outsourcing: "Stitching unit",
};
export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = { custom: "Custom stitched", ready_made: "Ready made" };

export function filsToInput(fils: number) {
  return fils ? (fils / 100).toFixed(2) : "";
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
