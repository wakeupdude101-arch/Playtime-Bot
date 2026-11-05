require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('watch').setDescription('Watch a DonutSMP username')
    .addStringOption((option) => option.setName('username').setDescription('Minecraft username').setRequired(true)),
  new SlashCommandBuilder().setName('watchbulk').setDescription('Watch multiple DonutSMP usernames')
    .addStringOption((option) => option.setName('usernames').setDescription('Usernames separated by commas, spaces, or new lines').setRequired(true)),
  new SlashCommandBuilder().setName('unwatch').setDescription('Stop watching a username')
    .addStringOption((option) => option.setName('username').setDescription('Minecraft username').setRequired(true)),
  new SlashCommandBuilder().setName('watching').setDescription('List watched usernames'),
  new SlashCommandBuilder().setName('setchannel').setDescription('Set this channel for the playtime board')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('refresh').setDescription('Fetch all watched playtimes now'),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const route = process.env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);

rest.put(route, { body: commands })
  .then(() => console.log(`Registered ${commands.length} commands.`))
  .catch((error) => {
    console.error('Could not register commands:', error.message);
    process.exitCode = 1;
  });
