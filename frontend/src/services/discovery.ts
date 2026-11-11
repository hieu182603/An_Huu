import { authenticatedRequest } from "./api";
import type { ProductItem, CatalogPage } from "./catalog";
import type { ContentItem, ContentPage } from "./content";
export type ProductFacet = { category: string; riskLevel: string; _count: { _all: number } };
export type ContentFacet = { category: string; _count: { _all: number } };
export type ConsultTicket = { id: string; subject: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"; createdAt: string; revision: number };
export type DepositResult = { informationalOnly: true; currency: "VND"; maturityDate: string; interest: string; monthlyPayout: string; maturityPayment: string; totalReceived: string; early: null | { date: string; interest: string; alreadyPaid: string; settlementPayment: string; totalReceived: string } };
export type BondResult = { informationalOnly: true; currency: "VND"; cost: string; faceValueTotal: string; totalCoupons: string; totalReceived: string; gain: string; currentYieldPercent: string; nominalYtmPercent: string | null; schedule: Array<{ month: number; date: string; coupon: string; principal: string; total: string }>; sale: null | { date: string; collectedCoupons: string; proceeds: string; gain: string } };
const get = <T>(path: string, signal?: AbortSignal) => authenticatedRequest<T>(path, undefined, "GET", undefined, { skipCache: true, signal });
const params = (values: Record<string, string | number | undefined>) => new URLSearchParams(Object.entries(values).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
export const discovery = {
  products: (values: Record<string, string | number | undefined>, signal?: AbortSignal) => get<CatalogPage<ProductItem>>(`/products?${params(values)}`, signal),
  product: (id: string, signal?: AbortSignal) => get<ProductItem>(`/products/${encodeURIComponent(id)}`, signal),
  productFacets: (signal?: AbortSignal) => get<ProductFacet[]>("/products/facets", signal),
  savedProducts: (signal?: AbortSignal) => get<ProductItem[]>("/me/saved-products", signal),
  saveProduct: (id: string, saved: boolean) => authenticatedRequest<{ saved: boolean }>(`/me/saved-products/${encodeURIComponent(id)}`, {}, saved ? "PUT" : "DELETE"),
  consult: (id: string, data: { message: string; phone?: string; channel: "PHONE" | "EMAIL" | "BRANCH"; consent: true; expectedProductRevision?: number }) => authenticatedRequest<ConsultTicket>(`/me/products/${encodeURIComponent(id)}/consult`, data, "POST"),
  tickets: (page: number, signal?: AbortSignal) => get<CatalogPage<ConsultTicket>>(`/me/support?${params({ page, limit: 12, category: "Tư vấn sản phẩm" })}`, signal),
  cancelTicket: (id: string) => authenticatedRequest<{ cancelled: boolean }>(`/me/support/${encodeURIComponent(id)}/cancel`, {}, "POST"),
  articles: (values: Record<string, string | number | undefined>, saved: boolean, signal?: AbortSignal) => get<ContentPage>(`${saved ? "/me/saved-content" : "/content"}?${params({ ...values, kind: "ARTICLE" })}`, signal),
  article: (slug: string, signal?: AbortSignal) => get<ContentItem>(`/content/${encodeURIComponent(slug)}`, signal),
  contentFacets: (signal?: AbortSignal) => get<ContentFacet[]>("/content-facets", signal),
  savedArticles: (signal?: AbortSignal) => get<Array<{ articleId: string }>>("/me/saved-articles", signal),
  saveArticle: (id: string, saved: boolean) => authenticatedRequest<{ saved: boolean }>(`/me/saved-articles/${encodeURIComponent(id)}`, {}, saved ? "PUT" : "DELETE"),
  deposit: (body: unknown, signal?: AbortSignal) => authenticatedRequest<DepositResult>("/me/product-tools/deposit/preview", body, "POST", undefined, { signal }),
  bond: (body: unknown, signal?: AbortSignal) => authenticatedRequest<BondResult>("/me/product-tools/bond/preview", body, "POST", undefined, { signal }),
};
