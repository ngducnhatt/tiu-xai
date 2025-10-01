// withdraw.js
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { CFG, OFF_MSG } from '../config.js';
import { q, getBool, db } from '../db.js';
import { toU, fmtU } from '../money.js';
import { replyEmbed } from '../ui.js';
import { logWithdraw, logAudit } from '../logging.js';

// Rút tối thiểu 10 USDT
const MIN_WITHDRAW_U = toU(10);

export async function handleWithdrawCommand(interaction) {
  if (!getBool('withdraw_enabled', true)) {
    return replyEmbed(interaction, {
      title: '⏳ Admin đang ngủ',
      desc: OFF_MSG,
      color: 'warn',
      ephemeral: true
    });
  }

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wd_usdt').setLabel('Rút USDT').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('wd_bank').setLabel('Rút Ngân hàng').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return replyEmbed(interaction, {
    title: 'Rút tiền',
    fields: [
      { name: 'Chọn phương thức', value: 'Rút USDT trực tiếp hoặc rút về Ngân hàng.' },
      { name: 'Tối thiểu', value: `≥ ${fmtU(MIN_WITHDRAW_U)} USDT` }
    ],
    color: 'info',
    components,
    ephemeral: true
  });
}

export async function handleWithdrawButtons(interaction) {
  if (!getBool('withdraw_enabled', true)) {
    return replyEmbed(interaction, { title: '⏳ Admin đang ngủ', desc: OFF_MSG, color: 'warn', ephemeral: true });
  }

  if (interaction.customId === 'wd_usdt') {
    const modal = new ModalBuilder()
      .setCustomId('modal_wd_USDT')
      .setTitle('Rút tiền - USDT');

    const amount = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel(`Số USDT muốn rút (≥ ${fmtU(MIN_WITHDRAW_U)})`)
      .setPlaceholder('VD: 15')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const wallet = new TextInputBuilder()
      .setCustomId('wallet')
      .setLabel('Địa chỉ ví USDT')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const note = new TextInputBuilder()
      .setCustomId('note_info_wd_usdt')
      .setLabel('Lưu ý (không cần nhập)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setValue(`Mạng: ${CFG.crypto.network}. Kiểm tra kỹ địa chỉ.`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(amount),
      new ActionRowBuilder().addComponents(wallet),
      new ActionRowBuilder().addComponents(note),
    );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'wd_bank') {
    const modal = new ModalBuilder()
      .setCustomId('modal_wd_BANK')
      .setTitle('Rút tiền - Ngân hàng');

    const amount = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel(`Số USDT muốn rút (≥ ${fmtU(MIN_WITHDRAW_U)})`)
      .setPlaceholder('VD: 25')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const bankName = new TextInputBuilder()
      .setCustomId('bank_name')
      .setLabel('Ngân hàng')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const bankAcc = new TextInputBuilder()
      .setCustomId('bank_acc')
      .setLabel('Số tài khoản')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const bankOwner = new TextInputBuilder()
      .setCustomId('bank_owner')
      .setLabel('Chủ tài khoản')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(amount),
      new ActionRowBuilder().addComponents(bankName),
      new ActionRowBuilder().addComponents(bankAcc),
      new ActionRowBuilder().addComponents(bankOwner),
    );
    return interaction.showModal(modal);
  }
}

export async function handleWithdrawModals(interaction) {
  if (!getBool('withdraw_enabled', true)) {
    return replyEmbed(interaction, { title: '⏳ Admin đang ngủ', desc: OFF_MSG, color: 'warn', ephemeral: true });
  }

  if (interaction.customId === 'modal_wd_USDT') {
    const amount = Number(interaction.fields.getTextInputValue('amount')?.trim());
    const wallet = interaction.fields.getTextInputValue('wallet')?.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return replyEmbed(interaction, { title: 'Lỗi', desc: 'Số USDT không hợp lệ.', color: 'error', ephemeral: true });
    }

    const amount_u = toU(amount);
    if (amount_u < MIN_WITHDRAW_U) {
      return replyEmbed(interaction, {
        title: 'Từ chối',
        desc: `Số rút tối thiểu **${fmtU(MIN_WITHDRAW_U)} USDT**.`,
        color: 'warn',
        ephemeral: true
      });
    }

    const p = q.getPlayer.get(interaction.user.id) || { balance_u: 0 };
    const balU = BigInt(p.balance_u ?? 0);
    if (balU < amount_u) {
      const deficitU = amount_u - balU;
      return replyEmbed(interaction, {
        title: 'Thiếu số dư',
        fields: [
          { name: 'Số dư', value: `${fmtU(balU)} USDT`, inline: true },
          { name: 'Yêu cầu rút', value: `${fmtU(amount_u)} USDT`, inline: true },
          { name: 'Thiếu', value: `${fmtU(deficitU)} USDT` }
        ],
        color: 'warn',
        ephemeral: true
      });
    }

    const ref = `WD-${interaction.user.id}-${Date.now()}`;
    const username = `${interaction.user.username}#${interaction.user.discriminator ?? '0'}`;

    const newBalU = db.transaction(() => {
      q.updateBalU.run({ discord_id: interaction.user.id, delta_u: -Number(amount_u) }); // khóa tiền
      q.insertTx.run({
        discord_id: interaction.user.id,
        username,
        type: 'withdraw',
        method: 'USDT',
        amount_u: Number(amount_u),
        amount_vnd: 0,
        status: 'HELD',
        destination: wallet,
        reference: ref
      });
      const after = q.getPlayer.get(interaction.user.id);
      return BigInt(after?.balance_u ?? 0);
    })();

    await replyEmbed(interaction, {
      title: 'Yêu cầu rút đã tạo',
      fields: [
        { name: 'Phương thức', value: 'USDT', inline: true },
        { name: 'Số tiền', value: `${fmtU(amount_u)} USDT`, inline: true },
        { name: 'Trạng thái', value: 'HOLD(đã khóa tiền)', inline: true },
        { name: 'Ví', value: wallet },
        { name: 'Ref', value: `\`${ref}\`` },
        { name: 'Số dư còn lại', value: `${fmtU(newBalU)} USDT` }
      ],
      color: 'info',
      ephemeral: true
    });

    await logWithdraw(interaction.client, {
      title: 'WITHDRAW REQUEST (HELD)',
      fields: [
        { name: '👤', value: `<@${interaction.user.id}> (${username})` },
        { name: '💰', value: `${fmtU(amount_u)} USDT` },
        { name: '📍', value: `USDT: ${wallet}` },
        { name: '🔖 Mã giao dịch:', value: `${ref}` }
      ]
    });

    await logAudit(interaction.client, `withdraw_HOLDuid=${interaction.user.id} usdt=${fmtU(amount_u)} ref=${ref}`);
    return;
  }

  if (interaction.customId === 'modal_wd_BANK') {
    const amount = Number(interaction.fields.getTextInputValue('amount')?.trim());
    const bankName = interaction.fields.getTextInputValue('bank_name')?.trim();
    const bankAcc = interaction.fields.getTextInputValue('bank_acc')?.trim();
    const bankOwner = interaction.fields.getTextInputValue('bank_owner')?.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return replyEmbed(interaction, { title: 'Lỗi', desc: 'Số USDT không hợp lệ.', color: 'error', ephemeral: true });
    }

    const amount_u = toU(amount);
    if (amount_u < MIN_WITHDRAW_U) {
      return replyEmbed(interaction, {
        title: 'Từ chối',
        desc: `Số rút tối thiểu **${fmtU(MIN_WITHDRAW_U)} USDT**.`,
        color: 'warn',
        ephemeral: true
      });
    }

    const p = q.getPlayer.get(interaction.user.id) || { balance_u: 0 };
    const balU = BigInt(p.balance_u ?? 0);
    if (balU < amount_u) {
      const deficitU = amount_u - balU;
      return replyEmbed(interaction, {
        title: 'Thiếu số dư',
        fields: [
          { name: 'Số dư', value: `${fmtU(balU)} USDT`, inline: true },
          { name: 'Yêu cầu rút', value: `${fmtU(amount_u)} USDT`, inline: true },
          { name: 'Thiếu', value: `${fmtU(deficitU)} USDT` }
        ],
        color: 'warn',
        ephemeral: true
      });
    }

    const ref = `WD-${interaction.user.id}-${Date.now()}`;
    const username = `${interaction.user.username}#${interaction.user.discriminator ?? '0'}`;
    const dest = `${bankName} | ${bankAcc} | ${bankOwner}`;

    const newBalU = db.transaction(() => {
      q.updateBalU.run({ discord_id: interaction.user.id, delta_u: -Number(amount_u) }); // khóa tiền
      q.insertTx.run({
        discord_id: interaction.user.id,
        username,
        type: 'withdraw',
        method: 'BANK',
        amount_u: Number(amount_u),
        amount_vnd: 0,
        status: 'HELD',
        destination: dest,
        reference: ref
      });
      const after = q.getPlayer.get(interaction.user.id);
      return BigInt(after?.balance_u ?? 0);
    })();

    await replyEmbed(interaction, {
      title: 'Yêu cầu rút đã tạo',
      fields: [
        { name: 'Phương thức', value: 'BANK', inline: true },
        { name: 'Số tiền', value: `${fmtU(amount_u)} USDT`, inline: true },
        { name: 'Trạng thái', value: 'HOLD(đã khóa tiền)', inline: true },
        { name: 'Ngân hàng', value: bankName, inline: true },
        { name: 'Số TK', value: bankAcc, inline: true },
        { name: 'Chủ TK', value: bankOwner, inline: true },
        { name: 'Ref', value: `\`${ref}\`` },
        { name: 'Số dư còn lại', value: `${fmtU(newBalU)} USDT` }
      ],
      color: 'info',
      ephemeral: true
    });

    await logWithdraw(interaction.client, {
      title: 'WITHDRAW REQUEST (HELD)',
      fields: [
        { name: '👤', value: `<@${interaction.user.id}> (${username})` },
        { name: '💰', value: `${fmtU(amount_u)} USDT` },
        { name: '📍', value: `BANK: ${bankName} ${bankAcc} ${bankOwner}` },
        { name: '🔖 Mã giao dịch:', value: `${ref}` }
      ]
    });

    await logAudit(interaction.client, `withdraw_HOLDuid=${interaction.user.id} usdt=${fmtU(amount_u)} ref=${ref}`);
    return;
  }
}
