import { type APIRequestContext, expect } from '@playwright/test';

export const API_URL = process.env.API_URL ?? 'https://api.practicesoftwaretesting.com';

export interface Product {
  id: string;
  name: string;
  price: number;
  in_stock: boolean;
  is_rental: boolean;
}

export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
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

  /**
   * Registers a brand-new customer. Tests use their own throwaway account instead of the
   * public demo customer, which anyone on the internet can lock with failed logins.
   */
  async registerCustomer(): Promise<Customer> {
    const customer: Customer = {
      firstName: 'Test',
      lastName: `User${Math.floor(Math.random() * 1e6)}`,
      email: `qa+${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`,
      password: 'Sup3r$ecure!Pass2026',
    };
    const res = await this.request.post(`${API_URL}/users/register`, {
      data: {
        first_name: customer.firstName,
        last_name: customer.lastName,
        dob: '1990-01-01',
        phone: '0123456789',
        email: customer.email,
        password: customer.password,
        address: { street: 'Teststrasse 1', house_number: '1', city: 'Vienna', state: 'Vienna', country: 'AT', postal_code: '1010' },
      },
    });
    expect(res, `register should succeed: ${await res.text()}`).toBeOK();
    return customer;
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
