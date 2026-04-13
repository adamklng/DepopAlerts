const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./db');
const { buildWatchMessage, createPendingSearch } = require('./buttons');

const watchCommand = new SlashCommandBuilder()
  .setName('watch')
  .setDescription('Create a saved search for Depop listings')
  .addStringOption(opt =>
    opt.setName('query').setDescription('Search keywords').setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('size').setDescription('Sizes (comma-separated, e.g. S,M,L or US 9,US 10)').setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('category').setDescription('Category').setRequired(false)
      .addChoices(
        { name: 'All Men', value: 'male' },
        { name: 'All Women', value: 'female' },
        { name: 'Men › Tops', value: 'menswear.tops' },
        { name: 'Men › Bottoms', value: 'menswear.bottoms' },
        { name: 'Men › Coats and jackets', value: 'menswear.coats-jackets' },
        { name: 'Men › Footwear', value: 'menswear.footwear' },
        { name: 'Men › Accessories', value: 'menswear.accessories' },
        { name: 'Women › Tops', value: 'womenswear.tops' },
        { name: 'Women › Bottoms', value: 'womenswear.bottoms' },
        { name: 'Women › Dresses', value: 'womenswear.dresses' },
        { name: 'Women › Coats and jackets', value: 'womenswear.coats-jackets' },
        { name: 'Women › Footwear', value: 'womenswear.footwear' },
        { name: 'Women › Accessories', value: 'womenswear.accessories' },
      )
  )
  .addNumberOption(opt =>
    opt.setName('min_price').setDescription('Minimum price').setRequired(false)
  )
  .addNumberOption(opt =>
    opt.setName('max_price').setDescription('Maximum price').setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('condition').setDescription('Condition').setRequired(false)
      .addChoices(
        { name: 'Brand New', value: 'BRAND_NEW' },
        { name: 'Like New', value: 'LIKE_NEW' },
        { name: 'Used - Excellent', value: 'USED_EXCELLENT' },
        { name: 'Used - Good', value: 'USED_GOOD' },
        { name: 'Used - Fair', value: 'USED_FAIR' },
      )
  );

const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('List all saved searches in this server');

const pauseCommand = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pause a saved search')
  .addStringOption(opt =>
    opt.setName('search').setDescription('Name of the saved search').setRequired(true).setAutocomplete(true)
  );

const resumeCommand = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Resume a paused saved search')
  .addStringOption(opt =>
    opt.setName('search').setDescription('Name of the saved search').setRequired(true).setAutocomplete(true)
  );

const deleteCommand = new SlashCommandBuilder()
  .setName('delete')
  .setDescription('Delete a saved search')
  .addStringOption(opt =>
    opt.setName('search').setDescription('Name of the saved search').setRequired(true).setAutocomplete(true)
  );

const editCommand = new SlashCommandBuilder()
  .setName('edit')
  .setDescription('Edit a saved search')
  .addStringOption(opt =>
    opt.setName('search').setDescription('Name of the saved search').setRequired(true).setAutocomplete(true)
  );

const setchannelCommand = new SlashCommandBuilder()
  .setName('setchannel')
  .setDescription('Set the channel where new item notifications are sent')
  .addChannelOption(opt =>
    opt.setName('channel').setDescription('The notification channel').setRequired(true)
  );

function handleAutocomplete(interaction) {
  const watches = db.getWatchesByGuild(interaction.guildId);
  const focused = interaction.options.getFocused().toLowerCase();
  const commandName = interaction.commandName;

  let filtered = watches;
  if (commandName === 'pause') filtered = watches.filter(w => w.active);
  if (commandName === 'resume') filtered = watches.filter(w => !w.active);

  const choices = filtered
    .filter(w => w.query.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(w => ({ name: `${w.query} (#${w.id})`, value: String(w.id) }));

  interaction.respond(choices).catch(() => {});
}

async function handleCommand(interaction) {
  const { commandName } = interaction;

  try {
    if (commandName === 'watch') {
      const query = interaction.options.getString('query');
      const size = interaction.options.getString('size') || null;
      const category = interaction.options.getString('category') || null;
      const minPrice = interaction.options.getNumber('min_price') || null;
      const maxPrice = interaction.options.getNumber('max_price') || null;
      const condition = interaction.options.getString('condition') || null;

      const pendingId = createPendingSearch({
        guild_id: interaction.guildId,
        channel_id: interaction.channelId,
        user_id: interaction.user.id,
        query,
      });

      // Apply inline filters if provided
      const pending = require('./buttons').getWatch(pendingId);
      if (pending) {
        if (size) pending.size = size;
        if (category) pending.category = category;
        if (minPrice) pending.min_price = minPrice;
        if (maxPrice) pending.max_price = maxPrice;
        if (condition) pending.condition = condition;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const msg = await interaction.channel.send(buildWatchMessage(pendingId));
      if (pending) pending.message_id = msg.id;
      await interaction.deleteReply();
    } else if (commandName === 'pause') {
      const wId = parseInt(interaction.options.getString('search'));
      const watch = db.getWatch(wId);
      if (!watch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
      db.pauseWatch(wId);
      console.log(`[Bot] Paused saved search "${watch.query}" (#${wId})`);
      await interaction.reply({ content: `Paused **${watch.query}** (#${wId})`, flags: MessageFlags.Ephemeral });

    } else if (commandName === 'resume') {
      const wId = parseInt(interaction.options.getString('search'));
      const watch = db.getWatch(wId);
      if (!watch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
      db.activateWatch(wId);
      console.log(`[Bot] Resumed saved search "${watch.query}" (#${wId})`);
      await interaction.reply({ content: `Resumed **${watch.query}** (#${wId})`, flags: MessageFlags.Ephemeral });

    } else if (commandName === 'delete') {
      const wId = parseInt(interaction.options.getString('search'));
      const watch = db.getWatch(wId);
      if (!watch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
      const name = watch.query;
      db.deleteWatch(wId, interaction.guildId);
      console.log(`[Bot] Deleted saved search "${name}" (#${wId})`);
      await interaction.reply({ content: `Deleted **${name}** (#${wId})`, flags: MessageFlags.Ephemeral });

    } else if (commandName === 'edit') {
      const wId = parseInt(interaction.options.getString('search'));
      const editWatch = db.getWatch(wId);
      if (!editWatch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
      console.log(`[Bot] Editing saved search "${editWatch.query}" (#${wId})`);
      const { createPendingSearch: cps, getWatch: gw, buildWatchMessage: bwm } = require('./buttons');
      const pendingId = cps({
        guild_id: editWatch.guild_id,
        channel_id: editWatch.channel_id,
        user_id: editWatch.user_id,
        query: editWatch.query,
      });
      const pending = gw(pendingId);
      pending.size = editWatch.size;
      pending.condition = editWatch.condition;
      pending.category = editWatch.category;
      pending.min_price = editWatch.min_price;
      pending.max_price = editWatch.max_price;
      pending.message_id = editWatch.message_id;
      pending._editingDbId = wId;
      const msg = bwm(pendingId);
      await interaction.reply({ ...msg, flags: MessageFlags.Ephemeral });

    } else if (commandName === 'list') {
      const watches = db.getWatchesByGuild(interaction.guildId);

      if (!watches.length) {
        return interaction.reply({ content: 'No saved searches in this server.', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('Saved Searches')
        .setColor(0xff2300)
        .setDescription(
          watches.map(w => {
            const filters = [];
            if (w.category) filters.push(`Category: ${w.category.replace('||', ' \u203A ')}`);
            if (w.min_price) filters.push(`Min: $${w.min_price}`);
            if (w.max_price) filters.push(`Max: $${w.max_price}`);
            if (w.size) filters.push(`Size: ${w.size}`);
            if (w.condition) filters.push(`Condition: ${w.condition}`);
            const status = w.active ? '\uD83D\uDFE2' : '\u23F8\uFE0F';
            return `${status} **#${w.id}** \u2014 "${w.query}" ${filters.length ? `(${filters.join(', ')})` : ''}`;
          }).join('\n')
        );

      const searchOptions = watches.map(w => ({
        label: `#${w.id} \u2014 "${w.query}"`,
        value: String(w.id),
        description: w.active ? 'Active' : 'Paused',
      }));

      const activeWatches = watches.filter(w => w.active);
      const pausedWatches = watches.filter(w => !w.active);

      const buttons = [];
      buttons.push(new ButtonBuilder().setCustomId('listaction_edit').setLabel('Edit').setStyle(ButtonStyle.Primary));
      if (activeWatches.length) buttons.push(new ButtonBuilder().setCustomId('listaction_pause').setLabel('Pause').setStyle(ButtonStyle.Secondary));
      if (pausedWatches.length) buttons.push(new ButtonBuilder().setCustomId('listaction_resume').setLabel('Resume').setStyle(ButtonStyle.Success));
      buttons.push(new ButtonBuilder().setCustomId('listaction_delete').setLabel('Delete').setStyle(ButtonStyle.Danger));
      buttons.push(new ButtonBuilder().setCustomId('listaction_close').setLabel('Close').setStyle(ButtonStyle.Secondary));

      const row = new ActionRowBuilder().addComponents(buttons);
      await interaction.reply({ embeds: [embed], components: [row] });
    } else if (commandName === 'setchannel') {
      const channel = interaction.options.getChannel('channel');
      db.setNotifyChannel(interaction.guildId, channel.id);
      await interaction.reply({ content: `Notifications will be sent to <#${channel.id}>`, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error(`Command ${commandName} error:`, err);
    const reply = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}

module.exports = {
  commands: [watchCommand, listCommand, pauseCommand, resumeCommand, deleteCommand, editCommand, setchannelCommand],
  handleCommand,
  handleAutocomplete,
};
