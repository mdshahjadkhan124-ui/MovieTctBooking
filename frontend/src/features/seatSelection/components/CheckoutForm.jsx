import { useState } from "react";
import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js";

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: "16px",
      color: "#111827",
      "::placeholder": { color: "#9ca3af" },
    },
  },
};

// Confirms the PaymentIntent client-side with Stripe.js. The actual booking
// commit happens asynchronously via the /api/webhooks/stripe handler, so a
// "succeeded" result here only means the card was charged — onCharged
// triggers the caller's polling of the booking's own status.
const CheckoutForm = ({ clientSecret, onCharged, onError }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) },
    });
    setSubmitting(false);

    if (error) {
      onError(error.message || "Payment failed");
      return;
    }
    if (paymentIntent.status === "succeeded") {
      onCharged();
    } else {
      onError(`Unexpected payment status: ${paymentIntent.status}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-gray-200 p-4">
      <p className="text-xs text-gray-500">Test card: 4242 4242 4242 4242, any future date/CVC/ZIP</p>
      <div className="rounded-md border border-gray-300 px-3 py-2.5">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Processing..." : "Pay now"}
      </button>
    </form>
  );
};

export default CheckoutForm;
