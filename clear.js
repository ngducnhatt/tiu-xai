import "dotenv/config";
import { REST, Routes } from "discord.js";

const namesArg = process.argv[2] || "";
const names = new Set(
  namesArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
if (!names.size) {
  console.log("Usage: node scripts/delete-by-name.js name1,name2");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

// Guild
const guildCmds = await rest.get(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
);
for (const cmd of guildCmds) {
  if (names.has(cmd.name)) {
    await rest.delete(
      Routes.applicationGuildCommand(
        process.env.CLIENT_ID,
        process.env.GUILD_ID,
        cmd.id
      )
    );
    console.log(`🗑️  Guild: deleted /${cmd.name}`);
  }
}

// Global
const globalCmds = await rest.get(
  Routes.applicationCommands(process.env.CLIENT_ID)
);
for (const cmd of globalCmds) {
  if (names.has(cmd.name)) {
    await rest.delete(Routes.applicationCommand(process.env.CLIENT_ID, cmd.id));
    console.log(`🗑️  Global: deleted /${cmd.name}`);
  }
}

console.log("✅ Done.");
