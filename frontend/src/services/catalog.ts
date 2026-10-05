import { apiRequest, authenticatedRequest } from "./api";

export type PartnerType = "OPEN_FUND" | "BANK" | "INSURANCE" | "SECURITIES";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface PartnerItem {
  id: string;
  name: string;
  type: PartnerType;
  logoUrl: string | null;
  website: string | null;
  contactEmail?: string | null;
  isHighlight: boolean;
  isVisible: boolean;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductItem {
  id: string;
  partnerId: string;
  name: string;
  category: string;
  expectedReturn: string;
  riskLevel: RiskLevel;
  description: string | null;
  annualFee: string | null;
  conditions: string | null;
  disclosure: string | null;
  isVisible: boolean;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  partner?: PartnerItem;
}

export interface CatalogPage<T> {
  page: number;
  limit: number;
  total: number;
  items: T[];
}

export interface PartnerInput {
  name: string;
  type: PartnerType;
  logoUrl: string | null;
  website: string | null;
  contactEmail: string | null;
  isHighlight: boolean;
  isVisible: boolean;
}

export interface ProductInput {
  partnerId: string;
  name: string;
  category: string;
  expectedReturn: string;
  riskLevel: RiskLevel;
  description: string | null;
  annualFee: string | null;
  conditions: string | null;
  disclosure: string | null;
  isVisible: boolean;
}

// Public endpoints
export async function listPublicPartners(page = 1, limit = 20, search = ""): Promise<CatalogPage<PartnerItem>> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set("search", search);
  return apiRequest<CatalogPage<PartnerItem>>(`/partners?${query}`);
}

export async function getPublicPartner(id: string): Promise<PartnerItem> {
  return apiRequest<PartnerItem>(`/partners/${encodeURIComponent(id)}`);
}

export async function listPublicProducts(page = 1, limit = 20, search = "", partnerId = ""): Promise<CatalogPage<ProductItem>> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set("search", search);
  if (partnerId) query.set("partnerId", partnerId);
  return apiRequest<CatalogPage<ProductItem>>(`/products?${query}`);
}

export async function getPublicProduct(id: string): Promise<ProductItem> {
  return apiRequest<ProductItem>(`/products/${encodeURIComponent(id)}`);
}

// Admin endpoints
export async function listAdminPartners(page = 1, limit = 20, search = ""): Promise<CatalogPage<PartnerItem>> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set("search", search);
  return authenticatedRequest<CatalogPage<PartnerItem>>(`/admin/partners?${query}`);
}

export async function getAdminPartner(id: string): Promise<PartnerItem> {
  return authenticatedRequest<PartnerItem>(`/admin/partners/${encodeURIComponent(id)}`);
}

export async function createAdminPartner(data: PartnerInput): Promise<PartnerItem> {
  return authenticatedRequest<PartnerItem>("/admin/partners", data, "POST");
}

export async function updateAdminPartner(id: string, expectedRevision: number, data: PartnerInput): Promise<PartnerItem> {
  return authenticatedRequest<PartnerItem>(
    `/admin/partners/${encodeURIComponent(id)}`,
    { expectedRevision, data },
    "PUT"
  );
}

export async function listAdminProducts(page = 1, limit = 20, search = "", partnerId = ""): Promise<CatalogPage<ProductItem>> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set("search", search);
  if (partnerId) query.set("partnerId", partnerId);
  return authenticatedRequest<CatalogPage<ProductItem>>(`/admin/products?${query}`);
}

export async function getAdminProduct(id: string): Promise<ProductItem> {
  return authenticatedRequest<ProductItem>(`/admin/products/${encodeURIComponent(id)}`);
}

export async function createAdminProduct(data: ProductInput): Promise<ProductItem> {
  return authenticatedRequest<ProductItem>("/admin/products", data, "POST");
}

export async function updateAdminProduct(id: string, expectedRevision: number, data: ProductInput): Promise<ProductItem> {
  return authenticatedRequest<ProductItem>(
    `/admin/products/${encodeURIComponent(id)}`,
    { expectedRevision, data },
    "PUT"
  );
}
