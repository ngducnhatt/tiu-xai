// src/index.js
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { CFG, isAdmin } from './config.js';
import { setBool, getBool, q, db, qtx } from './db.js';
import { toU, fmtU } from './money.js';
import { logDeposit, logWithdraw, logAudit } from './logging.js';
import { replyEmbed, makeEmbed } from './ui.js';

import { handleBetCommand } from './commands/bet.js';
import {
  handleDepositCommand,
  handleDepositButtons,
  handleDepositModals
} from './commands/deposit.js';
import {
  handleWithdrawCommand,
  handleWithdrawButtons,
  handleWithdrawModals
} from './commands/withdraw.js';
import { handleAccountCommand } from './commands/account.js';
import { handleHelpCommand } from './commands/help.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, c => console.log(`Logged in as ${c.user.tag}`));

async function notifyUser(client, userId, { title, desc, color='info' }) {
  const eb = makeEmbed({ title, desc, color });
  const u = await client.users.fetch(userId).catch(()=>null);
  if (u) {
    try { await u.send({ embeds: [eb] }); return true; } catch {}
  }
  await logAudit(client, `DM thất bại -> notify <@${userId}>: ${title}\n${desc}`);
  return false;
}

/* ========== Slash + Component handlers ========== */
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;
      if (name === 'bet') return handleBetCommand(interaction);
      if (name === 'nap') return handleDepositCommand(interaction);
      if (name === 'rut') return handleWithdrawCommand(interaction);
      if (name === 'taikhoan') return handleAccountCommand(interaction);
      if (name === 'help') return handleHelpCommand(interaction);
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('dep_')) return handleDepositButtons(interaction);
      if (interaction.customId.startsWith('wd_'))  return handleWithdrawButtons(interaction);
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('modal_dep_')) return handleDepositModals(interaction);
      if (interaction.customId.startsWith('modal_wd_'))  return handleWithdrawModals(interaction);
    }
  } catch (e) {
    console.error(e);
    if (interaction.isRepliable && !interaction.replied) {
      replyEmbed(interaction, { title:'Lỗi', desc:'Lỗi không xác định.', color:'error' }).catch(()=>{});
    }
  }
});

/* ========== Admin prefix commands ========== */
/*
  -status | -statuslocks
  -on <deposit|withdraw|all>
  -off <deposit|withdraw|all>
  -napid <discord_id> <usdt> [note]
  -rutid <discord_id> <usdt> [force] [note]    // cảnh báo nếu có HELD
  -approvewd <ref>                              // HELD -> APPROVED (không trừ thêm)
  -rejectwd <ref> [reason...]                   // HELD -> REJECTED + hoàn tiền
*/
client.on(Events.MessageCreate, async (msg) => {
  try {
    if (msg.author.bot || !msg.guild) return;
    const content = (msg.content || '').trim();
    if (!content.startsWith('-')) return;
    if (!isAdmin(msg.author.id)) return;

    const [cmd, ...rest] = content.slice(1).split(/\s+/);
    const mReply = (title, desc, color='neutral') =>
      msg.reply({ embeds: [makeEmbed({ title, desc, color })] });

    if (cmd === 'status' || cmd === 'statuslocks') {
      const dep = getBool('deposit_enabled', true);
      const wd  = getBool('withdraw_enabled', true);
      return mReply('Trạng thái khóa', `Deposit: **${dep?'ON':'OFF'}** | Withdraw: **${wd?'ON':'OFF'}**`, 'info');
    }

    if (cmd === 'on') {
      const target = (rest[0]||'all').toLowerCase();
      if (target === 'deposit' || target === 'all') setBool('deposit_enabled', true);
      if (target === 'withdraw' || target === 'all') setBool('withdraw_enabled', true);
      return mReply('Đã bật', `Đối tượng: **${target}**`, 'ok');
    }

    if (cmd === 'off') {
      const target = (rest[0]||'all').toLowerCase();
      if (target === 'deposit' || target === 'all') setBool('deposit_enabled', false);
      if (target === 'withdraw' || target === 'all') setBool('withdraw_enabled', false);
      return mReply('Đã tắt', `Đối tượng: **${target}**`, 'warn');
    }

    if (cmd === 'napid') {
      const [id, usdtStr, ...noteArr] = rest;
      const usdt = Number(usdtStr);
      const note = noteArr.join(' ') || 'ADMIN-ADJUST';
      if (!/^\d{10,}$/.test(id) || !Number.isFinite(usdt) || usdt <= 0)
        return mReply('Sai cú pháp', 'Dùng: `-napid <discord_id> <usdt> [note]`', 'error');

      let username = 'unknown#0000';
      try { const u = await client.users.fetch(id); username = `${u.username}#${u.discriminator ?? '0'}`; } catch {}
      const amount_u = toU(usdt);
      const ref = `ADMIN-DEP-${id}-${Date.now()}`;

      const afterU = (() => {
        const cur = q.getPlayer.get(id);
        if (!cur) q.upsertPlayer.run({ discord_id:id, username, balance_u:0 });
        q.updateBalU.run({ discord_id:id, delta_u:Number(amount_u) });
        q.insertTx.run({
          discord_id:id, username, type:'deposit', method:'ADMIN',
          amount_u:Number(amount_u), amount_vnd:0, status:'APPROVED',
          destination:note, reference:ref
        });
        const end = q.getPlayer.get(id); return BigInt(end?.balance_u ?? 0);
      })();

      await logDeposit(client, { title:'ADMIN DEPOSIT', desc:`👤 <@${id}> (${username})\nUSDT: ${usdt}\n🔖 Mã giao dịch: \`${ref}\`` });
      await logAudit(client, `admin_deposit uid=${id} usdt=${usdt} ref=${ref}`);
      await notifyUser(client, id, {
        title: 'Nạp đã được cộng',
        desc: `+${fmtU(amount_u)} USDT vào tài khoản của bạn.\nMã giao dịch: \`${ref}\`\nSố dư mới: **${fmtU(afterU)} USDT**`,
        color: 'ok'
      });
      return mReply('Đã cộng tiền',
        `Cho <@${id}> • **+${fmtU(amount_u)} USDT**\nSố dư mới: **${fmtU(afterU)} USDT**\nMã giao dịch: \`${ref}\``,
        'ok'
      );
    }

    if (cmd === 'rutid') {
      const [id, usdtStr, forceStr, ...noteArr] = rest;
      const usdt = Number(usdtStr);
      const force = String(forceStr||'').toLowerCase() === 'true';
      const note = (force ? noteArr : [forceStr, ...noteArr]).filter(Boolean).join(' ') || 'ADMIN-ADJUST';
      if (!/^\d{10,}$/.test(id) || !Number.isFinite(usdt) || usdt <= 0)
        return mReply('Sai cú pháp', 'Dùng: `-rutid <discord_id> <usdt> [force] [note]`', 'error');

      const held = db.prepare(`
        SELECT reference, amount_u FROM transactions
        WHERE discord_id=? AND type='withdraw' AND status='HELD'
        ORDER BY id DESC LIMIT 1
      `).get(id);
      if (held && !force) {
        return mReply(
          'Đang có yêu cầu HELD',
          `User có lệnh rút **HELD** ref=\`${held.reference}\`.\n` +
          `Duyệt: \`-approvewd ${held.reference}\`\nHoàn: \`-rejectwd ${held.reference} [lý do]\`\n` +
          `Nếu vẫn muốn trừ trực tiếp: thêm \`true\` sau số tiền (force).`,
          'warn'
        );
      }

      let username = 'unknown#0000';
      try { const u = await client.users.fetch(id); username = `${u.username}#${u.discriminator ?? '0'}`; } catch {}
      const amount_u = toU(usdt);
      const p = q.getPlayer.get(id) || { balance_u: 0 };
      const balU = BigInt(p.balance_u ?? 0);
      if (!force && balU < amount_u)
        return mReply('Thiếu số dư', `Balance: **${fmtU(balU)}** < cần trừ: **${fmtU(amount_u)}**. Dùng \`true\` nếu muốn force.`, 'warn');

      const ref = `ADMIN-WD-${id}-${Date.now()}`;
      const afterU = (() => {
        const cur = q.getPlayer.get(id);
        if (!cur) q.upsertPlayer.run({ discord_id:id, username, balance_u:0 });
        q.updateBalU.run({ discord_id:id, delta_u:-Number(amount_u) });
        q.insertTx.run({
          discord_id:id, username, type:'withdraw', method:'ADMIN',
          amount_u:Number(amount_u), amount_vnd:0, status:'APPROVED',
          destination:note, reference:ref
        });
        const end = q.getPlayer.get(id); return BigInt(end?.balance_u ?? 0);
      })();

      await logWithdraw(client, { title:'ADMIN WITHDRAW', desc:`👤 <@${id}> (${username})\nUSDT: ${usdt}\n🔖 Mã giao dịch: \`${ref}\`` });
      await logAudit(client, `admin_withdraw uid=${id} usdt=${usdt} ref=${ref}`);
      await notifyUser(client, id, {
        title: 'Điều chỉnh trừ tiền',
        desc: `-${fmtU(amount_u)} USDT bởi admin.\nMã giao dịch: \`${ref}\`\nSố dư mới: **${fmtU(afterU)} USDT**`,
        color: 'warn'
      });
      return mReply('Đã trừ tiền',
        `Của <@${id}> • **-${fmtU(amount_u)} USDT**\nSố dư mới: **${fmtU(afterU)} USDT**\nMã giao dịch: \`${ref}\``,
        'ok'
      );
    }

    if (cmd === 'approvewd') {
      const ref = (rest[0]||'').trim();
      if (!ref) return mReply('Sai cú pháp', 'Dùng: `-approvewd <ref>`', 'error');

      const tx = qtx.getByRef.get(ref);
      if (!tx) return mReply('Không tìm thấy', 'Ref không tồn tại.', 'error');
      if (tx.type !== 'withdraw') return mReply('Sai loại', 'Ref này không phải rút.', 'error');
      if (tx.status !== 'HELD') return mReply('Sai trạng thái', `Hiện tại: **${tx.status}**. Chỉ duyệt khi **HELD**.`, 'warn');

      qtx.setStatusByRef.run({ reference: ref, status: 'APPROVED', destination: null });
      await logWithdraw(client, {
        title:'WITHDRAW APPROVED',
        desc:`👤 <@${tx.discord_id}>\nSố tiền: ${(tx.amount_u/1e6).toLocaleString('vi-VN')} USDT\nMã giao dịch: \`${ref}\``
      });
      await logAudit(client, `approve_withdraw ref=${ref}`);
      await notifyUser(client, tx.discord_id, {
        title: 'Rút đã duyệt',
        desc: `Yêu cầu rút **${(tx.amount_u/1e6).toLocaleString('vi-VN')} USDT** đã **APPROVED**.\nMã giao dịch: \`${ref}\``,
        color: 'ok'
      });
      return mReply('Đã APPROVED', `Mã giao dịch: \`${ref}\`. Không trừ thêm tiền (đã khóa từ trước).`, 'ok');
    }

    if (cmd === 'rejectwd') {
      const ref = (rest[0]||'').trim();
      const reason = rest.slice(1).join(' ') || 'REJECTED';
      if (!ref) return mReply('Sai cú pháp', 'Dùng: `-rejectwd <ref> [reason...]`', 'error');

      const tx = qtx.getByRef.get(ref);
      if (!tx) return mReply('Không tìm thấy', 'Ref không tồn tại.', 'error');
      if (tx.type !== 'withdraw') return mReply('Sai loại', 'Ref này không phải rút.', 'error');
      if (tx.status !== 'HELD') return mReply('Sai trạng thái', `Hiện tại: **${tx.status}**. Chỉ hoàn khi **HELD**.`, 'warn');

      db.transaction(() => {
        q.updateBalU.run({ discord_id: tx.discord_id, delta_u: Number(tx.amount_u) });
        qtx.setStatusByRef.run({ reference: ref, status: 'REJECTED', destination: reason });
      })();

      await logWithdraw(client, {
        title:'WITHDRAW REJECTED',
        desc:`👤 <@${tx.discord_id}>\nHoàn: ${(tx.amount_u/1e6).toLocaleString('vi-VN')} USDT\nMã giao dịch: \`${ref}\`\nLý do: ${reason}`
      });
      await logAudit(client, `reject_withdraw ref=${ref}`);
      await notifyUser(client, tx.discord_id, {
        title: 'Rút bị từ chối',
        desc: `Yêu cầu rút **${(tx.amount_u/1e6).toLocaleString('vi-VN')} USDT** đã **REJECTED**.\nTiền đã được hoàn lại.\nMã giao dịch: \`${ref}\`\nLý do: ${reason}`,
        color: 'warn'
      });
      return mReply('Đã REJECTED', `Mã giao dịch: \`${ref}\` • Đã **hoàn tiền** cho user.`, 'ok');
    }

    return mReply('Không hỗ trợ', 'Lệnh admin không hợp lệ.', 'warn');

  } catch (e) {
    console.error(e);
    return msg.reply({ embeds: [makeEmbed({ title:'Lỗi', desc:'Lỗi không xác định.', color:'error' })] });
  }
});

client.login(CFG.token);
