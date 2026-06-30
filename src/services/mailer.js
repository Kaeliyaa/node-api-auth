const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendResetEmail(toEmail, resetToken) {
  const resetLink = `http://localhost:3000/reset-password.html?token=${resetToken}`;

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: 'Password Reset Request',
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${resetLink}">Click here to reset your password</a></p>
      <p>This link expires in 30 minutes. If you didn't request this, ignore this email.</p>
    `
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}

module.exports = { sendResetEmail };