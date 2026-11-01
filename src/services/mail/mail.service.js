const nodemailer = require('nodemailer');
const env = require('../../config/env');
const logger = require('../../config/logger');

let transporter;

/** Messages sent while no SMTP server is configured (dev/test). */
const outbox = [];

function getTransporter() {
  if (transporter) return transporter;
  transporter = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const info = await getTransporter().sendMail({ from: env.MAIL_FROM, to, subject, text, html });

  if (!env.SMTP_HOST) {
    outbox.push({ to, subject, text, html, sentAt: new Date() });
    if (outbox.length > 100) outbox.shift();
    logger.info({ to, subject }, 'Email captured (no SMTP configured)');
    logger.debug({ text }, 'Email body');
  }
  return info;
}

module.exports = { sendMail, outbox };
