// Tolclin Bulk SMS integration using global fetch (Node 18+)

function buildMsisdn(to) {
  if (Array.isArray(to)) {
    return to.filter(Boolean).join(",");
  }
  return String(to);
}

/**
 * Send SMS via Tolclin
 * @param {Object} opts
 * @param {string|string[]} opts.to - Recipient(s)
 * @param {string} opts.body - Message body
 * @param {string} [opts.type] - 'otp' for OTP, anything else for bulk/general
 */
async function sendSMS({ to, body, type, type }) {
  const enabled = (process.env.SMS_ENABLED || "true").toLowerCase() === "true";
  if (!enabled) {
    console.log(`[SMS disabled] Would send to ${buildMsisdn(to)}: ${body}`);
    return { ok: true, disabled: true };
  }

  if (!to) throw new Error("SMS recipient (to) is required");
  if (!body) throw new Error("SMS body is required");

  let url;
  if (type === "otp") {
    url =
      process.env.TOLCLIN_CALLBACK_URL ||
      "http://tolclin.com/tolclin/smscallback.php";
  } else {
    url =
      process.env.TOLCLIN_BULKSMS_URL ||
      "https://tolclin.com/tolclin/sms/BulkSms";
  }

  const payload = {
    clientid: process.env.TOLCLIN_CLIENT_ID
      ? Number(process.env.TOLCLIN_CLIENT_ID)
      : undefined,
    callbackurl:
      process.env.TOLCLIN_CALLBACK_URL ||
      "https://tolclin.com/tolclin/smscallback.php",
    senderid: process.env.TOLCLIN_SENDER_ID || "COUNTY-MSA",
    msisdn: buildMsisdn(to),
    message: body,
    type: type,
  };

  // Remove undefined keys
  Object.keys(payload).forEach(
    (k) => payload[k] === undefined && delete payload[k]
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("Tolclin SMS error:", res.status, text);
      throw new Error(`SMS provider error: ${res.status}`);
    }
    // Try parse JSON, fallback to raw text
    try {
      return JSON.parse(text);
    } catch {
      return { ok: true, response: text };
    }
  } catch (err) {
    console.error("sendSMS failed:", err.message);
    throw err;
  }
}

module.exports = sendSMS;
