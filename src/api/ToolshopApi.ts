import { type APIRequestContext, expect } from '@playwright/test';

export const API_URL = process.env.API_URL ?? 'https://api.practicesoftwaretesting.com';

export interface Product {
  id: string;
  name: string;
  price: number;
  in_stock: boolean;
  is_rental: boolean;
}

/**
 * Thin client for the Toolshop REST API. Tests use it to pick live data
 * (e.g. an in-stock product) instead of hard-coding names: stock on the
 * shared demo site changes all the time.
 */
export class ToolshopApi {
  constructor(private readonly request: APIRequestContext) {}

  async login(email: string, password: string): Promise<string> {
    const res = await this.request.post(`${API_URL}/users/login`, { data: { email, password } });
    expect(res, 'login should succeed').toBeOK();
    return (await res.json()).access_token;
  }

  async products(page = 1): Promise<Product[]> {
    const res = await this.request.get(`${API_URL}/products`, { params: { page } });
    expect(res).toBeOK();
    return (await res.json()).data;
  }

  /** First product that can actually be added to the cart right now. */
  async inStockProduct(): Promise<Product> {
    for (let page = 1; page <= 3; page++) {
      const found = (await this.products(page)).find((p) => p.in_stock && !p.is_rental);
      if (found) return found;
    }
    throw new Error('No in-stock product found on the first 3 pages of the catalog');
  }
}
