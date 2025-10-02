import { q, db } from "../db.js";
import { fmtU } from "../money.js";
import { replyEmbed } from "../ui.js";

function getLastTxs(uid) {
  const stmt =
    q?.lastTxByUser ||
    db.prepare(
      `SELECT type, status, method, amount_u, reference
     FROM transactions
     WHERE discord_id = ?
     ORDER BY id DESC
     LIMIT 5`
    );
  return stmt.all(uid);
}

function getLastBets(uid) {
  const stmt =
    q?.lastBetsByUser ||
    db.prepare(
      `SELECT choice, amount_u, result, message_id, last_digit
     FROM bets
     WHERE discord_id = ?
     ORDER BY id DESC
     LIMIT 5`
    );
  return stmt.all(uid);
}

export async function handleAccountCommand(interaction) {
  try {
    const uid = interaction.user.id;
    const p = q.getPlayer.get(uid) || { balance_u: 0 };
    const balU = BigInt(p.balance_u ?? 0);

    const txs = getLastTxs(uid);
    const bets = getLastBets(uid);

    const txLines = txs.length
      ? txs
          .map(
            (t) =>
              `• **${t.type}/${t.status}** • ${t.method} • ${fmtU(
                BigInt(t.amount_u)
              )} USDT • \`${t.reference}\``
          )
          .join("\n")
      : "—";

    const betLines = bets.length
      ? bets
          .map(
            (b) =>
              `• ${b.choice.toUpperCase()} • ${fmtU(BigInt(b.amount_u))} • ${
                b.result
              } • msg:\`${b.message_id}\` • d:${b.last_digit}`
          )
          .join("\n")
      : "—";

    return replyEmbed(interaction, {
      title: "👤 Tài khoản",
      fields: [
        { name: "💼 Số dư", value: `**${fmtU(balU)} USDT**` },
        { name: "🧾 Giao dịch gần đây", value: txLines },
        { name: "🎰 Cược gần đây", value: betLines },
      ],
      color: "info",
      ephemeral: true,
    });
  } catch (e) {
    console.error(e);
    return replyEmbed(interaction, {
      title: "❗ Lỗi",
      fields: [
        { name: "Chi tiết", value: "Không đọc được dữ liệu tài khoản." },
      ],
      color: "error",
      ephemeral: true,
    });
  }
}
