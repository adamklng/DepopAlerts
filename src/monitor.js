const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { searchDepop } = require('./depop');
const db = require('./db');

// Track which watches have had their first poll this session
const firstPollDone = new Set();

async function pollWatches(client) {
  const watches = db.getActiveWatches();

  for (const watch of watches) {
    try {
      await checkWatch(client, watch);
    } catch (err) {
      console.error(`Error checking watch ${watch.id} ("${watch.query}"):`, err.message);
    }
    // Random 2-5s delay between watches to look more human
    if (watches.length > 1) {
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    }
  }
}

async function checkWatch(client, watch) {
  const filters = {
    minPrice: watch.min_price,
    maxPrice: watch.max_price,
    size: watch.size,
    condition: watch.condition,
    category: watch.category,
  };

  let items = await searchDepop(watch.query, filters);
  if (!items.length) return;

  // Only notify for items created after the watch was activated (with 3 min grace period)
  // SQLite CURRENT_TIMESTAMP is UTC — append Z so JS parses it as UTC
  const watchCreatedAt = new Date(watch.created_at + 'Z').getTime() - (3 * 60 * 1000);
  const beforeDateFilter = items.length;
  items = items.filter(item => {
    if (!item.dateCreated) return true;
    return new Date(item.dateCreated).getTime() > watchCreatedAt;
  });
  if (items.length < beforeDateFilter) {
    console.log(`[Monitor] Watch #${watch.id}: filtered ${beforeDateFilter - items.length} old items (watch created: ${watch.created_at})`);
  }
  if (!items.length) return;

  // Client-side size filtering
  if (watch.size) {
    const beforeSize = items.length;
    const wantedSizes = watch.size.split(',').map(s => s.trim().toLowerCase());
    items = items.filter(item => {
      if (!item.size) return false;
      const itemSize = item.size.toLowerCase();
      return wantedSizes.some(ws => itemSize.includes(ws));
    });
    console.log(`[Monitor] Watch #${watch.id}: size filter ${beforeSize} -> ${items.length} (want: ${watch.size})`);
    if (!items.length) return;
  }

  // Client-side condition filtering
  if (watch.condition) {
    const wantedConditions = watch.condition.split(',').map(c => c.trim().toLowerCase());
    items = items.filter(item => {
      if (!item.condition) return true; // RSC data doesn't include condition on search results
      return wantedConditions.some(wc => item.condition.toLowerCase().includes(wc));
    });
    if (!items.length) return;
  }

  // First poll this session: seed current items without notifying
  if (!firstPollDone.has(watch.id)) {
    firstPollDone.add(watch.id);
    db.addSeenItems(watch.id, items.map(i => i.id));
    db.markSeeded(watch.id);
    console.log(`[Monitor] Seeded saved search #${watch.id} ("${watch.query}") with ${items.length} items`);
    return;
  }

  const seenIds = db.getSeenItemIds(watch.id);
  console.log(`[Monitor] Watch #${watch.id} ("${watch.query}"): ${items.length} results, ${seenIds.size} seen`);
  const newItems = items.filter(item => !seenIds.has(item.id));

  if (!newItems.length) {
    console.log(`[Monitor] Watch #${watch.id}: no new items`);
    return;
  }
  console.log(`[Monitor] Watch #${watch.id}: ${newItems.length} NEW items!`);
  newItems.forEach(i => console.log(`  -> ${i.title} | ${i.price} | ${i.url}`));

  db.addSeenItems(watch.id, newItems.map(i => i.id));

  // Use notification channel if set, otherwise fall back to the watch's channel
  const notifyChannelId = db.getNotifyChannel(watch.guild_id) || watch.channel_id;
  const channel = await client.channels.fetch(notifyChannelId).catch(err => {
    console.error(`[Monitor] Failed to fetch channel ${notifyChannelId}:`, err.message);
    return null;
  });
  if (!channel) return;

  for (const item of newItems) {
    const embed = buildItemEmbed(item, watch);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View on Depop')
        .setStyle(ButtonStyle.Link)
        .setURL(item.url)
    );

    await channel.send({
      content: `<@${watch.user_id}> 🔔 🚨 New item for **${watch.query}**!`,
      embeds: [embed],
      components: [row],
    });
  }
}

function buildItemEmbed(item, watch) {
  const embed = new EmbedBuilder()
    .setTitle(item.title)
    .setURL(item.url)
    .setColor(0xff2300)
    .setDescription(item.description || null)
    .addFields(
      { name: 'Price', value: item.price, inline: true },
      { name: 'Seller', value: `[${item.seller}](${item.sellerUrl})`, inline: true },
    )
    .setFooter({ text: `Watch #${watch.id} · ${watch.query}` })
    .setTimestamp();

  if (item.size) {
    embed.addFields({ name: 'Size', value: item.size, inline: true });
  }

  if (item.imageUrl) {
    embed.setImage(item.imageUrl);
  }

  return embed;
}

let isPolling = false;

function startPolling(client, intervalMs) {
  console.log(`Polling every ${intervalMs / 1000}s`);

  const poll = async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      await pollWatches(client);
    } catch (err) {
      console.error('[Monitor] Poll failed:', err.message);
    } finally {
      isPolling = false;
    }
  };

  poll();
  setInterval(poll, intervalMs);
}

module.exports = { startPolling, pollWatches, firstPollDone };
