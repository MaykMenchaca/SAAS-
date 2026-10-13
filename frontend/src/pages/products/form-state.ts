import type { Product, ProductPayload } from "../../api/products";

export type ProductFormState = {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category_id: string;
  unit_id: string;
  purchase_price: string;
  avg_cost: string;
  sale_price: string;
  tax_rate: string;
  min_stock: string;
  max_stock: string;
};

export const emptyForm: ProductFormState = {
  sku: "",
  barcode: "",
  name: "",
  description: "",
  category_id: "",
  unit_id: "",
  purchase_price: "0.00",
  avg_cost: "0.00",
  sale_price: "",
  tax_rate: "16.00",
  min_stock: "0.000",
  max_stock: "0.000",
};

export function productToForm(product: Product): ProductFormState {
  return {
    sku: product.sku,
    barcode: product.barcode ?? "",
    name: product.name,
    description: product.description ?? "",
    category_id: product.category_id ? String(product.category_id) : "",
    unit_id: String(product.unit_id),
    purchase_price: product.purchase_price,
    avg_cost: product.avg_cost,
    sale_price: product.sale_price,
    tax_rate: product.tax_rate,
    min_stock: product.min_stock,
    max_stock: product.max_stock,
  };
}

export function formToPayload(form: ProductFormState): ProductPayload {
  return {
    sku: form.sku.trim(),
    barcode: form.barcode.trim() || null,
    name: form.name.trim(),
    description: form.description.trim() || null,
    category_id: form.category_id ? Number(form.category_id) : null,
    unit_id: Number(form.unit_id),
    purchase_price: form.purchase_price,
    avg_cost: form.avg_cost,
    sale_price: form.sale_price,
    tax_rate: form.tax_rate,
    min_stock: form.min_stock,
    max_stock: form.max_stock,
  };
}
