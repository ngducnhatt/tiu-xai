// logging.js
import { CFG } from './config.js';
import { sendEmbedToChannel } from './ui.js';

// helper: fields -> desc dạng nhiều dòng
const fieldsToDesc = (fields = []) =>
  fields.map(({ name, value }) => `${name} ${value}`).join('\n');

export const logDeposit = (client, { title, fields, desc }) => {
  const finalDesc = desc ?? fieldsToDesc(fields);
  return sendEmbedToChannel(
    client,
    CFG.channels.deposit,
    { title, desc: finalDesc, color: 'info' },
    CFG.adminMention
  );
};

export const logWithdraw = (client, { title, fields, desc }) => {
  const finalDesc = desc ?? fieldsToDesc(fields);
  return sendEmbedToChannel(
    client,
    CFG.channels.withdraw,
    { title, desc: finalDesc, color: 'warn' },
    CFG.adminMention
  );
};

export const logAudit = (client, text) =>
  sendEmbedToChannel(
    client,
    CFG.channels.audit,
    { title: 'AUDIT', desc: text, color: 'neutral' }
  );
