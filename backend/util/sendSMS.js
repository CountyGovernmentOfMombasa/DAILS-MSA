// Tolclin Bulk SMS integration using global fetch (Node 18+)

function buildMsisdn(to) {
  if (Array.isArray(to)) {
    return to.filter(Boolean).join(",");
  }
  return String(to);
}

async function sendSMS({ to, body }) {
  const enabled = (process.env.SMS_ENABLED || "true").toLowerCase() === "true";
  if (!enabled) {
    console.log(`[SMS disabled] Would send to ${buildMsisdn(to)}: ${body}`);
    return { ok: true, disabled: true };
  }

  if (!to) throw new Error("SMS recipient (to) is required");
  if (!body) throw new Error("SMS body is required");

  const url =
    process.env.TOLCLIN_BASE_URL || "https://tolclin.com/tolclin/sms/BulkSms";
  const payload = {
    clientid: process.env.TOLCLIN_CLIENT_ID
      ? Number(process.env.TOLCLIN_CLIENT_ID)
      : undefined,
    callbackurl: process.env.TOLCLIN_CALLBACK_URL || "",
    senderid: process.env.TOLCLIN_SENDER_ID || "COUNTY-MSA",
    msisdn: buildMsisdn(to),
    message: body,
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
