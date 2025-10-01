// src/ui.js
import { EmbedBuilder } from 'discord.js';

const COLORS = {
  info: 0x2f81f7,
  warn: 0xffcc00,
  error: 0xff3b30,
  ok: 0x22c55e,
  neutral: 0x5865f2
};

export function makeEmbed({ title, desc, color='neutral', fields=[], image, footer }) {
  const eb = new EmbedBuilder()
    .setColor(COLORS[color] ?? COLORS.neutral)
    .setTitle(title || '\u200b');

  if (desc) eb.setDescription(desc);
  if (fields?.length) eb.addFields(fields.map(({name, value, inline=false}) => ({ name, value, inline })));
  if (image) eb.setImage(image);
  if (footer) eb.setFooter({ text: footer });
  return eb;
}

export function replyEmbed(interaction, { title, desc, color, fields, image, footer, components=[], ephemeral=true }) {
  const eb = makeEmbed({ title, desc, color, fields, image, footer });
  return interaction.reply({ embeds: [eb], components, ephemeral });
}

export function editEmbed(interaction, { title, desc, color, fields, image, footer, components=[] }) {
  const eb = makeEmbed({ title, desc, color, fields, image, footer });
  return interaction.editReply({ embeds: [eb], components });
}

export async function sendEmbedToChannel(client, channelId, { title, desc, color, fields, image, footer, contentPrefix='' }) {
  if (!channelId) return;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch) return;
  const eb = makeEmbed({ title, desc, color, fields, image, footer });
  return ch.send({ content: contentPrefix || undefined, embeds: [eb] });
}
