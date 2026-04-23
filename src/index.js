require('dotenv').config();


const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const { handleCommand, handleAutocomplete } = require('./commands');
const { handleButton, handleModal, handleSelectMenu } = require('./buttons');
const { startPolling } = require('./monitor');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  const interval = parseInt(process.env.POLL_INTERVAL) ?? 30000;
  startPolling(client, interval);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      return handleAutocomplete(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const reply = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// Graceful shutdown
const { closeBrowser } = require('./depop');
async function shutdown() {
  console.log('[Bot] Shutting down...');
  await closeBrowser();
  client.destroy();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
