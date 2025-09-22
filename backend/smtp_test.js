require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // use TLS
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    let info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER, // send to yourself for test
      subject: 'SMTP Test Email',
      text: 'This is a test email from Nodemailer using Outlook SMTP.',
      html: '<b>This is a test email from Nodemailer using Outlook SMTP.</b>'
    });
    console.log('Test email sent:', info.messageId);
  } catch (err) {
    console.error('Error sending test email:', err);
  }
}

testEmail();
