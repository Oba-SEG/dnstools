import type { Metadata } from "next";
import { LEGAL_STYLES, LegalShell } from "../legal-shared";

export const metadata: Metadata = {
  title: "Refund Policy — Nexus Domain Tools",
  description: "Refund terms for the Nexus DNS Pro license: 14-day money-back guarantee, how to request one, and what happens to your license after a refund.",
};

export default function RefundPage() {
  return (
    <LegalShell
      title="Refund Policy"
      updated="Last updated: 12 November 2026"
      styles={LEGAL_STYLES}
    >
      <p>
        This policy covers <strong>Nexus DNS Pro</strong>, our paid software
        license, sold as a one-time purchase. Checkout, payment, tax, and
        refunds are handled by <strong>Paddle.com</strong> acting as our
        merchant of record. This policy does not apply to the free tools, which
        carry no purchase and no payment.
      </p>

      <h2>14-day money-back guarantee</h2>
      <p>
        If Nexus DNS Pro isn&apos;t working for you, you can request a full
        refund within <strong>14 days of purchase</strong> — any reason, no
        questions asked.
      </p>

      <h2>How to request a refund</h2>
      <ul>
        <li>
          Reply to your Paddle receipt email and select the refund option, or
          contact Paddle support through the link on that receipt — they can
          process the refund directly.
        </li>
        <li>
          Or email{" "}
          <a href="mailto:obakengsegoatlhe@gmail.com?subject=Nexus%20Pro%20refund">
            obakengsegoatlhe@gmail.com
          </a>{" "}
          with your Transaction ID (starts with <code>txn_</code>) and the
          email you paid with, and we&apos;ll request the refund with Paddle on
          your behalf.
        </li>
      </ul>

      <h2>Processing and timing</h2>
      <ul>
        <li>
          Approved refunds are issued to your original payment method through
          Paddle, typically within a few business days. Bank and card
          settlement times vary by provider.
        </li>
        <li>Refunds include the full purchase price; Paddle confirms the final amount on the refund.</li>
      </ul>

      <h2>What happens to your license</h2>
      <ul>
        <li>
          When a refund is approved, the license for that transaction is{" "}
          <strong>revoked</strong> — further redemptions are blocked and we ask
          that you remove the license key and stop using the software.
        </li>
        <li>A refunded purchase cannot be re-redeemed. Buy again if you change your mind later.</li>
      </ul>

      <h2>After 14 days</h2>
      <p>
        Outside the 14-day window we can still help in clear cases — a duplicate
        purchase, a charge that never delivered a usable license, or a purchase
        made in error. Email us with the transaction details and we&apos;ll
        review it with Paddle.
      </p>

      <h2>Statutory rights</h2>
      <p>
        Nothing in this policy limits rights you may have under the law of your
        country — including EU/UK distance-selling withdrawal rights and South
        Africa&apos;s Consumer Protection Act. Where those apply, they work
        alongside this policy.
      </p>

      <h2>Fraud and abuse</h2>
      <p>
        We may decline refunds where there is evidence of fraud, license-key
        resale or sharing at scale, or repeated refund abuse. Legitimate buyers
        within the 14-day window are always covered.
      </p>
    </LegalShell>
  );
}
