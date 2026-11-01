const { sendMail } = require('../../services/mail/mail.service');
const templates = require('../../services/mail/templates');

/** data: { to, template, params } */
async function sendEmailJob({ to, template, params }) {
  const build = templates[template];
  if (!build) throw new Error(`Unknown email template "${template}"`);
  await sendMail({ to, ...build(params) });
}

module.exports = sendEmailJob;
