import { CFG } from '../config.js';
import { replyEmbed } from '../ui.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const ratio0 = CFG.payoutZero;

const blocks = {
  nap: [
    { name: 'Nạp Tiền', value: '`/nap`' },
  ],
  rut: [
    { name: 'Rút tiền', value: '`/rut`' },
  ],
  bet: [
    { name: 'Cách chơi', value: '`/bet chon:<chan|le|0> sotien:<tiền cược>` nhập theo thứ tự bạn chọn chẵn hay lẻ hoặc 0, nhập tiếp số tiền cược, Trả thưởng với tỉ lệ Chẵn vs Lẻ **1:1** | 0 **1:8.5**' },
  ],
  taikhoan: [
    { name: 'Xem tài khoản', value: '`/taikhoan`' },
  ]
};

export async function handleHelpCommand(interaction) {
  const topic = interaction.options.getString('topic') || 'all';
  const fields = topic === 'all'
    ? [...blocks.nap, ...blocks.rut, ...blocks.bet, ...blocks.taikhoan]
    : blocks[topic] ?? blocks.bet;

  return replyEmbed(interaction, {
    title: 'Hướng dẫn',
    fields,
    color: 'neutral',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Hướng dẫn Nạp')
          .setStyle(ButtonStyle.Link)
          .setURL('https://example.com/help-nap'),
        new ButtonBuilder()
          .setLabel('Hướng dẫn Rút')
          .setStyle(ButtonStyle.Link)
          .setURL('https://example.com/help-rut'),
        new ButtonBuilder()
          .setLabel('Hướng dẫn Chơi')
          .setStyle(ButtonStyle.Link)
          .setURL('https://example.com/help-bet')
      )
    ]
  });
}
