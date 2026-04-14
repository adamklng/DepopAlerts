require('dotenv').config();

// Discord webhook logger — buffers logs and sends every 5 seconds
const LOG_WEBHOOK = 'https://discord.com/api/webhooks/1493758722495873175/Le5Qoib4th4iTUJvxvQKZqSlWQwSEh0C2MiIvc-oxJVmuGxuKpZhzQvldiIaGEcSymw0';
(() => {
  const origLog = console.log;
  const origError = console.error;
  let buffer = '';

  setInterval(async () => {
    if (!buffer) return;
    const msg = buffer.slice(0, 1900);
    buffer = '';
    await fetch(LOG_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '```\n' + msg + '\n```' }),
    }).catch(() => {});
  }, 5000);

  console.log = (...args) => { origLog(...args); buffer += args.join(' ') + '\n'; };
  console.error = (...args) => { origError(...args); buffer += '[ERROR] ' + args.join(' ') + '\n'; };
})();

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
