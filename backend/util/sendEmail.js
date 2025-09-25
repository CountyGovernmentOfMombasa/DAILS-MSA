const nodemailer = require('nodemailer');

// Build transport configuration using MAIL_* variables only
function buildTransportConfig() {
  const host = process.env.MAIL_HOST || 'localhost';
  const port = parseInt(process.env.MAIL_PORT || '587', 10);
  const secureFlagEnv = process.env.MAIL_SECURE; // 'true' / 'false' or undefined
  const secure = secureFlagEnv ? secureFlagEnv === 'true' : port === 465; // implicit SSL on 465
  const authUser = process.env.MAIL_USERNAME;
  const authPass = process.env.MAIL_PASSWORD;

  const cfg = {
    host,
    port,
    secure,
    auth: authUser && authPass ? { user: authUser, pass: authPass } : undefined,
    requireTLS: !secure,
    tls: {}
  };

  if (process.env.MAIL_TLS_VERIFY_PEER === 'false') {
    cfg.tls.rejectUnauthorized = false;
  }
  return cfg;
}

// Lazy singleton transporter so that if env changes between tests we can rebuild
let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(buildTransportConfig());
  }
  return transporter;
}

/**
 * Send an email.
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient(s)
 * @param {string} options.subject - Subject line
 * @param {string} [options.text] - Plain text fallback
 * @param {string} [options.html] - HTML body
 * @param {string|string[]} [options.cc]
 * @param {string|string[]} [options.bcc]
 * @param {Array} [options.attachments] - Nodemailer attachments array
 * @param {string} [options.replyTo] - Override reply-to email
 * @param {string} [options.fromEmail] - Override from email
 * @param {string} [options.fromName] - Override from display name
 */
async function sendEmail(options) {
  const {
    to,
    subject,
    text,
    html,
    cc,
    bcc,
    attachments,
    replyTo,
    fromEmail,
    fromName
  } = options;

  const defaultFromEmail = fromEmail || process.env.MAIL_FROM_ADDR || process.env.MAIL_USERNAME;
  const defaultFromName = fromName || process.env.MAIL_FROM_NAME || 'CGM DIALs Team';
  const replyToAddr = replyTo || (process.env.MAIL_REPLYTO_ADDR || '') || undefined;
  const replyToName = process.env.MAIL_REPLYTO_NAME;

  const mailOptions = {
    from: defaultFromEmail ? `${defaultFromName} <${defaultFromEmail}>` : undefined,
    to,
    subject,
    text,
    html,
    cc,
    bcc,
    attachments,
    replyTo: replyToAddr ? (replyToName ? `${replyToName} <${replyToAddr}>` : replyToAddr) : undefined
  };

  return getTransporter().sendMail(mailOptions);
}

module.exports = sendEmail;
