import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const bet = new SlashCommandBuilder()
  .setName('bet')
  .setDescription('Cược theo (hàng chục + hàng đơn vị) % 10 của ID tin nhắn')
  .addStringOption(o =>
    o.setName('chon').setDescription('chan | le | 0').setRequired(true)
     .addChoices(
       { name: 'chan', value: 'chan' },
       { name: 'le',   value: 'le'   },
       { name: '0',    value: '0'    }
     )
  )
  .addNumberOption(o =>
    o.setName('sotien').setDescription('Số USDT (≥ 0.1)').setRequired(true).setMinValue(0.1)
  );

const nap = new SlashCommandBuilder().setName('nap').setDescription('Nạp tiền: QR (VND quy đổi) hoặc Crypto (USDT)');
const rut = new SlashCommandBuilder().setName('rut').setDescription('Rút tiền: HOLD ngay và chờ admin duyệt');
const taikhoan = new SlashCommandBuilder().setName('taikhoan').setDescription('Xem số dư và 5 giao dịch gần nhất');
const help = new SlashCommandBuilder()
  .setName('help').setDescription('Hướng dẫn nhanh')
  .addStringOption(o => o.setName('topic').setDescription('nap | rut | bet | taikhoan')
     .addChoices({name:'nap',value:'nap'},{name:'rut',value:'rut'},{name:'bet',value:'bet'},{name:'taikhoan',value:'taikhoan'}));

const cmds = [bet, nap, rut, taikhoan, help].map(c => c.toJSON());
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: cmds });
console.log('Đã đăng ký slash commands.');
