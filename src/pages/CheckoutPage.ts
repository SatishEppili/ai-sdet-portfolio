import { BasePage } from './BasePage';

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  houseNumber: string;
}

/** The 4-step checkout wizard at /checkout: cart -> sign in -> address -> payment. */
export class CheckoutPage extends BasePage {
  readonly productTitles = this.byTestId('product-title');
  readonly productQuantity = this.byTestId('product-quantity');
  readonly productPrice = this.byTestId('product-price');
  readonly linePrice = this.byTestId('line-price');
  readonly cartTotal = this.byTestId('cart-total');
  readonly paymentMethod = this.byTestId('payment-method');
  readonly finish = this.byTestId('finish');
  readonly paymentSuccess = this.byTestId('payment-success-message');

  async open() {
    await this.goto('/checkout');
  }

  async proceedFromCart() {
    await this.byTestId('proceed-1').click();
  }

  /** Step 2 when already logged in: just continue. */
  async proceedAsSignedIn() {
    await this.byTestId('proceed-2').click();
  }

  async fillAddress(a: Address) {
    await this.byTestId('street').fill(a.street);
    await this.byTestId('city').fill(a.city);
    await this.byTestId('state').fill(a.state);
    await this.byTestId('country').selectOption({ label: a.country });
    await this.byTestId('postal_code').fill(a.postalCode);
    await this.byTestId('house_number').fill(a.houseNumber);
    await this.byTestId('proceed-3').click();
  }

  async pay(method: 'Bank Transfer' | 'Cash on Delivery') {
    await this.paymentMethod.selectOption({ label: method });
    await this.finish.click();
  }
}
