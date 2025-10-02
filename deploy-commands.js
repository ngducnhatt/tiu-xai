// deploy-commands.js
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const bet = new SlashCommandBuilder()
  .setName('bet')
  .setDescription('Cược tài/xỉu theo chữ số cuối của ID tin nhắn bot trả về (0–4 xỉu, 5–9 tài)')
  .addStringOption(o =>
    o.setName('chon')
      .setDescription('tai | xiu')
      .setRequired(true)
      .addChoices(
        { name: 'tài (5–9)', value: 'tai' },
        { name: 'xỉu (0–4)', value: 'xiu' }
      )
  )
  .addNumberOption(o =>
    o.setName('sotien')
      .setDescription('Số USDT (≥ 0.1)')
      .setRequired(true)
      .setMinValue(0.1)
  );

/* các lệnh khác giữ nguyên */
const nap = new SlashCommandBuilder()
  .setName('nap')
  .setDescription('Nạp tiền: QR (VND) hoặc Crypto (USDT)');

const rut = new SlashCommandBuilder()
  .setName('rut')
  .setDescription('Rút tiền: QR (VND) hoặc Crypto (USDT)');

const taikhoan = new SlashCommandBuilder()
  .setName('taikhoan')
  .setDescription('Xem số dư');

const help = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Hướng dẫn')
  .addStringOption(o =>
    o.setName('lenh')
      .setDescription('nap | rut | bet | taikhoan')
      .addChoices(
        { name: 'Nạp', value: 'nap' },
        { name: 'Rút', value: 'rut' },
        { name: 'bet', value: 'bet' },
        { name: 'Tài khoản', value: 'taikhoan' }
      )
  );

const commands = [bet, nap, rut, taikhoan, help].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands }
);
console.log('Success deploy commands.');
