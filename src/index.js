require('dotenv').config();

const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits,
} = require('discord.js');
const { fetchPlaytime } = require('./providers');
const {
  loadWatchers, saveWatchers, loadStatusMessage, saveStatusMessage,
} = require('./store');

const intervalMinutes = Math.max(60, Number(process.env.POLL_INTERVAL_MINUTES || 60));
const timeoutMs = Math.max(1000, Number(process.env.REQUEST_TIMEOUT_MS || 15000));
const milestones = [10, 20, 30];
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });
let state;
let running = false;
let lastPollAt = 0;

function formatPlaytime(hours) {
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  return `${days}d ${remaining}h`;
}

function normalizeUsername(value) {
  return value.trim().replace(/^@/, '');
}

function addWatchedUser(username, ownerId) {
  const key = username.toLowerCase();
  if (state.users[key]) return false;
  state.users[key] = {
    username, ownerId, hours: null, provider: null, milestones: [], updatedAt: null, error: null,
  };
  return true;
}

function boardEmbed() {
  const entries = Object.values(state.users);
  const lines = entries.length
    ? entries.sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1))
      .map((user) => `**${user.username}** — ${user.hours === null ? 'unavailable' : formatPlaytime(user.hours)}${user.provider ? ` · ${user.provider}` : ''}`)
      .join('\n')
    : 'No usernames are being watched yet. Use `/watch username:<name>`.';
  return new EmbedBuilder()
    .setTitle('DonutSMP Playtime')
    .setDescription(lines)
    .setColor(0x7c3aed)
    .setFooter({ text: `Updates every ${intervalMinutes} minutes` })
    .setTimestamp();
}

async function updateBoard() {
  if (!state.channelId) return;
  const channel = await client.channels.fetch(state.channelId);
  if (!channel?.isTextBased()) throw new Error('Configured board channel is not text-based');
  const saved = await loadStatusMessage();
  let message;
  if (saved.channelId === state.channelId && saved.messageId) {
    try { message = await channel.messages.fetch(saved.messageId); } catch (error) {
      if (error.code !== 10008) throw error;
    }
  }
  message = message
    ? await message.edit({ embeds: [boardEmbed()] })
    : await channel.send({ embeds: [boardEmbed()] });
  await saveStatusMessage({ channelId: state.channelId, messageId: message.id });
}

async function poll({ force = false, users = Object.values(state.users) } = {}) {
  if (running || (!force && Date.now() - lastPollAt < intervalMinutes * 60 * 1000)) return false;
  running = true;
  if (!force) lastPollAt = Date.now();
  try {
    for (const user of users) {
      try {
        const result = await fetchPlaytime(user.username, timeoutMs);
        const previousHours = user.hours;
        user.hours = result.hours;
        user.provider = result.provider;
        user.updatedAt = new Date().toISOString();
        user.error = null;
        if (previousHours !== null && previousHours !== undefined) {
          const crossed = milestones.filter((days) => previousHours < days * 24 && result.hours >= days * 24 && !user.milestones.includes(days));
          for (const days of crossed) {
            const owner = await client.users.fetch(user.ownerId);
            await owner.send(`🎉 **${user.username}** reached ${days} days of playtime (${formatPlaytime(result.hours)}).`);
            user.milestones.push(days);
          }
        }
      } catch (error) {
        user.error = error.message;
        console.error(`Could not fetch ${user.username}: ${error.message}`);
      }
    }
    await saveWatchers(state);
    await updateBoard();
  } catch (error) {
    console.error(`Polling failed: ${error.message}`);
  } finally {
    running = false;
  }
  return true;
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'watch') {
      const username = normalizeUsername(interaction.options.getString('username', true));
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return interaction.reply({ content: 'That is not a valid Minecraft username.', ephemeral: true });
      const added = addWatchedUser(username, interaction.user.id);
      await saveWatchers(state);
      await interaction.reply(`Now watching **${username}**. I will DM milestone alerts to you.`);
      if (added) await poll({ force: true, users: [state.users[username.toLowerCase()]] });
    } else if (interaction.commandName === 'watchbulk') {
      const input = interaction.options.getString('usernames', true);
      const usernames = [...new Set(input.split(/[\s,]+/).map(normalizeUsername).filter(Boolean))];
      if (usernames.length > 50) {
        return interaction.reply({ content: 'Please add no more than 50 usernames at once.', ephemeral: true });
      }

      const invalid = usernames.filter((username) => !/^[A-Za-z0-9_]{3,16}$/.test(username));
      const valid = usernames.filter((username) => /^[A-Za-z0-9_]{3,16}$/.test(username));
      const added = valid.filter((username) => addWatchedUser(username, interaction.user.id));
      const alreadyWatching = valid.filter((username) => !added.some((addedUsername) => addedUsername.toLowerCase() === username.toLowerCase()));
      if (!added.length) {
        return interaction.reply({ content: 'No new valid usernames were added.', ephemeral: true });
      }

      await saveWatchers(state);
      const summary = [
        `Added ${added.length} username${added.length === 1 ? '' : 's'}: ${added.map((username) => `**${username}**`).join(', ')}`,
        alreadyWatching.length ? `Already watching: ${alreadyWatching.join(', ')}` : '',
        invalid.length ? `Invalid: ${invalid.join(', ')}` : '',
      ].filter(Boolean).join('\n');
      await interaction.reply(`${summary}\nFetching their playtime now.`);
      await poll({ force: true, users: added.map((username) => state.users[username.toLowerCase()]) });
    } else if (interaction.commandName === 'unwatch') {
      const username = normalizeUsername(interaction.options.getString('username', true));
      if (!state.users[username.toLowerCase()]) return interaction.reply({ content: 'That username is not being watched.', ephemeral: true });
      delete state.users[username.toLowerCase()];
      await saveWatchers(state);
      await interaction.reply(`Stopped watching **${username}**.`);
      await updateBoard();
    } else if (interaction.commandName === 'watching') {
      const names = Object.values(state.users).map((user) => `• ${user.username}`).join('\n') || 'No usernames are being watched.';
      await interaction.reply({ content: names, ephemeral: true });
    } else if (interaction.commandName === 'setchannel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: 'Manage Server permission required.', ephemeral: true });
      state.channelId = interaction.channelId;
      await saveWatchers(state);
      await interaction.reply(`Playtime board set to <#${interaction.channelId}>.`);
      await updateBoard();
    } else if (interaction.commandName === 'refresh') {
      await interaction.deferReply();
      const refreshed = await poll();
      await interaction.editReply(refreshed
        ? 'Playtime board refreshed.'
        : 'The board was already refreshed within the last hour; no API requests were made.');
    }
  } catch (error) {
    console.error(`Command ${interaction.commandName} failed:`, error);
    if (interaction.replied || interaction.deferred) await interaction.editReply('Something went wrong. Check the bot log.').catch(() => {});
    else await interaction.reply({ content: 'Something went wrong. Check the bot log.', ephemeral: true });
  }
});

client.once('ready', async () => {
  state = await loadWatchers();
  console.log(`Logged in as ${client.user.tag}; polling every ${intervalMinutes} minutes.`);
  await poll();
  setInterval(poll, intervalMinutes * 60 * 1000);
});

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required');
}
client.login(process.env.DISCORD_TOKEN);
