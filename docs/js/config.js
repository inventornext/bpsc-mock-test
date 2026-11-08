// Site name and payment settings.
// Firebase settings are in firebase-config.js.

const SITE = {
  name: "BPSC Mock Test",
  short: "BPSC",
  tagline: "Previous year papers in real exam mode",
};

// One-time payment for lifetime access to every paper.
// Fill in at least one of upiId or razorpayLink. Leave the other empty.
const PAYMENT = {
  price: 199,                 // rupees
  upiId: "ganeshpandey.ee-2@okhdfcbank",                 // e.g. "ganeshpandey@okaxis"  (from your UPI app, no account needed)
  upiName: "BPSC Mock Test", // name shown in the UPI app
  razorpayLink: "",          // e.g. "https://rzp.io/rzp/abc123" (Razorpay Payment Link or Page)
  contact: "inventornext.github@gmail.com",               // optional: your email/WhatsApp shown if a student needs help
};
