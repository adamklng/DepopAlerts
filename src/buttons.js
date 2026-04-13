const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const db = require('./db');

// Pending searches that haven't been saved yet (in-memory, keyed by a temp ID)
const pendingSearches = new Map();
let pendingIdCounter = 0;

const CONDITIONS = [
  { label: 'Brand New', value: 'BRAND_NEW' },
  { label: 'Like New', value: 'LIKE_NEW' },
  { label: 'Used - Excellent', value: 'USED_EXCELLENT' },
  { label: 'Used - Good', value: 'USED_GOOD' },
  { label: 'Used - Fair', value: 'USED_FAIR' },
];

const SIZE_CATEGORIES = {
  'Menswear': {
    'Tops': ['One size', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'],
    'Bottoms (Letter)': ['One size', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
    'Bottoms (Waist)': ['26"', '27"', '28"', '29"', '30"', '31"', '32"', '33"', '34"', '36"', '38"', '40"', '42"', '44"'],
    'Shoes': ['US 6', 'US 6.5', 'US 7', 'US 7.5', 'US 8', 'US 8.5', 'US 9', 'US 9.5', 'US 10', 'US 10.5', 'US 11', 'US 11.5', 'US 12', 'US 12.5', 'US 13', 'US 14', 'US 15'],
  },
  'Womenswear': {
    'Tops': ['One size', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20'],
    'Bottoms (Letter)': ['One size', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Bottoms (Waist)': ['23"', '24"', '25"', '26"', '27"', '28"', '29"', '30"', '31"', '32"', '34"', '36"'],
    'Bottoms (Number)': ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '14', '16', '18', '20'],
    'Shoes': ['US 5', 'US 5.5', 'US 6', 'US 6.5', 'US 7', 'US 7.5', 'US 8', 'US 8.5', 'US 9', 'US 9.5', 'US 10', 'US 10.5', 'US 11', 'US 11.5', 'US 12'],
  },
};

function parseWatchId(str) {
  if (str.startsWith('p')) return str;
  return parseInt(str);
}

function getWatch(watchId) {
  if (typeof watchId === 'string' && watchId.startsWith('p')) {
    return pendingSearches.get(watchId) || null;
  }
  return db.getWatch(watchId);
}

const PENDING_TTL = 15 * 60 * 1000; // 15 minutes

function createPendingSearch({ guild_id, channel_id, user_id, query }) {
  const id = `p${++pendingIdCounter}`;
  pendingSearches.set(id, {
    id, guild_id, channel_id, user_id, query,
    min_price: null, max_price: null, size: null,
    condition: null, category: null, message_id: null,
    active: 0, seeded: 0,
    _createdAt: Date.now(),
  });
  return id;
}

// Clean up stale pending searches every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, search] of pendingSearches) {
    if (now - search._createdAt > PENDING_TTL) {
      pendingSearches.delete(id);
    }
  }
}, 5 * 60 * 1000);

function updateFilters(watchId, filters) {
  if (typeof watchId === 'string' && watchId.startsWith('p')) {
    const watch = pendingSearches.get(watchId);
    if (!watch) return;
    if ('minPrice' in filters) watch.min_price = filters.minPrice;
    if ('maxPrice' in filters) watch.max_price = filters.maxPrice;
    if ('size' in filters) watch.size = filters.size;
    if ('condition' in filters) watch.condition = filters.condition;
    if ('category' in filters) watch.category = filters.category;
  } else {
    db.updateFilters(watchId, filters);
  }
}

// Build the main watch message with an embed for filters
function buildWatchMessage(watchId) {
  const watch = getWatch(watchId);
  if (!watch) return { content: 'Saved search not found.', embeds: [], components: [] };

  const embed = new EmbedBuilder()
    .setTitle(`"${watch.query}"`)
    .setColor(0xff2300)
    .setFooter({ text: 'Set your filters below, then hit Save & Start' });

  const catValue = watch.category
    ? (() => {
        const t = watch.category.trim();
        if (t === 'male') return 'All Men';
        if (t === 'female') return 'All Women';
        const [dept, type] = t.split('.');
        const deptName = dept === 'menswear' ? 'Men' : 'Women';
        const typeName = Object.entries(PRODUCT_CATEGORIES[deptName] || {}).find(([, v]) => v === t)?.[0] || type;
        return `${deptName} \u203A ${typeName}`;
      })()
    : 'N/A';

  const SIZE_ORDER = ['One size', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL'];
  const sizeValue = watch.size
    ? watch.size.split(',').map(s => s.trim()).sort((a, b) => {
        const ai = SIZE_ORDER.indexOf(a);
        const bi = SIZE_ORDER.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b, undefined, { numeric: true });
      }).join('\n')
    : 'N/A';

  const condValue = watch.condition
    ? watch.condition.split(',').map(v =>
        CONDITIONS.find(c => c.value === v.trim())?.label || v.trim()
      ).join('\n')
    : 'N/A';

  const priceParts = [];
  if (watch.min_price) priceParts.push(`Min: $${watch.min_price}`);
  if (watch.max_price) priceParts.push(`Max: $${watch.max_price}`);
  const priceValue = priceParts.length ? priceParts.join('\n') : 'N/A';

  embed.addFields(
    { name: 'Category', value: catValue, inline: true },
    { name: 'Size', value: sizeValue, inline: true },
    { name: '\u200b', value: '\u200b', inline: true },
    { name: 'Condition', value: condValue, inline: true },
    { name: 'Price', value: priceValue, inline: true },
    { name: '\u200b', value: '\u200b', inline: true },
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`category_${watchId}`)
      .setLabel('Category')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('\uD83C\uDFF7\uFE0F'),
    new ButtonBuilder()
      .setCustomId(`size_${watchId}`)
      .setLabel('Size')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('\uD83D\uDCCF'),
    new ButtonBuilder()
      .setCustomId(`condition_${watchId}`)
      .setLabel('Condition')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('\u2728'),
    new ButtonBuilder()
      .setCustomId(`price_${watchId}`)
      .setLabel('Price Range')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('\uD83D\uDCB0'),
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`activate_${watchId}`)
      .setLabel('Save & Start')
      .setStyle(ButtonStyle.Success)
      .setEmoji('\u2705'),
    new ButtonBuilder()
      .setCustomId(`cancel_${watchId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  return { content: '', embeds: [embed], components: [row, actionRow] };
}

function buildWatchListButtons(watchId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`edit_${watchId}`)
      .setLabel('Edit Filters')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`delete_${watchId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger),
  );
}

async function handleButton(interaction) {
  const customId = interaction.customId;

  // /list action buttons -> show the appropriate dropdown
  if (customId.startsWith('listaction_')) {
    const action = customId.split('_')[1];

    if (action === 'back') {
      // Rebuild the /list view
      const watches = db.getWatchesByGuild(interaction.guildId);
      const active = watches.filter(w => w.active);
      const paused = watches.filter(w => !w.active);
      const embed = new EmbedBuilder()
        .setTitle('Saved Searches')
        .setColor(0xff2300)
        .setDescription(
          watches.map(w => {
            const filters = [];
            if (w.category) filters.push(`Category: ${w.category}`);
            if (w.size) filters.push(`Size: ${w.size}`);
            const status = w.active ? '\uD83D\uDFE2' : '\u23F8\uFE0F';
            return `${status} **#${w.id}** \u2014 "${w.query}" ${filters.length ? `(${filters.join(', ')})` : ''}`;
          }).join('\n') || 'None'
        );
      const buttons = [];
      buttons.push(new ButtonBuilder().setCustomId('listaction_edit').setLabel('Edit').setStyle(ButtonStyle.Primary));
      if (active.length) buttons.push(new ButtonBuilder().setCustomId('listaction_pause').setLabel('Pause').setStyle(ButtonStyle.Secondary));
      if (paused.length) buttons.push(new ButtonBuilder().setCustomId('listaction_resume').setLabel('Resume').setStyle(ButtonStyle.Success));
      buttons.push(new ButtonBuilder().setCustomId('listaction_delete').setLabel('Delete').setStyle(ButtonStyle.Danger));
      buttons.push(new ButtonBuilder().setCustomId('listaction_close').setLabel('Close').setStyle(ButtonStyle.Secondary));
      const btnRow = new ActionRowBuilder().addComponents(buttons);
      await interaction.update({ embeds: [embed], components: [btnRow] });
      return;
    }

    if (action === 'close') {
      try {
        await interaction.message.delete();
        await interaction.deferUpdate().catch(() => {});
      } catch {
        await interaction.update({ content: 'Closed.', embeds: [], components: [] }).catch(() => {});
      }
      return;
    }

    const guildId = interaction.guildId;
    const watches = db.getWatchesByGuild(guildId);
    const active = watches.filter(w => w.active);
    const paused = watches.filter(w => !w.active);

    let options, placeholder, menuId, maxVals;
    if (action === 'edit') {
      options = watches.map(w => ({ label: `${w.query} (#${w.id})`, value: String(w.id), description: w.active ? 'Active' : 'Paused' }));
      placeholder = 'Select a saved search to edit...';
      menuId = 'listedit';
      maxVals = 1;
    } else if (action === 'pause') {
      options = active.map(w => ({ label: `${w.query} (#${w.id})`, value: String(w.id) }));
      placeholder = 'Select saved searches to pause...';
      menuId = 'listpause';
      maxVals = options.length;
    } else if (action === 'resume') {
      options = paused.map(w => ({ label: `${w.query} (#${w.id})`, value: String(w.id) }));
      placeholder = 'Select saved searches to resume...';
      menuId = 'listresume';
      maxVals = options.length;
    } else if (action === 'delete') {
      options = watches.map(w => ({ label: `${w.query} (#${w.id})`, value: String(w.id) }));
      placeholder = 'Select saved searches to delete...';
      menuId = 'listdelete';
      maxVals = options.length;
    }

    if (!options || !options.length) {
      return interaction.reply({ content: 'No saved searches available for this action.', flags: MessageFlags.Ephemeral });
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(menuId)
        .setPlaceholder(placeholder)
        .setMinValues(1)
        .setMaxValues(maxVals)
        .addOptions(options.slice(0, 25))
    );

    const backRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('listaction_back').setLabel('Back').setStyle(ButtonStyle.Secondary),
    );
    await interaction.update({ components: [row, backRow] });
    return;
  }

  if (customId.startsWith('back_')) {
    const watchId = parseWatchId(customId.split('_')[1]);
    await interaction.update(buildWatchMessage(watchId));
    return;
  }

  if (customId.startsWith('sizeclear_')) {
    const watchId = parseWatchId(customId.split('_')[1]);
    const watch = getWatch(watchId);
    if (!watch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
    updateFilters(watchId, { minPrice: watch.min_price, maxPrice: watch.max_price, size: null, condition: watch.condition, category: watch.category });
    await interaction.update(buildWatchMessage(watchId));
    updateOriginalMessage(interaction, watchId);
    return;
  }

  if (customId.startsWith('catclear_')) {
    const watchId = parseWatchId(customId.split('_')[1]);
    const watch = getWatch(watchId);
    if (!watch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
    updateFilters(watchId, { minPrice: watch.min_price, maxPrice: watch.max_price, size: watch.size, condition: watch.condition, category: null });
    await interaction.update(buildWatchMessage(watchId));
    updateOriginalMessage(interaction, watchId);
    return;
  }

  if (customId.startsWith('condclear_')) {
    const watchId = parseWatchId(customId.split('_')[1]);
    const watch = getWatch(watchId);
    if (!watch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
    updateFilters(watchId, { minPrice: watch.min_price, maxPrice: watch.max_price, size: watch.size, condition: null, category: watch.category });
    await interaction.update(buildWatchMessage(watchId));
    updateOriginalMessage(interaction, watchId);
    return;
  }

  if (customId.startsWith('priceclear_')) {
    const watchId = parseWatchId(customId.split('_')[1]);
    const watch = getWatch(watchId);
    if (!watch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
    updateFilters(watchId, { minPrice: null, maxPrice: null, size: watch.size, condition: watch.condition, category: watch.category });
    await interaction.update(buildWatchMessage(watchId));
    updateOriginalMessage(interaction, watchId);
    return;
  }

  const [action, watchIdStr] = customId.split('_');
  const watchId = parseWatchId(watchIdStr);
  const watch = getWatch(watchId);

  if (!watch) {
    return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
  }

  if (watch.user_id !== interaction.user.id) {
    return interaction.reply({ content: 'This isn\'t your saved search.', flags: MessageFlags.Ephemeral });
  }

  switch (action) {
    case 'cancel':
      // Just close the prompt
      try {
        await interaction.message.delete();
        await interaction.deferUpdate().catch(() => {});
      } catch {
        await interaction.update({ content: 'Closed.', embeds: [], components: [] }).catch(() => {});
      }
      return;
    case 'category':
      return showCategoryMenu(interaction, watchId);
    case 'price':
      return showPriceMenu(interaction, watchId);
    case 'setprice':
      return showPriceModal(interaction, watchId);
    case 'size':
      return showSizeCategoryMenu(interaction, watchId);
    case 'condition':
      return showConditionMenu(interaction, watchId);
    case 'activate':
      return activateWatch(interaction, watchId);
    case 'edit':
      return showEditMessage(interaction, watchId);
    case 'delete':
      return deleteWatch(interaction, watchId);
    default:
      return interaction.reply({ content: 'Unknown action.', flags: MessageFlags.Ephemeral });
  }
}

async function showPriceMenu(interaction, watchId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`setprice_${watchId}`).setLabel('Set Price').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`priceclear_${watchId}`).setLabel('Clear Price').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`back_${watchId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: 'Set or clear price range:',
    embeds: [],
    components: [row],
  });
}

async function showPriceModal(interaction, watchId) {
  const modal = new ModalBuilder()
    .setCustomId(`pricemodal_${watchId}`)
    .setTitle('Set Price Range');

  const minInput = new TextInputBuilder()
    .setCustomId('min_price')
    .setLabel('Minimum Price (leave empty for no min)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('e.g. 10');

  const maxInput = new TextInputBuilder()
    .setCustomId('max_price')
    .setLabel('Maximum Price (leave empty for no max)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('e.g. 100');

  modal.addComponents(
    new ActionRowBuilder().addComponents(minInput),
    new ActionRowBuilder().addComponents(maxInput),
  );

  await interaction.showModal(modal);
}

const PRODUCT_CATEGORIES = {
  'Men': {
    'Tops': 'menswear.tops', 'Bottoms': 'menswear.bottoms', 'Coats and jackets': 'menswear.coats-jackets',
    'Jumpsuits and playsuits': 'menswear.jumpsuit-and-playsuit', 'Suits': 'menswear.suits',
    'Footwear': 'menswear.footwear', 'Accessories': 'menswear.accessories',
    'Nightwear': 'menswear.nightwear', 'Underwear': 'menswear.underwear',
    'Swimwear': 'menswear.swim-beach-wear', 'Fancy dress': 'menswear.fancy-dress',
  },
  'Women': {
    'Tops': 'womenswear.tops', 'Bottoms': 'womenswear.bottoms', 'Dresses': 'womenswear.dresses',
    'Coats and jackets': 'womenswear.coats-jackets', 'Jumpsuits and playsuits': 'womenswear.jumpsuit-and-playsuit',
    'Suits': 'womenswear.suits', 'Footwear': 'womenswear.footwear', 'Accessories': 'womenswear.accessories',
    'Nightwear': 'womenswear.nightwear', 'Underwear': 'womenswear.underwear',
    'Swimwear': 'womenswear.swim-beach-wear', 'Fancy dress': 'womenswear.fancy-dress',
  },
};

async function showCategoryMenu(interaction, watchId) {
  const options = [];
  for (const [gender, subcats] of Object.entries(PRODUCT_CATEGORIES)) {
    options.push({ label: `All ${gender}`, value: gender.toLowerCase() === 'men' ? 'male' : 'female' });
    for (const [name, value] of Object.entries(subcats)) {
      options.push({ label: `${gender} \u203A ${name}`, value });
    }
  }

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`catpick_${watchId}`)
      .setPlaceholder('Pick a category')
      .addOptions(options)
  );

  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`catclear_${watchId}`).setLabel('Clear Category').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`back_${watchId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: 'Pick a category:',
    embeds: [],
    components: [selectRow, btnRow],
  });
}

async function showSizeCategoryMenu(interaction, watchId) {
  const options = [];
  for (const [gender, subcats] of Object.entries(SIZE_CATEGORIES)) {
    for (const sub of Object.keys(subcats)) {
      options.push({ label: `${gender} \u203A ${sub}`, value: `${gender}||${sub}`, description: `${subcats[sub].length} sizes` });
    }
  }

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sizesub_${watchId}`)
      .setPlaceholder('Pick a size type')
      .addOptions(options.slice(0, 25))
  );

  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sizeclear_${watchId}`).setLabel('Clear Size').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`back_${watchId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: 'Pick a size type, then select sizes:',
    embeds: [],
    components: [selectRow, btnRow],
  });
}

async function showConditionMenu(interaction, watchId) {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`conditionmenu_${watchId}`)
      .setPlaceholder('Select conditions')
      .setMinValues(1)
      .setMaxValues(CONDITIONS.length)
      .addOptions(CONDITIONS)
  );

  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`condclear_${watchId}`).setLabel('Clear Condition').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`back_${watchId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: 'Select condition:',
    embeds: [],
    components: [row, btnRow],
  });
}

async function activateWatch(interaction, watchId) {
  const pending = getWatch(watchId);
  if (!pending) return;

  let dbId;

  if (pending._editingDbId) {
    // Editing an existing saved search — update in place
    dbId = pending._editingDbId;
    db.updateFilters(dbId, {
      minPrice: pending.min_price,
      maxPrice: pending.max_price,
      size: pending.size,
      condition: pending.condition,
      category: pending.category,
    });
    db.activateWatch(dbId);
    console.log(`[Bot] Updated saved search "${pending.query}" (#${dbId})`);
  } else {
    // New saved search — create DB row
    dbId = db.createWatch(pending.guild_id, pending.channel_id, pending.user_id, pending.query);
    db.updateFilters(dbId, {
      minPrice: pending.min_price,
      maxPrice: pending.max_price,
      size: pending.size,
      condition: pending.condition,
      category: pending.category,
    });
    db.activateWatch(dbId);
    if (pending.message_id) db.setMessageId(dbId, pending.message_id);
    console.log(`[Bot] Created saved search "${pending.query}" (#${dbId})`);
  }

  // Clean up pending
  if (typeof watchId === 'string' && watchId.startsWith('p')) {
    pendingSearches.delete(watchId);
  }

  const watch = db.getWatch(dbId);

  const msg = buildWatchMessage(dbId);
  const embed = EmbedBuilder.from(msg.embeds[0]);
  embed.setTitle(`Saved: "${watch.query}"`);
  embed.setColor(0x00cc00);
  embed.setFooter({ text: 'Monitoring for new listings...' });

  await interaction.update({ content: '', embeds: [embed], components: [] });
}

async function showEditMessage(interaction, watchId) {
  const msg = buildWatchMessage(watchId);
  await interaction.reply({
    ...msg,
    flags: MessageFlags.Ephemeral,
  });
}

async function deleteWatch(interaction, watchId) {
  db.deleteWatch(watchId, interaction.guildId);
  await interaction.update({ content: `Watch #${watchId} deleted.`, components: [] });
}

// After a filter is saved, update the main watch message and dismiss ephemeral
// Just update the original channel message (fire and forget)
function updateOriginalMessage(interaction, watchId) {
  const watch = db.getWatch(watchId);
  if (!watch?.message_id || !interaction.channel) return;
  interaction.channel.messages.fetch(watch.message_id)
    .then(msg => msg.edit(buildWatchMessage(watchId)))
    .catch(err => console.error(`[Buttons] Failed to update original message:`, err.message));
}

async function updateMainMessage(interaction, watchId) {
  const watch = db.getWatch(watchId);
  if (!watch) return;

  const updated = buildWatchMessage(watchId);

  // Update the original channel message if it exists
  if (watch.message_id && interaction.channel) {
    try {
      const msg = await interaction.channel.messages.fetch(watch.message_id);
      await msg.edit(updated);
    } catch {}
  }

  // Also update the current message back to the filter embed
  // (this handles the case where we used interaction.update() to show a dropdown)
  try {
    if (interaction.message) {
      await interaction.message.edit(updated);
    }
  } catch {}

  try {
    await interaction.deleteReply();
  } catch {}
}

async function handleModal(interaction) {
  const [, watchIdStr] = interaction.customId.split('_');
  const watchId = parseWatchId(watchIdStr);
  const watch = getWatch(watchId);
  if (!watch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });

  const rawMin = interaction.fields.getTextInputValue('min_price').trim();
  const rawMax = interaction.fields.getTextInputValue('max_price').trim();
  const minPrice = rawMin ? parseFloat(rawMin) : null;
  const maxPrice = rawMax ? parseFloat(rawMax) : null;

  if ((minPrice !== null && (isNaN(minPrice) || minPrice < 0)) ||
      (maxPrice !== null && (isNaN(maxPrice) || maxPrice < 0))) {
    return interaction.reply({ content: 'Please enter valid positive numbers for price.', flags: MessageFlags.Ephemeral });
  }

  updateFilters(watchId, {
    minPrice,
    maxPrice,
    size: watch.size,
    condition: watch.condition,
    category: watch.category,
  });

  await interaction.deferUpdate().catch(async () => {
    await interaction.reply({ content: 'Price updated!', flags: MessageFlags.Ephemeral });
  });
  updateOriginalMessage(interaction, watchId);
  try { await interaction.deleteReply(); } catch {}
}

async function handleSelectMenu(interaction) {
  const customId = interaction.customId;

  // Handle /list dropdowns
  if (customId === 'listedit') {
    const wId = parseInt(interaction.values[0]);
    const editWatch = db.getWatch(wId);
    if (!editWatch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });
    console.log(`[Bot] Editing saved search "${editWatch.query}" (#${wId})`);
    // Create a pending copy so edits don't persist until Save
    const pendingId = createPendingSearch({
      guild_id: editWatch.guild_id,
      channel_id: editWatch.channel_id,
      user_id: editWatch.user_id,
      query: editWatch.query,
    });
    const pending = getWatch(pendingId);
    pending.size = editWatch.size;
    pending.condition = editWatch.condition;
    pending.category = editWatch.category;
    pending.min_price = editWatch.min_price;
    pending.max_price = editWatch.max_price;
    pending.message_id = editWatch.message_id;
    pending._editingDbId = wId; // Track which DB row to update on save
    const msg = buildWatchMessage(pendingId);
    await interaction.reply({ ...msg, flags: MessageFlags.Ephemeral });
    try { await interaction.message.delete(); } catch {}
    return;
  }
  if (customId === 'listresume') {
    const ids = interaction.values.map(v => parseInt(v));
    for (const wId of ids) {
      db.activateWatch(wId);
    }
    const resumeNames = ids.map(id => { const w = db.getWatch(id); return `"${w?.query}" (#${id})`; });
    console.log(`[Bot] Resumed saved searches: ${resumeNames.join(', ')}`);
    await interaction.reply({ content: `Resumed ${ids.length} saved search${ids.length > 1 ? 'es' : ''}.`, flags: MessageFlags.Ephemeral });
    try { await interaction.message.delete(); } catch {}
    return;
  }
  if (customId === 'listpause') {
    const ids = interaction.values.map(v => parseInt(v));
    for (const wId of ids) {
      db.pauseWatch(wId);
    }
    const pauseNames = ids.map(id => { const w = db.getWatch(id); return `"${w?.query}" (#${id})`; });
    console.log(`[Bot] Paused saved searches: ${pauseNames.join(', ')}`);
    await interaction.reply({ content: `Paused ${ids.length} saved search${ids.length > 1 ? 'es' : ''}.`, flags: MessageFlags.Ephemeral });
    try { await interaction.message.delete(); } catch {}
    return;
  }
  if (customId === 'listdelete') {
    const ids = interaction.values.map(v => parseInt(v));
    const deleteNames = ids.map(id => { const w = db.getWatch(id); return `"${w?.query}" (#${id})`; });
    for (const wId of ids) {
      db.deleteWatch(wId, interaction.guildId);
    }
    console.log(`[Bot] Deleted saved searches: ${deleteNames.join(', ')}`);
    await interaction.reply({ content: `Deleted ${ids.length} saved search${ids.length > 1 ? 'es' : ''}.`, flags: MessageFlags.Ephemeral });
    try { await interaction.message.delete(); } catch {}
    return;
  }

  const parts = customId.split('_');
  const type = parts[0];
  const watchId = parseWatchId(parts[1]);
  const watch = getWatch(watchId);
  if (!watch) return interaction.reply({ content: 'Saved search not found.', flags: MessageFlags.Ephemeral });

  const value = interaction.values[0];

  if (type === 'catpick') {
    const selected = interaction.values[0];
    updateFilters(watchId, { minPrice: watch.min_price, maxPrice: watch.max_price, size: watch.size, condition: watch.condition, category: selected });
    await interaction.update(buildWatchMessage(watchId));
    updateOriginalMessage(interaction, watchId);

  } else if (type === 'sizesub') {
    const [category, subcategory] = value.split('||');

    let sizes;
    let label;

    if (subcategory === '__ALL__') {
      const allSizes = new Set();
      for (const s of Object.values(SIZE_CATEGORIES[category] || {})) {
        for (const size of s) allSizes.add(size);
      }
      sizes = [...allSizes];
      label = `All ${category}`;
    } else {
      sizes = SIZE_CATEGORIES[category]?.[subcategory];
      label = `${category} \u203A ${subcategory}`;
    }

    if (!sizes || !sizes.length) return interaction.reply({ content: 'Invalid selection.', flags: MessageFlags.Ephemeral });

    const options = sizes.slice(0, 25).map(s => ({ label: s, value: s }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`sizepick_${watchId}`)
        .setPlaceholder('Pick your sizes')
        .setMinValues(1)
        .setMaxValues(options.length)
        .addOptions(options)
    );

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`back_${watchId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
    );

    await interaction.update({
      content: `Pick one or more sizes (**${label}**):`,
      components: [row, btnRow],
    });

  } else if (type === 'sizepick') {
    const existing = watch.size ? watch.size.split(',').map(s => s.trim()) : [];
    const newSizes = interaction.values;
    const merged = [...new Set([...existing, ...newSizes])];
    const selectedSizes = merged.join(',');
    updateFilters(watchId, { minPrice: watch.min_price, maxPrice: watch.max_price, size: selectedSizes, condition: watch.condition, category: watch.category });
    await interaction.update(buildWatchMessage(watchId));
    updateOriginalMessage(interaction, watchId);

  } else if (type === 'conditionmenu') {
    const selectedConditions = interaction.values.join(',');
    updateFilters(watchId, { minPrice: watch.min_price, maxPrice: watch.max_price, size: watch.size, condition: selectedConditions, category: watch.category });
    await interaction.update(buildWatchMessage(watchId));
    updateOriginalMessage(interaction, watchId);
  }
}

module.exports = {
  buildWatchMessage,
  buildWatchListButtons,
  createPendingSearch,
  getWatch,
  handleButton,
  handleModal,
  handleSelectMenu,
};
