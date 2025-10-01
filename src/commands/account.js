import { q } from '../db.js';
import { fmtU, usdtUToVnd } from '../money.js';
import { replyEmbed } from '../ui.js';
import { CFG } from '../config.js';

export async function handleAccountCommand(interaction) {
  const p = q.getPlayer.get(interaction.user.id) || { balance_u: 0 };
  const balU = BigInt(p.balance_u ?? 0);
  const vnd = usdtUToVnd(balU);

  return replyEmbed(interaction, {
    title: 'Tài khoản',
    fields: [
      { name: '💼 Số dư', value: `${fmtU(balU)} USDT`, inline: false },
      { name: '💱 Quy đổi', value: `${vnd.toLocaleString('vi-VN')} VND`, inline: false },
      { name: 'Nạp/Rút', value: `Sử dụng /nap và /rut`, inline: false }
    ],
    color: 'info',
    footer: `Tỷ giá tham chiếu: 1 USDT = ${CFG.vndPerUsdt.toLocaleString('vi-VN')} VND`
  });
}
