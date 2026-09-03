import type { Metadata } from 'next'
import styles from './page.module.css'

export const metadata: Metadata = {
  title: 'Pay Justin Mayer',
  description: 'Choose PayPal, Venmo, Zelle, or Cash App to pay Justin Mayer.',
  robots: {
    index: false,
    follow: false
  }
}

const paymentMethods = [
  {
    name: 'Venmo',
    detail: '@Justin-Mayer-69',
    badge: 'V',
    href: 'https://venmo.com/u/Justin-Mayer-69',
    theme: styles.venmo
  },
  {
    name: 'Zelle',
    detail: 'Justin Mayer • 662-750-4626',
    badge: 'Z',
    href: 'https://enroll.zellepay.com/qr-codes?data=eyJ0b2tlbiI6IjY2Mjc1MDQ2MjYiLCJuYW1lIjoiSlVTVElOIn0=',
    theme: styles.zelle
  },
  {
    name: 'Cash App',
    detail: '$JMayerFinancial',
    badge: '$',
    href: 'https://cash.app/$JMayerFinancial?qr=1',
    theme: styles.cashApp
  }
] as const

export default function PayPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="payment-title">
        <div className={styles.identityMark} aria-hidden="true">JM</div>
        <p className={styles.eyebrow}>Mayer Financial</p>
        <h1 id="payment-title">Pay Justin Mayer</h1>
        <p className={styles.intro}>
          Choose a payment method. You will be sent to the official payment service to review and confirm your payment.
        </p>

        <div className={styles.methods} aria-label="Payment methods">
          <form action="https://www.paypal.com/cgi-bin/webscr" method="post">
            <input type="hidden" name="cmd" value="_xclick" />
            <input type="hidden" name="business" value="JMayerFinancial@Gmail.Com" />
            <input type="hidden" name="item_name" value="Payment to Justin Mayer" />
            <input type="hidden" name="currency_code" value="USD" />
            <input type="hidden" name="button_subtype" value="services" />
            <input type="hidden" name="no_shipping" value="1" />
            <input type="hidden" name="no_note" value="0" />
            <input type="hidden" name="return" value="https://crm.mayerig.com/pay" />
            <input type="hidden" name="cancel_return" value="https://crm.mayerig.com/pay" />
            <button
              className={`${styles.method} ${styles.paypal}`}
              type="submit"
              aria-label="Continue to PayPal to pay Justin Mayer"
            >
              <span className={styles.badge} aria-hidden="true">P</span>
              <span className={styles.methodText}>
                <strong>PayPal</strong>
                <small>JMayerFinancial@Gmail.Com</small>
              </span>
              <span className={styles.continueText} aria-hidden="true">Continue →</span>
            </button>
          </form>

          {paymentMethods.map((method) => (
            <a
              className={`${styles.method} ${method.theme}`}
              href={method.href}
              key={method.name}
              aria-label={`Continue to ${method.name} to pay Justin Mayer`}
            >
              <span className={styles.badge} aria-hidden="true">{method.badge}</span>
              <span className={styles.methodText}>
                <strong>{method.name}</strong>
                <small>{method.detail}</small>
              </span>
              <span className={styles.continueText} aria-hidden="true">Continue →</span>
            </a>
          ))}
        </div>

        <p className={styles.securityNote}>
          This page never asks for or stores your card, bank, password, or payment information. Always verify the recipient before sending.
        </p>
      </section>
    </main>
  )
}
