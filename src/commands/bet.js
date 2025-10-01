import { q, db } from '../db.js';
import { MIN_BET_U, toU, fmtU, ratioToU, mulRatioU } from '../money.js';
import { CFG } from '../config.js';
import { replyEmbed, editEmbed } from '../ui.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const payoutZeroRatioU = ratioToU(CFG.payoutZero);

const calcResult = (msgId) => {
  const d2 = Number(msgId.at(-1));        // hàng đơn vị
  const d1 = Number(msgId.at(-2) || '0'); // hàng chục
  const r = (d1 + d2) % 10;
  return { d1, d2, r };
};

const isWin = (choice, r) => {
  if (choice === 'chan') return r !== 0 && r % 2 === 0;
  if (choice === 'le') return r % 2 === 1;
  if (choice === '0') return r === 0;
  return false;
};

const payoutUFor = (choice, amount_u, win) => {
  if (!win) return 0n;
  if (choice === '0') return mulRatioU(amount_u, payoutZeroRatioU);
  return amount_u; // 1:1
};

export async function handleBetCommand(interaction) {
  try {
    // Luôn defer để không timeout và chỉ dùng editReply về sau
    await interaction.deferReply({ ephemeral: false });

    const choice = interaction.options.getString('chon');
    const amount = interaction.options.getNumber('sotien');

    // Validate nhanh, dùng editEmbed vì đã defer
    if (!['chan', 'le', '0'].includes(choice)) {
      return editEmbed(interaction, {
        title: 'Lỗi',
        fields: [{ name: 'Chi tiết', value: 'Lựa chọn không hợp lệ.' }],
        color: 'error'
      });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return editEmbed(interaction, {
        title: 'Lỗi',
        fields: [{ name: 'Chi tiết', value: 'Số tiền phải ≥ 0.1 USDT.' }],
        color: 'error'
      });
    }

    const amount_u = toU(amount);
    if (amount_u < MIN_BET_U) {
      return editEmbed(interaction, {
        title: 'Từ chối',
        fields: [{ name: 'Chi tiết', value: `Số tiền phải ≥ **${fmtU(MIN_BET_U)} USDT**.` }],
        color: 'warn'
      });
    }

    const discordId = interaction.user.id;
    const username = `${interaction.user.username}#${interaction.user.discriminator ?? '0'}`;
    const p = q.getPlayer.get(discordId) || { balance_u: 0 };
    const balU = BigInt(p.balance_u ?? 0);

    if (balU < amount_u) {
      const deficitU = amount_u - balU;
      return editEmbed(interaction, {
        title: 'Thiếu số dư',
        fields: [
          { name: 'Số dư', value: `${fmtU(balU)} USDT`, inline: true },
          { name: 'Cược đã đặt', value: `${fmtU(amount_u)} USDT`, inline: true },
          { name: 'Thiếu', value: `${fmtU(deficitU)} USDT` },
          { name: 'Hướng dẫn', value: 'Dùng **/nap** để nạp thêm.' }
        ],
        color: 'warn'
      });
    }

    // Hiển thị trạng thái trước khi lấy msg.id
    await editEmbed(interaction, {
      title: 'Đang lấy ID…',
      fields: [{ name: 'Trạng thái', value: 'Chuẩn bị tính kết quả.' }],
      color: 'neutral'
    });

    // Lấy ID message hiện tại
    const msg = await interaction.fetchReply();
    const msgId = msg.id;
    const { d1, d2, r } = calcResult(msgId);

    const win = isWin(choice, r);
    const payout_u = payoutUFor(choice, amount_u, win);
    const net_u = win ? payout_u : -amount_u;

    // Ghi DB + cập nhật số dư trong transaction
    const newBalU = db.transaction(() => {
      const cur = q.getPlayer.get(discordId);
      if (!cur) q.upsertPlayer.run({ discord_id: discordId, username, balance_u: 0 });

      q.insertBet.run({
        discord_id: discordId,
        username,
        choice,
        amount_u: Number(amount_u),
        message_id: msgId,
        last_digit: r,
        result: win ? 'WIN' : 'LOSE',
        payout_u: Number(payout_u),
        net_change_u: Number(net_u)
      });

      q.updateBalU.run({ discord_id: discordId, delta_u: Number(net_u) });
      const after = q.getPlayer.get(discordId);
      return BigInt(after?.balance_u ?? 0);
    })();

    const fields = [
      { name: '🆔 Message ID', value: `\`${msgId}\``, inline: true },
      { name: '🎲 Kết quả', value: `${d1} + ${d2} → **${r}**`, inline: true },
      { name: '🎯 Lựa chọn', value: `**${choice}**`, inline: true },
      { name: '💰 Cược', value: `${fmtU(amount_u)} USDT`, inline: true },
      { name: 'Trạng thái', value: win ? '✅ THẮNG' : '❌ THUA', inline: true },
      { name: 'Trả', value: `${fmtU(payout_u)} USDT`, inline: true },
      { name: 'Biến động', value: `${fmtU(net_u)} USDT`, inline: true },
      { name: '💼 Số dư mới', value: `${fmtU(newBalU)} USDT` },
      { name: 'Luật', value: '(**hàng chục** + **hàng đơn vị**) của tin nhắn bot, lấy **số cuối** của tổng.\nTỉ lệ: Chẵn/Lẻ **1:1**, Số 0 **1:8.5**.' }
    ];

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Kiểm tra kết quả')
          .setStyle(ButtonStyle.Link)
          .setURL('https://example.com/luat-bet') // thay link của bạn
      )
    ];

    return editEmbed(interaction, {
      title: `Kết quả: ${r}`,
      fields,
      color: win ? 'ok' : 'error',
      footer: 'Chúc các bạn may mắn',
      components
    });
  } catch (err) {
    console.error('handleBetCommand error:', err);
    // Phòng khi editReply lỗi
    if (!interaction.deferred && !interaction.replied) {
      return replyEmbed(interaction, { title: 'Lỗi hệ thống', desc: 'Thử lại sau.', color: 'error' });
    }
    return editEmbed(interaction, { title: 'Lỗi hệ thống', desc: 'Thử lại sau.', color: 'error' });
  }
}
