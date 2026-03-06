import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding notification templates...");

  const templates = [
    // ─── EMAIL TEMPLATES ───────────────────────────────────────────────────────
    {
      name: "order_confirmation_email",
      type: "EMAIL",
      category: "ORDER_CONFIRMATION",
      subject: "Order Confirmed – #{{orderId}}",
      body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Order Confirmed</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#2d6a4f">✅ Order Confirmed!</h2>
  <p>Hi <strong>{{customerName}}</strong>,</p>
  <p>Your order <strong>#{{orderId}}</strong> has been confirmed and is being processed.</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0">
    <tr style="background:#f4f4f4">
      <th style="padding:10px;text-align:left;border:1px solid #ddd">Item</th>
      <th style="padding:10px;text-align:right;border:1px solid #ddd">Qty</th>
      <th style="padding:10px;text-align:right;border:1px solid #ddd">Price</th>
    </tr>
    {{#each items}}
    <tr>
      <td style="padding:10px;border:1px solid #ddd">{{this.name}}</td>
      <td style="padding:10px;text-align:right;border:1px solid #ddd">{{this.quantity}}</td>
      <td style="padding:10px;text-align:right;border:1px solid #ddd">{{this.price}}</td>
    </tr>
    {{/each}}
    <tr style="font-weight:bold">
      <td colspan="2" style="padding:10px;border:1px solid #ddd">Total</td>
      <td style="padding:10px;text-align:right;border:1px solid #ddd">{{total}}</td>
    </tr>
  </table>
  <p>Estimated delivery: <strong>{{estimatedDelivery}}</strong></p>
  <p style="color:#888;font-size:12px">Thank you for shopping with us.</p>
</body>
</html>`,
    },
    {
      name: "vendor_order_alert_email",
      type: "EMAIL",
      category: "VENDOR_ORDER_ALERT",
      subject: "🛒 New Order Received – #{{orderId}}",
      body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>New Order</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#e76f51">🛒 New Order Alert</h2>
  <p>Hi <strong>{{vendorName}}</strong>,</p>
  <p>You have a new order <strong>#{{orderId}}</strong> that requires your attention.</p>
  <p><strong>Customer:</strong> {{customerName}}</p>
  <p><strong>Order Date:</strong> {{orderDate}}</p>
  <h3>Items Ordered:</h3>
  <ul>
    {{#each items}}
    <li>{{this.name}} × {{this.quantity}} — {{this.price}}</li>
    {{/each}}
  </ul>
  <p><strong>Total:</strong> {{total}}</p>
  <p>Please confirm this order within 30 minutes.</p>
  <a href="{{dashboardUrl}}" style="background:#e76f51;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">View Order</a>
</body>
</html>`,
    },
    {
      name: "refund_notification_email",
      type: "EMAIL",
      category: "REFUND_NOTIFICATION",
      subject: "Refund Processed – #{{orderId}}",
      body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Refund Processed</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#457b9d">💳 Refund Processed</h2>
  <p>Hi <strong>{{customerName}}</strong>,</p>
  <p>Your refund for order <strong>#{{orderId}}</strong> has been processed successfully.</p>
  <p><strong>Refund Amount:</strong> {{refundAmount}}</p>
  <p><strong>Refund Method:</strong> {{refundMethod}}</p>
  <p><strong>Expected Arrival:</strong> {{expectedArrival}}</p>
  <p>If you have any questions, please contact our support team.</p>
  <p style="color:#888;font-size:12px">This refund was initiated on {{initiatedAt}}.</p>
</body>
</html>`,
    },
    {
      name: "otp_delivery_email",
      type: "EMAIL",
      category: "OTP_DELIVERY",
      subject: "Your OTP Code – {{purpose}}",
      body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>OTP Code</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#264653">🔐 Verification Code</h2>
  <p>Hi there,</p>
  <p>Your one-time password (OTP) for <strong>{{purpose}}</strong> is:</p>
  <div style="font-size:36px;font-weight:bold;letter-spacing:10px;text-align:center;padding:20px;background:#f4f4f4;border-radius:8px;margin:20px 0">
    {{code}}
  </div>
  <p>This code expires in <strong>{{expiresInMinutes}} minutes</strong>.</p>
  <p style="color:#e63946">Never share this code with anyone.</p>
</body>
</html>`,
    },

    // ─── SMS TEMPLATES ─────────────────────────────────────────────────────────
    {
      name: "order_confirmation_sms",
      type: "SMS",
      category: "ORDER_CONFIRMATION",
      subject: null,
      body: "Hi {{customerName}}, your order #{{orderId}} is confirmed! Total: {{total}}. Est. delivery: {{estimatedDelivery}}. Track it here: {{trackingUrl}}",
    },
    {
      name: "vendor_order_alert_sms",
      type: "SMS",
      category: "VENDOR_ORDER_ALERT",
      subject: null,
      body: "New order #{{orderId}} received from {{customerName}}. Total: {{total}}. Please confirm within 30 mins: {{dashboardUrl}}",
    },
    {
      name: "refund_notification_sms",
      type: "SMS",
      category: "REFUND_NOTIFICATION",
      subject: null,
      body: "Refund of {{refundAmount}} for order #{{orderId}} has been processed. Expected in {{expectedArrival}}.",
    },
    {
      name: "otp_delivery_sms",
      type: "SMS",
      category: "OTP_DELIVERY",
      subject: null,
      body: "Your OTP for {{purpose}} is: {{code}}. Valid for {{expiresInMinutes}} mins. Do NOT share this code.",
    },

    // ─── PUSH TEMPLATES ────────────────────────────────────────────────────────
    {
      name: "order_confirmation_push",
      type: "PUSH",
      category: "ORDER_CONFIRMATION",
      subject: "Order Confirmed ✅",
      body: "Your order #{{orderId}} is confirmed! Estimated delivery: {{estimatedDelivery}}.",
    },
    {
      name: "vendor_order_alert_push",
      type: "PUSH",
      category: "VENDOR_ORDER_ALERT",
      subject: "New Order 🛒",
      body: "New order #{{orderId}} from {{customerName}} — {{total}}. Tap to review.",
    },
    {
      name: "refund_notification_push",
      type: "PUSH",
      category: "REFUND_NOTIFICATION",
      subject: "Refund Processed 💳",
      body: "Your refund of {{refundAmount}} for order #{{orderId}} is on its way.",
    },
  ];

  for (const template of templates) {
    await prisma.template.upsert({
      where: { name: template.name },
      update: template,
      create: template,
    });
    console.log(`  ✔ ${template.name}`);
  }

  console.log("✅ Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());