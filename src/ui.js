import { EmbedBuilder } from "discord.js";

const palette = {
  ok: 0x22c55e,
  error: 0xef4444,
  warn: 0xf59e0b,
  info: 0x3b82f6,
  neutral: 0x94a3b8,
};

export function makeEmbed({
  title,
  desc,
  fields,
  color = "info",
  footer,
  image,
}) {
  const eb = new EmbedBuilder().setColor(palette[color] ?? palette.info);
  if (title) eb.setTitle(title);
  if (desc) eb.setDescription(desc);
  if (Array.isArray(fields) && fields.length) eb.addFields(fields);
  if (footer) eb.setFooter({ text: footer });
  if (image) eb.setImage(image);
  return eb;
}

export async function replyEmbed(
  inter,
  {
    title,
    desc,
    fields,
    color = "info",
    footer,
    image,
    ephemeral = false,
    components,
  } = {}
) {
  const eb = makeEmbed({ title, desc, fields, color, footer, image });
  return inter.reply({ embeds: [eb], ephemeral, components });
}

export async function editEmbed(
  inter,
  { title, desc, fields, color = "info", footer, image, components } = {}
) {
  const eb = makeEmbed({ title, desc, fields, color, footer, image });
  return inter.editReply({ embeds: [eb], components });
}
