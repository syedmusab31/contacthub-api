const env = require('../../config/env');

const escapeHtml = (s = '') =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

function layout(title, bodyHtml) {
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;background:#f5f6f8;padding:24px">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:8px;padding:28px">
    <h2 style="margin-top:0;color:#1f2937">${escapeHtml(title)}</h2>
    ${bodyHtml}
    <p style="color:#9ca3af;font-size:12px;margin-top:32px">Contact Manager</p>
  </div>
</body></html>`;
}

const button = (url, label) =>
  `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>
   <p style="font-size:12px;color:#6b7280">Or paste this link into your browser:<br>${escapeHtml(url)}</p>`;

function verifyEmail({ name, token }) {
  const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Verify your email address',
    text: `Hi ${name},\n\nConfirm your email address by opening this link:\n${url}\n\nThe link expires in 24 hours.`,
    html: layout(
      'Verify your email',
      `<p>Hi ${escapeHtml(name)},</p><p>Please confirm your email address. The link expires in 24 hours.</p>${button(url, 'Verify email')}`
    ),
  };
}

function resetPassword({ name, token }) {
  const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Reset your password',
    text: `Hi ${name},\n\nReset your password with this link:\n${url}\n\nThe link expires in 1 hour. If you did not ask for this, ignore this email.`,
    html: layout(
      'Reset your password',
      `<p>Hi ${escapeHtml(name)},</p><p>We received a request to reset your password. The link expires in 1 hour.</p>${button(url, 'Reset password')}<p>If you did not ask for this, you can ignore this email.</p>`
    ),
  };
}

function passwordChanged({ name }) {
  return {
    subject: 'Your password was changed',
    text: `Hi ${name},\n\nYour password was just changed and all other sessions were signed out. If this wasn't you, reset your password right away.`,
    html: layout(
      'Password changed',
      `<p>Hi ${escapeHtml(name)},</p><p>Your password was just changed and all other sessions were signed out.</p><p>If this wasn't you, reset your password right away.</p>`
    ),
  };
}

function contactShared({ recipientName, ownerName, contactName, role }) {
  return {
    subject: `${ownerName} shared a contact with you`,
    text: `Hi ${recipientName},\n\n${ownerName} shared "${contactName}" with you (${role} access).\n\n${env.APP_URL}/contacts/shared`,
    html: layout(
      'A contact was shared with you',
      `<p>Hi ${escapeHtml(recipientName)},</p><p><strong>${escapeHtml(ownerName)}</strong> shared <strong>${escapeHtml(contactName)}</strong> with you (${escapeHtml(role)} access).</p>${button(`${env.APP_URL}/contacts/shared`, 'View contact')}`
    ),
  };
}

function birthdayReminder({ name, contacts }) {
  const list = contacts.map((c) => `- ${c.name}${c.age ? ` (turns ${c.age})` : ''}`).join('\n');
  const items = contacts
    .map((c) => `<li>${escapeHtml(c.name)}${c.age ? ` &mdash; turns ${c.age}` : ''}</li>`)
    .join('');
  return {
    subject:
      contacts.length === 1
        ? `It's ${contacts[0].name}'s birthday today`
        : `${contacts.length} birthdays today`,
    text: `Hi ${name},\n\nBirthdays today:\n${list}`,
    html: layout('Birthdays today', `<p>Hi ${escapeHtml(name)},</p><ul>${items}</ul>`),
  };
}

module.exports = { verifyEmail, resetPassword, passwordChanged, contactShared, birthdayReminder };
