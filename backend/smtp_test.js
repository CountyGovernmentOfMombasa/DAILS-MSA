require('dotenv').config();
const sendEmail = require('./util/sendEmail');

async function testEmail() {
  const to = process.env.MAIL_FROM_ADDR || process.env.MAIL_USERNAME;
  if (!to) {
    console.error('No MAIL_FROM_ADDR or MAIL_USERNAME set');
    process.exit(1);
  }
  try {
    const info = await sendEmail({
      to,
      subject: 'MAIL_* Configuration Test',
      text: 'If you received this, the new MAIL_* environment configuration works.',
      html: '<p><strong>Success!</strong> The new <code>MAIL_*</code> variables are functioning.</p>'
    });
    console.log('Test email accepted by transporter:', info.messageId);
  } catch (err) {
    console.error('Error sending test email:', err);
  }
}

testEmail();
