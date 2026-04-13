require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { commands } = require('./src/commands');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands.map(c => c.toJSON()) },
    );

    console.log('Commands registered successfully.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
})();
