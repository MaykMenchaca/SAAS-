import { apiClient } from "./client";

export type Category = {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type UnitOfMeasure = {
  id: number;
  name: string;
  abbreviation: string;
  allows_fractions: boolean;
};

export type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category_id: number | null;
  unit_id: number;
  purchase_price: string;
  avg_cost: string;
  sale_price: string;
  tax_rate: string;
  min_stock: string;
  max_stock: string;
  is_active: boolean;
  category: Category | null;
  unit: UnitOfMeasure;
  stock_qty?: string;
};

export type ProductPayload = {
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  category_id?: number | null;
  unit_id: number;
  purchase_price?: string;
  avg_cost?: string;
  sale_price: string;
  tax_rate?: string;
  min_stock?: string;
  max_stock?: string;
};

export type ProductUpdatePayload = Partial<ProductPayload> & {
  is_active?: boolean;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pages: number;
  per_page: number;
  total: number;
};

type ListProductsParams = {
  page?: number;
  perPage?: number;
  search?: string;
  category_id?: number;
};

export async function listProducts({ page = 1, perPage = 20, search = "", category_id }: ListProductsParams) {
  const response = await apiClient.get<PaginatedResponse<Product>>("/products/", {
    params: {
      page,
      per_page: perPage,
      search: search || undefined,
      category_id: category_id || undefined,
    },
  });
  return response.data;
}

export async function createProduct(payload: ProductPayload) {
  const response = await apiClient.post<Product>("/products/", payload);
  return response.data;
}

export async function updateProduct(id: number, payload: ProductUpdatePayload) {
  const response = await apiClient.patch<Product>(`/products/${id}`, payload);
  return response.data;
}

export async function deactivateProduct(id: number) {
  const response = await apiClient.delete<Product>(`/products/${id}`);
  return response.data;
}

export async function listCategories() {
  const response = await apiClient.get<PaginatedResponse<Category>>("/categories/", {
    params: {
      per_page: 100,
    },
  });
  return response.data.items;
}

export async function createCategory(payload: { name: string; description?: string }) {
  const response = await apiClient.post<Category>("/categories/", payload);
  return response.data;
}

export async function updateCategory(id: number, payload: { name: string; description?: string }) {
  const response = await apiClient.patch<Category>(`/categories/${id}`, payload);
  return response.data;
}

export async function deactivateCategory(id: number) {
  const response = await apiClient.delete<Category>(`/categories/${id}`);
  return response.data;
}

export async function listUnits() {
  const response = await apiClient.get<UnitOfMeasure[]>("/products/units");
  return response.data;
}

export async function createUnit(payload: { name: string; abbreviation: string; allows_fractions: boolean }) {
  const response = await apiClient.post<UnitOfMeasure>("/products/units", payload);
  return response.data;
}

export async function updateUnit(id: number, payload: Partial<{ name: string; abbreviation: string; allows_fractions: boolean }>) {
  const response = await apiClient.patch<UnitOfMeasure>(`/products/units/${id}`, payload);
  return response.data;
}

export async function deleteUnit(id: number) {
  const response = await apiClient.delete<{ success: boolean }>(`/products/units/${id}`);
  return response.data;
}
