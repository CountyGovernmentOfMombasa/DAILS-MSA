const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,           // smtp.office365.com
  port: parseInt(process.env.SMTP_PORT), // 587
  secure: false,                         // STARTTLS
  auth: {
    user: process.env.SMTP_USER,         // noreply@company.com
    pass: process.env.SMTP_PASS          // password or app password
  }
});

async function sendEmail({ to, subject, text, html }) {
  return transporter.sendMail({
    from: `"CGM DIALs Team" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });
}

module.exports = sendEmail;
