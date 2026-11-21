import { BasePage } from './BasePage';

export interface NewCustomer {
  firstName: string;
  lastName: string;
  dob: string; // YYYY-MM-DD
  country: string;
  postalCode: string;
  houseNumber: string;
  street: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  password: string;
}

export class RegisterPage extends BasePage {
  readonly form = this.byTestId('register-form');
  readonly submit = this.byTestId('register-submit');

  error(field: string) {
    return this.byTestId(`${field}-error`);
  }

  async open() {
    await this.goto('/auth/register');
  }

  async register(c: NewCustomer) {
    await this.byTestId('first-name').fill(c.firstName);
    await this.byTestId('last-name').fill(c.lastName);
    await this.byTestId('dob').fill(c.dob);
    await this.byTestId('country').selectOption({ label: c.country });
    await this.byTestId('postal_code').fill(c.postalCode);
    await this.byTestId('house_number').fill(c.houseNumber);
    await this.byTestId('street').fill(c.street);
    await this.byTestId('city').fill(c.city);
    await this.byTestId('state').fill(c.state);
    await this.byTestId('phone').fill(c.phone);
    await this.byTestId('email').fill(c.email);
    await this.byTestId('password').fill(c.password);
    await this.submit.click();
  }

  /** After a successful registration the app redirects to the login form. */
  async waitForLoginRedirect() {
    await this.ready(this.byTestId('login-submit'));
  }
}
