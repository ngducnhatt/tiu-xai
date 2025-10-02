import { CFG } from "./config.js";
import { makeEmbed } from "./ui.js";

async function sendTo(client, channelId, payload) {
  if (!channelId) return;
  const ch =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!ch) return;
  const eb = makeEmbed(payload);
  return ch
    .send({
      content: CFG.adminMention ? `${CFG.adminMention}` : undefined,
      embeds: [eb],
      components: payload.components || [],
    })
    .catch(() => null);
}

export async function logDeposit(client, payload) {
  return sendTo(client, CFG.channels.deposit, payload);
}
export async function logWithdraw(client, payload) {
  return sendTo(client, CFG.channels.withdraw, payload);
}
export async function logAudit(client, text) {
  const ch = CFG.channels.audit;
  if (!ch) return;
  const channel =
    client.channels.cache.get(ch) ||
    (await client.channels.fetch(ch).catch(() => null));
  if (!channel) return;
  return channel
    .send(`\`${new Date().toISOString()}\` ${text}`)
    .catch(() => null);
}
