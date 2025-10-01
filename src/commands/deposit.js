// deposit.js
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { CFG, OFF_MSG } from '../config.js';
import { q, getBool } from '../db.js';
import { toU } from '../money.js';
import { vietqrUrlVND } from '../vietqr.js';
import { logDeposit, logAudit } from '../logging.js';
import { replyEmbed } from '../ui.js';

// VND -> USDT, làm tròn 6 chữ số thập phân
const vndToUsdt = (vnd) => Number((vnd / CFG.vndPerUsdt).toFixed(6));

export async function handleDepositCommand(interaction) {
  if (!getBool('deposit_enabled', true)) {
    return replyEmbed(interaction, {
      title: '⏳ Admin đang ngủ',
      desc: OFF_MSG,
      color: 'warn',
      ephemeral: true
    });
  }

  // Gửi 1 embed có 2 nút
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dep_qr').setLabel('Nạp qua QR (VND)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dep_crypto').setLabel('Nạp Crypto (USDT)').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return replyEmbed(interaction, {
    title: 'Nạp tiền',
    fields: [{ name: 'Chọn phương thức', value: 'QR (VND) hoặc Crypto (USDT).' }],
    color: 'info',
    components,
    ephemeral: true
  });
}

export async function handleDepositButtons(interaction) {
  if (!getBool('deposit_enabled', true)) {
    return replyEmbed(interaction, { title: '⏳ Admin đang ngủ', desc: OFF_MSG, color: 'warn', ephemeral: true });
  }

  if (interaction.customId === 'dep_qr') {
    const modal = new ModalBuilder()
      .setCustomId('modal_dep_qr')
      .setTitle('Nạp qua VietQR (nhập VND)');

    const amountVnd = new TextInputBuilder()
      .setCustomId('amount_vnd')
      .setLabel(`Số tiền VND (1 USDT = ${CFG.vndPerUsdt.toLocaleString('vi-VN')} VND)`)
      .setPlaceholder('VD: 100000')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const note = new TextInputBuilder()
      .setCustomId('note_info_qr')
      .setLabel('Lưu ý (không cần nhập)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setValue(`Tỉ giá: 1 USDT = ${CFG.vndPerUsdt.toLocaleString('vi-VN')} VND
Nội dung chuyển khoản là Discord ID: ${interaction.user.id}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(amountVnd),
      new ActionRowBuilder().addComponents(note)
    );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'dep_crypto') {
    const modal = new ModalBuilder()
      .setCustomId('modal_dep_crypto')
      .setTitle('Nạp Crypto (USDT)');

    const amount = new TextInputBuilder()
      .setCustomId('amount_usdt')
      .setLabel('Số USDT')
      .setPlaceholder('VD: 10')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const note = new TextInputBuilder()
      .setCustomId('note_info_crypto')
      .setLabel('Lưu ý (không cần nhập)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setValue(`Mạng: ${CFG.crypto.network}
Ví nhận: ${CFG.crypto.address || 'Chưa cấu hình'}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(amount),
      new ActionRowBuilder().addComponents(note)
    );
    return interaction.showModal(modal);
  }
}

export async function handleDepositModals(interaction) {
  if (!getBool('deposit_enabled', true)) {
    return replyEmbed(interaction, { title: '⏳ Admin đang ngủ', desc: OFF_MSG, color: 'warn', ephemeral: true });
  }

  // QR: nhập VND -> quy đổi -> tạo VietQR (user embed có ảnh), log channel không ảnh
  if (interaction.customId === 'modal_dep_qr') {
    const vnd = Number(interaction.fields.getTextInputValue('amount_vnd'));
    if (!Number.isFinite(vnd) || vnd <= 0) {
      return replyEmbed(interaction, { title: 'Lỗi', desc: 'Số VND không hợp lệ.', color: 'error', ephemeral: true });
    }

    const usdt = vndToUsdt(vnd);
    const discordId = interaction.user.id;
    const username = `${interaction.user.username}#${interaction.user.discriminator ?? '0'}`;
    const ref = `DEPVQR-${discordId}-${Date.now()}`;

    q.insertTx.run({
      discord_id: discordId,
      username,
      type: 'deposit',
      method: 'VND_QR',
      amount_u: Number(toU(usdt)),
      amount_vnd: vnd,
      status: 'PENDING',
      destination: `${CFG.vietqr.bankId}-${CFG.vietqr.accountNo}`,
      reference: ref
    });

    const img = vietqrUrlVND({ amountVND: vnd, description: discordId });

    // User embed có ảnh QR
    await replyEmbed(interaction, {
      title: 'Nạp qua VietQR',
      fields: [
        { name: 'VND', value: `${vnd.toLocaleString('vi-VN')} VND`, inline: true },
        { name: '≈ USDT', value: `${usdt}`, inline: true },
        { name: 'Ngân hàng', value: 'MB Bank', inline: true },
        { name: 'Số tài khoản', value: `${CFG.vietqr.accountNo}`, inline: true },
        { name: 'Nội dung', value: `${discordId}`, inline: true },
        { name: 'Ref', value: `\`${ref}\``, inline: true }
      ],
      image: img,
      footer: `Tỉ giá: 1 USDT = ${CFG.vndPerUsdt.toLocaleString('vi-VN')} VND`,
      color: 'info',
      ephemeral: true
    });

    // Log vào channel deposit: KHÔNG ảnh, format theo yêu cầu
    await logDeposit(interaction.client, {
      title: 'DEPOSIT QR',
      fields: [
        { name: '👤', value: `<@${discordId}> (${username})` },
        { name: '💰', value: `${usdt} USDT • VietQR (${vnd.toLocaleString('vi-VN')} VND)` },
        { name: '📍 Tài khoản', value: `${CFG.vietqr.accountNo}` },
        { name: '🔖 Mã giao dịch:', value: `${ref}` }
      ]
    });

    await logAudit(interaction.client, `deposit_qr uid=${discordId} vnd=${vnd} usdt≈${usdt} ref=${ref}`);
    return;
  }

  // Crypto: nhập USDT -> user embed không ảnh, log channel không ảnh
  if (interaction.customId === 'modal_dep_crypto') {
    const usdt = Number(interaction.fields.getTextInputValue('amount_usdt'));
    if (!Number.isFinite(usdt) || usdt <= 0) {
      return replyEmbed(interaction, { title: 'Lỗi', desc: 'Số USDT không hợp lệ.', color: 'error', ephemeral: true });
    }

    const discordId = interaction.user.id;
    const username = `${interaction.user.username}#${interaction.user.discriminator ?? '0'}`;
    const ref = `DEPUSDT-${discordId}-${Date.now()}`;

    q.insertTx.run({
      discord_id: discordId,
      username,
      type: 'deposit',
      method: 'USDT',
      amount_u: Number(toU(usdt)),
      amount_vnd: 0,
      status: 'PENDING',
      destination: CFG.crypto.address,
      reference: ref
    });

    // User embed
    await replyEmbed(interaction, {
      title: 'Nạp Crypto (USDT)',
      fields: [
        { name: 'Số USDT', value: String(usdt), inline: true },
        { name: 'Mạng', value: CFG.crypto.network, inline: true },
        { name: 'Ví nhận', value: `\`${CFG.crypto.address || 'Chưa cấu hình'}\`` },
        { name: 'Ref', value: `\`${ref}\``, inline: true }
      ],
      color: 'info',
      ephemeral: true
    });

    // Log channel deposit
    await logDeposit(interaction.client, {
      title: 'DEPOSIT CRYPTO',
      fields: [
        { name: '👤', value: `<@${discordId}> (${username})` },
        { name: '💰', value: `${usdt} USDT • ${CFG.crypto.network}` },
        { name: '📍 Ví:', value: `${CFG.crypto.address}` },
        { name: '🔖 Mã giao dịch:', value: `${ref}` }
      ]
    });

    await logAudit(interaction.client, `deposit_crypto uid=${discordId} usdt=${usdt} ref=${ref}`);
    return;
  }
}
