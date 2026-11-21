import { test, expect } from '../../src/fixtures/test';
import { API_URL } from '../../src/api/ToolshopApi';

test.describe('Toolshop REST API', () => {
  test('login returns a token that identifies the customer', async ({ request, api, customer }) => {
    const token = await api.login(customer.email, customer.password);
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT shape

    const me = await request.get(`${API_URL}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    await expect(me).toBeOK();
    expect((await me.json()).email).toBe(customer.email);
  });

  test('login with a wrong password is rejected with 401', async ({ request, customer }) => {
    const res = await request.post(`${API_URL}/users/login`, {
      data: { email: customer.email, password: 'wrong-password' },
    });
    expect(res.status()).toBe(401);
  });

  test('product list is paginated and every item has the core fields', async ({ request }) => {
    const res = await request.get(`${API_URL}/products`, { params: { page: 1 } });
    await expect(res).toBeOK();
    const body = await res.json();

    expect(body.current_page).toBe(1);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.length).toBeLessThanOrEqual(body.per_page);
    for (const p of body.data) {
      expect(p).toMatchObject({ id: expect.any(String), name: expect.any(String), price: expect.any(Number) });
      expect(p.price).toBeGreaterThan(0);
    }
  });

  test('search matches by name and an unknown product returns 404', async ({ request }) => {
    const search = await request.get(`${API_URL}/products/search`, { params: { q: 'hammer' } });
    await expect(search).toBeOK();
    const names: string[] = (await search.json()).data.map((p: { name: string }) => p.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => /hammer/i.test(n))).toBe(true);

    const missing = await request.get(`${API_URL}/products/does-not-exist`);
    expect(missing.status()).toBe(404);
  });
});
