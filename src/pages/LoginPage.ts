import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly email = this.byTestId('email');
  readonly password = this.byTestId('password');
  readonly submit = this.byTestId('login-submit');
  readonly error = this.byTestId('login-error');

  async open() {
    await this.goto('/auth/login');
  }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
