import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  readonly email = this.byTestId('email');
  readonly password = this.byTestId('password');
  readonly submit = this.byTestId('login-submit');
  readonly error = this.byTestId('login-error');
  readonly accountTitle = this.byTestId('page-title');

  async open() {
    await this.goto('/auth/login');
    await this.ready(this.email);
  }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }

  /** Logs in and waits for the account page (skips as an environment issue if the bot check appears). */
  async loginAsCustomer(email: string, password: string) {
    await this.login(email, password);
    await this.ready(this.accountTitle);
  }
}
