import { q, db } from "../db.js";
import { MIN_BET_U, toU, fmtU, ratioToU, mulRatioU } from "../money.js";
import { CFG } from "../config.js";
import { replyEmbed, editEmbed } from "../ui.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const lastDigit = (msgId) => Number(msgId.at(-1));
const isWin = (choice, d) => (choice === "xiu" ? d <= 4 : d >= 5);
const WIN_RATIO_U = ratioToU(1 - Number(CFG.winFeePct || 0) / 100);

export async function handleBetCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const choice = interaction.options.getString("chon"); // 'tai' | 'xiu'
    const amount = interaction.options.getNumber("sotien"); // USDT

    if (!["tai", "xiu"].includes(choice)) {
      return editEmbed(interaction, {
        title: "❗ Lỗi",
        fields: [{ name: "📝 Chi tiết", value: "Chọn **tài** hoặc **xỉu**." }],
        color: "error",
      });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return editEmbed(interaction, {
        title: "❗ Lỗi",
        fields: [{ name: "📝 Chi tiết", value: "Số tiền không hợp lệ." }],
        color: "error",
      });
    }

    const amount_u = toU(amount);
    if (amount_u < MIN_BET_U) {
      return editEmbed(interaction, {
        title: "🚫 Từ chối",
        fields: [{ name: "🔽 Tối thiểu", value: `${fmtU(MIN_BET_U)} USDT` }],
        color: "warn",
      });
    }

    const discordId = interaction.user.id;
    const username = `${interaction.user.username}#${
      interaction.user.discriminator ?? "0"
    }`;
    const p = q.getPlayer.get(discordId) || { balance_u: 0 };
    const balU = BigInt(p.balance_u ?? 0);
    if (balU < amount_u) {
      return editEmbed(interaction, {
        title: "💳 Thiếu số dư",
        fields: [
          { name: "💼 Số dư", value: `${fmtU(balU)} USDT`, inline: true },
          { name: "🎯 Cược", value: `${fmtU(amount_u)} USDT`, inline: true },
          { name: "ℹ️ Gợi ý", value: "Dùng **/nap** để nạp thêm." },
        ],
        color: "warn",
      });
    }

    await editEmbed(interaction, {
      title: "⏳ Đang xử lý…",
      fields: [{ name: "Trạng thái", value: "Chờ kết quả." }],
      color: "neutral",
    });

    const msg = await interaction.fetchReply();
    const msgId = msg.id;
    const d = lastDigit(msgId);
    const win = isWin(choice, d);

    let payout_u = 0n,
      net_u = 0n;
    if (win) {
      payout_u = mulRatioU(amount_u, WIN_RATIO_U); // trả sau phí
      net_u = payout_u;
    } else {
      net_u = -amount_u;
    }

    const newBalU = db.transaction(() => {
      const cur = q.getPlayer.get(discordId);
      if (!cur)
        q.upsertPlayer.run({ discord_id: discordId, username, balance_u: 0 });
      q.insertBet.run({
        discord_id: discordId,
        username,
        choice,
        amount_u: Number(amount_u),
        message_id: msgId,
        last_digit: d,
        result: win ? "WIN" : "LOSE",
        payout_u: Number(payout_u),
        net_change_u: Number(net_u),
      });
      q.updateBalU.run({ discord_id: discordId, delta_u: Number(net_u) });
      const after = q.getPlayer.get(discordId);
      return BigInt(after?.balance_u ?? 0);
    })();

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("🔗 Cách kiểm tra kết quả")
          .setURL("http://example.com/")
      ),
    ];

    return editEmbed(interaction, {
      title: "🎰 Kết quả cược",
      fields: [
        { name: "🆔", value: `\`${msgId}\``, inline: true },
        { name: "#️⃣ Số cuối", value: String(d), inline: true },
        { name: "📌 Kết quả", value: d <= 4 ? "XỈU" : "TÀI", inline: true },

        { name: "🎯 Bạn chọn", value: choice.toUpperCase(), inline: true },
        { name: "💰 Cược", value: `${fmtU(amount_u)} USDT`, inline: true },

        win
          ? { name: "✅ Kết luận", value: "THẮNG", inline: true }
          : { name: "❌ Kết luận", value: "THUA", inline: true },
        win
          ? {
              name: "📈 Trả (sau phí)",
              value: `${fmtU(payout_u)} USDT`,
              inline: true,
            }
          : { name: "📉 Mất", value: `${fmtU(amount_u)} USDT`, inline: true },

        { name: "🔁 Biến động", value: `${fmtU(net_u)} USDT`, inline: true },
        { name: "💼 Số dư mới", value: `${fmtU(newBalU)} USDT`, inline: true },

        {
          name: "📜 Luật",
          value:
            "Dùng **chữ số cuối** của ID tin nhắn: `0–4 = xỉu`, `5–9 = tài`.",
        },
      ],
      color: win ? "ok" : "error",
      components,
    });
  } catch (err) {
    console.error("handleBetCommand error:", err);
    if (!interaction.deferred && !interaction.replied) {
      return replyEmbed(interaction, {
        title: "❗ Lỗi hệ thống",
        desc: "Thử lại sau.",
        color: "error",
      });
    }
    return editEmbed(interaction, {
      title: "❗ Lỗi hệ thống",
      fields: [{ name: "📝 Chi tiết", value: "Thử lại sau." }],
      color: "error",
    });
  }
}
