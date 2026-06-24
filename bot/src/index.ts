import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { logCommandUsage, getAppSetting, setAppSetting } from '@quant/shared';

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error('Missing DISCORD_BOT_TOKEN');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot ready as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const started = Date.now();
  try {
    if (interaction.commandName === 'ping') {
      await interaction.reply({ content: 'Pong!', ephemeral: true });
    } else if (interaction.commandName === 'free-mode') {
      const current = await getAppSetting('free_mode');
      await setAppSetting('free_mode', !Boolean(current), 'Bot toggle');
      await interaction.reply({ content: `Free mode updated to ${!Boolean(current)}`, ephemeral: true });
    } else {
      await interaction.reply({ content: `Unknown command: ${interaction.commandName}`, ephemeral: true });
    }
    await logCommandUsage({
      user_id: interaction.user.id,
      guild_id: interaction.guildId,
      channel_id: interaction.channelId,
      command_name: interaction.commandName,
      success: true,
      duration_ms: Date.now() - started,
      metadata: { source: 'discord' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await logCommandUsage({
      user_id: interaction.user.id,
      guild_id: interaction.guildId,
      channel_id: interaction.channelId,
      command_name: interaction.commandName,
      success: false,
      duration_ms: Date.now() - started,
      metadata: { source: 'discord', error: message }
    });
    if (!interaction.replied) {
      await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => undefined);
    }
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

await client.login(token);
