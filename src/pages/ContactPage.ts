import { BasePage } from './BasePage';

export interface ContactMessage {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  message: string;
}

export class ContactPage extends BasePage {
  readonly firstName = this.byTestId('first-name');
  readonly lastName = this.byTestId('last-name');
  readonly email = this.byTestId('email');
  readonly subject = this.byTestId('subject');
  readonly message = this.byTestId('message');
  readonly submit = this.byTestId('contact-submit');
  readonly success = this.page.getByRole('alert').filter({ hasText: /thanks for your message/i });

  /** Field-level validation message, e.g. error('email') -> data-test="email-error". */
  error(field: 'first-name' | 'last-name' | 'email' | 'subject' | 'message') {
    return this.byTestId(`${field}-error`);
  }

  async open() {
    await this.goto('/contact');
  }

  async send(msg: ContactMessage) {
    await this.firstName.fill(msg.firstName);
    await this.lastName.fill(msg.lastName);
    await this.email.fill(msg.email);
    await this.subject.selectOption({ label: msg.subject });
    await this.message.fill(msg.message);
    await this.submit.click();
  }
}
