import { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { storage } from "./storage.js";

const PREFIX = "D";
const ADMIN_ID = "763625050213187614";
const POKETWO_BOT_ID = "716390085896962058";

const pendingWithdrawals = new Map();

export function startDiscordBot() {
  console.log('[BOT] startDiscordBot() called');
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    console.error("❌ DISCORD_BOT_TOKEN not found in environment variables");
    return;
  }

  console.log('[BOT] Token found, creating client...');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Discord bot logged in as ${c.user.tag}`);
    console.log(`🤖 Bot is ready to serve ${c.guilds.cache.size} server(s)`);
  });

  client.on('error', (error) => {
    console.error("[BOT ERROR]", error);
  });

  client.on('warn', (warning) => {
    console.warn("[BOT WARNING]", warning);
  });

  client.on(Events.ClientReady, () => {
    console.log('[BOT] Ready event fired');
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId.startsWith('withdraw_')) {
          const userId = customId.split('_')[1];

          if (interaction.user.id !== userId) {
            await interaction.reply({ content: "❌ This withdrawal request is not for you!", ephemeral: true });
            return;
          }

          const amount = pendingWithdrawals.get(userId);
          if (!amount) {
            await interaction.reply({ content: "❌ Withdrawal request expired. Please start a new withdrawal.", ephemeral: true });
            return;
          }

          const modal = new ModalBuilder()
            .setCustomId(`withdraw_modal_${userId}`)
            .setTitle('Enter Market ID');

          const marketIdInput = new TextInputBuilder()
            .setCustomId('market_id_input')
            .setLabel("What's your Market ID?")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter your market ID here...')
            .setRequired(true)
            .setMaxLength(100);

          const actionRow = new ActionRowBuilder().addComponents(marketIdInput);
          modal.addComponents(actionRow);

          await interaction.showModal(modal);
        }
      }

      if (interaction.isModalSubmit()) {
        const customId = interaction.customId;

        if (customId.startsWith('withdraw_modal_')) {
          try {
            const userId = customId.split('_')[2];
            const marketId = interaction.fields.getTextInputValue('market_id_input').trim();

            console.log(`[WITHDRAW MODAL] User ${userId} submitted market ID: ${marketId}`);

            const amount = pendingWithdrawals.get(userId);
            if (!amount) {
              console.log(`[WITHDRAW MODAL] No pending withdrawal found for user ${userId}`);
              await interaction.reply({ content: "❌ Withdrawal request expired. Please start a new withdrawal.", ephemeral: true });
              return;
            }

            console.log(`[WITHDRAW MODAL] Pending amount: ${amount}`);

            pendingWithdrawals.delete(userId);

            const username = interaction.user.username;

            if (!marketId) {
              console.log(`[WITHDRAW MODAL] Empty market ID provided`);
              await interaction.reply({ content: "❌ Market ID cannot be empty!", ephemeral: true });
              return;
            }

            const settings = await storage.getBotSettings();
            const withdrawalChannel = settings.withdrawalChannelId;

            console.log(`[WITHDRAW MODAL] Withdrawal channel ID: ${withdrawalChannel}`);

            if (!withdrawalChannel) {
              console.log(`[WITHDRAW MODAL] No withdrawal channel configured`);
              await interaction.reply({ content: "❌ Withdrawal channel not configured. Please contact an admin.", ephemeral: true });
              return;
            }

            const withdrawalMessages = await storage.getWithdrawalRequestsCount();
            const requestNumber = withdrawalMessages + 1;

            console.log(`[WITHDRAW MODAL] Creating request #${requestNumber} for user ${userId}, amount: ${amount}, marketId: ${marketId}`);

            const withdrawalRequest = await storage.createWithdrawalRequest({
              userId,
              marketId,
              requestNumber,
              amount,
              status: "pending"
            });

            console.log(`[WITHDRAW MODAL] Request created:`, withdrawalRequest);

            const cleanWithdrawalChannel = withdrawalChannel.replace(/[<#>]/g, '');
            console.log(`[WITHDRAW MODAL] Fetching channel ${cleanWithdrawalChannel}`);
            const channel = await interaction.client.channels.fetch(cleanWithdrawalChannel);

            if (!channel) {
              console.error(`[WITHDRAW MODAL] Channel ${withdrawalChannel} not found`);
              await interaction.reply({ content: "❌ Withdrawal channel not found. Please contact an admin.", ephemeral: true });
              return;
            }

            if (!channel.isTextBased()) {
              console.error(`[WITHDRAW MODAL] Channel ${withdrawalChannel} is not text-based`);
              await interaction.reply({ content: "❌ Withdrawal channel is not a text channel. Please contact an admin.", ephemeral: true });
              return;
            }

            console.log(`[WITHDRAW MODAL] Sending withdrawal embed to channel`);

            const withdrawalEmbed = new EmbedBuilder()
              .setColor(0xFFD700)
              .setTitle(`💰 Withdrawal Request #${requestNumber}`)
              .setDescription(`New withdrawal request from ${username}`)
              .addFields(
                { name: "👤 User", value: `<@${userId}>`, inline: true },
                { name: "🆔 Market ID", value: `\`${marketId}\``, inline: true },
                { name: "🪙 Amount", value: `${amount} Pokecoins`, inline: true },
                { name: "📝 Request Number", value: `#${requestNumber}`, inline: false },
                { name: "⏰ Status", value: "⏳ Pending Payment", inline: false }
              )
              .setFooter({ text: `Use -payed ${requestNumber} in this channel to process payment` })
              .setTimestamp();

            if ('send' in channel) {
              await channel.send({ embeds: [withdrawalEmbed] });
            } else {
              console.error(`[WITHDRAW MODAL] Channel does not support sending messages`);
              await interaction.reply({ 
                content: `❌ Withdrawal channel is not configured correctly. The channel does not support text messages.\n\n**Action Required:** Please ask an admin to reconfigure the withdrawal channel using:\n\`Dsetwithdrawal [channel_id]\``, 
                ephemeral: true 
              });
              return;
            }

            console.log(`[WITHDRAW MODAL] Withdrawal embed sent successfully`);

            const confirmEmbed = new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle("✅ Withdrawal Request Submitted")
              .setDescription(`Your withdrawal request has been submitted successfully!`)
              .addFields(
                { name: "📝 Request Number", value: `#${requestNumber}`, inline: true },
                { name: "🪙 Amount", value: `${amount} Pokecoins`, inline: true },
                { name: "📍 Next Steps", value: `Admin will process your payment in the withdrawal channel`, inline: false }
              )
              .setFooter({ text: "You will be notified when payment is processed" })
              .setTimestamp();

            await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
            console.log(`[WITHDRAW MODAL] Confirmation sent to user`);
          } catch (modalError) {
            console.error("[WITHDRAW MODAL] Error processing modal:", modalError);
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: `❌ An error occurred while processing your withdrawal: ${modalError instanceof Error ? modalError.message : "Unknown error"}`, ephemeral: true });
            }
          }
        }
      }
    } catch (error) {
      console.error("[INTERACTION] Error handling interaction:", error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ An error occurred. Please try again.", ephemeral: true });
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    const userId = message.author.id;
    const username = message.author.username;
    const discriminator = message.author.discriminator;
    const channelId = message.channel.id;
    const content = message.content;

    if (message.author.bot && message.author.id === POKETWO_BOT_ID) {
      try {
        const settings = await storage.getBotSettings();

        const userMention = message.mentions.users.first();
        if (!userMention) {
          return;
        }

        const hasCongrats = content.toLowerCase().includes("congratulations");
        const embedDescription = message.embeds?.[0]?.description?.toLowerCase() || "";
        const fullText = (content + " " + embedDescription).toLowerCase();

        const hasCaught = fullText.includes("caught");

        const isEventMessage = fullText.includes("bonus") || 
                              fullText.includes("event") || 
                              fullText.includes("halloween") ||
                              fullText.includes("gift");

        if (!hasCongrats || !hasCaught || isEventMessage) {
          console.log(`[CATCH] Not a valid catch message - Congrats: ${hasCongrats}, Caught: ${hasCaught}, Event: ${isEventMessage}`);
          return;
        }

        const catchUserId = userMention.id;
        const catchUsername = userMention.username;
        const catchDiscriminator = userMention.discriminator;

        console.log(`[CATCH] Valid catch detected - User: ${catchUserId}, Catch Event Active: ${settings.catchEventActive}`);

        if (!settings.catchEventActive) {
          console.log(`[CATCH] Catch event inactive - not counting`);
          return;
        }

        const isRareShiny = fullText.includes("✨") && fullText.includes("these colors seem unusual");
        const isShiny = fullText.includes("✨") && !isRareShiny;

        let user = await storage.getUser(catchUserId);
        if (!user) {
          user = await storage.createUser({
            id: catchUserId,
            username: catchUsername,
            discriminator: catchDiscriminator
          });
        }

        if (isRareShiny) {
          await storage.incrementUserRareShinyCatches(catchUserId);
          await message.react("💎");
          console.log(`[CATCH] Rare shiny catch counted for ${catchUserId}`);
        } else if (isShiny) {
          await storage.incrementUserShinyCatches(catchUserId);
          await message.react("✨");
          console.log(`[CATCH] Shiny catch counted for ${catchUserId}`);
        } else {
          await storage.incrementUserCatches(catchUserId);
          await message.react("🎯");
          console.log(`[CATCH] Regular catch counted for ${catchUserId}`);
        }
      } catch (error) {
        console.error("Error processing Poketwo catch:", error);
      }
      return;
    }

    if (message.author.bot) return;

    try {
      if (content.startsWith(PREFIX)) {
        await handleCommand(message);
        return;
      }

      if (content.startsWith("-payed")) {
        await handlePayedCommand(message);
        return;
      }

      console.log(`[MESSAGE] Received from ${username} in channel ${channelId}: "${content.substring(0, 50)}..."`);

      const settings = await storage.getBotSettings();

      if (!settings.messageEventActive) {
        console.log(`[MESSAGE] Message event inactive - not saving or counting`);
        return;
      }

      const shouldCount = settings.countingChannels.includes(channelId);

      console.log(`[MESSAGE] Should count: ${shouldCount}, Counting channels:`, settings.countingChannels);

      if (!shouldCount) {
        console.log(`[MESSAGE] Channel ${channelId} not in counting list - not saving`);
        return;
      }

      const { message: savedMessage, spam } = await storage.createMessageWithSpamCheck(
        content,
        userId,
        channelId,
        false
      );

      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.createUser({ id: userId, username, discriminator });
      }

      if (!spam.blocked) {
        console.log(`[MESSAGE] Valid message - counting for ${username}`);
        await storage.incrementUserMessages(userId, channelId);
      } else {
        console.log(`[MESSAGE] Spam detected: ${spam.reason}`);
        await message.react("💣");
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  async function handlePayedCommand(message) {
    try {
      const settings = await storage.getBotSettings();

      const currentChannelId = message.channel.id;
      const cleanWithdrawalChannelId = settings.withdrawalChannelId?.replace(/[<#>]/g, '') || '';
      
      console.log(`[PAYED] Current channel ID: ${currentChannelId}`);
      console.log(`[PAYED] Stored withdrawal channel ID (raw): ${settings.withdrawalChannelId}`);
      console.log(`[PAYED] Stored withdrawal channel ID (clean): ${cleanWithdrawalChannelId}`);
      console.log(`[PAYED] IDs match: ${currentChannelId === cleanWithdrawalChannelId}`);
      
      if (currentChannelId !== cleanWithdrawalChannelId) {
        if (!settings.withdrawalChannelId) {
          await message.reply(`❌ Withdrawal channel has not been configured. Please contact an admin.`);
        } else {
          await message.reply(`❌ The \`-payed\` command must be used in the **withdrawal channel**: <#${cleanWithdrawalChannelId}>\n\n*Debug: Current channel is \`${currentChannelId}\`, expected \`${cleanWithdrawalChannelId}\`*`);
        }
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const requestNumber = parseInt(args[1]);

      if (isNaN(requestNumber)) {
        await message.reply("❌ Please provide a valid request number. Usage: `-payed [number]`");
        return;
      }

      const request = await storage.getWithdrawalRequestByNumber(requestNumber);

      if (!request) {
        await message.reply(`❌ Withdrawal request #${requestNumber} not found.`);
        return;
      }

      if (request.status === "completed") {
        await message.reply(`❌ Withdrawal request #${requestNumber} has already been processed.`);
        return;
      }

      const user = await storage.getUser(request.userId);

      if (!user) {
        await message.reply(`❌ User not found for withdrawal request #${requestNumber}.`);
        return;
      }

      if (user.pokecoins < request.amount) {
        await message.reply(`❌ User <@${request.userId}> has insufficient balance! They have **${user.pokecoins}** Pokecoins but request is for **${request.amount}** Pokecoins.\n\n⚠️ This withdrawal request cannot be completed.`);
        return;
      }

      const updatedUser = await storage.deductUserPokecoins(request.userId, request.amount);

      const completionResult = await storage.completeWithdrawalIfPending(requestNumber);

      if (!completionResult.success) {
        await storage.addUserPokecoins(request.userId, request.amount);
        await message.reply(`❌ Withdrawal request #${requestNumber} has already been processed. Coins have been refunded.`);
        return;
      }

      await message.react("✅");
      await message.reply(`✅ Payment processed for request #${requestNumber}. Proof sent to proofs channel.`);

      if (!settings.proofsChannelId) {
        console.error("[PAYMENT] Proofs channel not configured");
        return;
      }

      const cleanProofsChannel = settings.proofsChannelId.replace(/[<#>]/g, '');
      const proofsChannel = await message.client.channels.fetch(cleanProofsChannel);

      if (!proofsChannel || !proofsChannel.isTextBased()) {
        console.error("[PAYMENT] Proofs channel not found or not text-based");
        return;
      }

      const proofEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle("✅ Payment Proof - Withdrawal Completed")
        .setDescription(`**Payment confirmed for withdrawal request #${requestNumber}**`)
        .addFields(
          { name: "👤 User", value: `<@${request.userId}>`, inline: true },
          { name: "🆔 User ID", value: `\`${request.userId}\``, inline: true },
          { name: "🪙 Amount Paid", value: `${request.amount} Pokecoins`, inline: true },
          { name: "📝 Request Number", value: `#${requestNumber}`, inline: true },
          { name: "✅ Processed By", value: `<@${message.author.id}>`, inline: true },
          { name: "💰 User's New Balance", value: `${updatedUser.pokecoins} Pokecoins`, inline: true }
        )
        .setFooter({ text: "Transaction completed successfully" })
        .setTimestamp();

      if ('send' in proofsChannel) {
        await proofsChannel.send({ embeds: [proofEmbed] });
      } else {
        console.error("[PAYMENT] Proofs channel does not support sending messages");
        await message.reply(`⚠️ Payment processed successfully but could not send proof to proofs channel.\n\n**Action Required:** Please reconfigure the proofs channel using:\n\`Dsetproofs [channel_id]\`\n\n**Payment Details:**\n• Request #${requestNumber}\n• User: <@${request.userId}>\n• Amount: ${request.amount} Pokecoins\n• New Balance: ${updatedUser.pokecoins} Pokecoins`);
      }

      console.log(`[PAYMENT] Successfully processed withdrawal #${requestNumber} for user ${request.userId}`);
    } catch (error) {
      console.error("[PAYMENT] Error processing payment:", error);
      await message.reply(`❌ Failed to process payment: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async function handleCommand(message) {
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const userId = message.author.id;
    const username = message.author.username;
    const discriminator = message.author.discriminator;

    console.log(`[COMMAND] Received command: "${command}" from ${username} in channel ${message.channel.id}`);

    try {
      switch (command) {
        case "help":
          const helpEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🤖 Bot Commands")
            .setDescription("Here are all available commands:")
            .addFields(
              { name: "📊 Statistics", value: "`Dcatches` - View your catch stats\n`Dleaderboard messages` or `Dlb messages` - Message leaderboard\n`Dleaderboard catches` or `Dlb catches` - Catch leaderboard\n`Dprofile` - Check your stats", inline: false },
              { name: "🎮 Actions", value: "`Dwithdraw [amount]` - Request a withdrawal", inline: false },
              { name: "⚙️ Admin Only", value: "`-payed [number]` - Process withdrawal (use in withdrawal channel)\n`Devent [messages/catches] [on/off]` - Toggle events\n`Dreset [messages/catches/all] [user_id/all]` - Reset stats\n`Dresetbal [user_id] [amount]` - Set user balance\n`Drate [messages] [coins]` - Set reward rate\n`Dsetproofs [channel_id]` - Set proofs channel\n`Dsetwithdrawal [channel_id]` - Set withdrawal channel\n`Daddcounting [channel_id]` - Add counting channel\n`Dremovecounting [channel_id]` - Remove counting channel\n`Dchannels` - View channel config", inline: false }
            )
            .setFooter({ text: "Workflow: Withdrawal request → Use -payed in withdrawal channel → Proof appears in proofs channel" })
            .setTimestamp();

          await message.reply({ embeds: [helpEmbed] });
          break;

        case "catches":
          let catchesUser = await storage.getUser(userId);
          if (!catchesUser) {
            catchesUser = await storage.createUser({ id: userId, username, discriminator });
          }

          const catchUsers = await storage.getAllUsers();
          const catchRankPosition = catchUsers.sort((a, b) => b.catches - a.catches).findIndex(u => u.id === userId) + 1;
          const totalCatches = catchUsers.reduce((sum, u) => sum + u.catches, 0);

          const catchesEmbed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle(`🕸️ ${username}'s Catches`)
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
              { name: "🕸️ Total Catches", value: `**${catchesUser.catches}**`, inline: true },
              { name: "✨ Shiny Catches", value: `**${catchesUser.shinyCatches || 0}**`, inline: true },
              { name: "💎 Rare Shiny", value: `**${catchesUser.rareShinyCatches || 0}**`, inline: true },
              { name: "📊 Rank", value: `#${catchRankPosition} of ${catchUsers.length}`, inline: true },
              { name: "🪙 Pokecoins", value: `${catchesUser.pokecoins}`, inline: true },
              { name: "📈 Server Total", value: `${totalCatches} catches`, inline: false }
            )
            .setFooter({ text: "Keep catching to climb the ranks!" })
            .setTimestamp();

          await message.reply({ embeds: [catchesEmbed] });
          break;

        case "profile":
          let profileUser = await storage.getUser(userId);
          if (!profileUser) {
            profileUser = await storage.createUser({ id: userId, username, discriminator });
          }

          const allUsers = await storage.getAllUsers();
          const messageRankPosition = allUsers.sort((a, b) => b.messages - a.messages).findIndex(u => u.id === userId) + 1;
          const catchRankPos = allUsers.sort((a, b) => b.catches - a.catches).findIndex(u => u.id === userId) + 1;

          const profileEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`👤 ${username}'s Profile`)
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
              { name: "💬 Messages", value: `${profileUser.messages}`, inline: true },
              { name: "🕸️ Catches", value: `${profileUser.catches}`, inline: true },
              { name: "🪙 Pokecoins", value: `${profileUser.pokecoins}`, inline: true },
              { name: "📊 Message Rank", value: `#${messageRankPosition}`, inline: true },
              { name: "🎖️ Catch Rank", value: `#${catchRankPos}`, inline: true },
              { name: "✨ Shiny Count", value: `${profileUser.shinyCatches || 0}`, inline: true },
              { name: "💎 Rare Shiny", value: `${profileUser.rareShinyCatches || 0}`, inline: true }
            )
            .setFooter({ text: "Keep grinding to reach the top!" })
            .setTimestamp();

          await message.reply({ embeds: [profileEmbed] });
          break;

        case "leaderboard":
        case "lb":
          const leaderboardType = args[1]?.toLowerCase() || "messages";
          const allLbUsers = await storage.getAllUsers();

          if (leaderboardType === "messages") {
            const messageLeaderboard = allLbUsers.sort((a, b) => b.messages - a.messages).slice(0, 10);
            const messageText = messageLeaderboard.map((u, i) => `**${i + 1}.** <@${u.id}> - ${u.messages} messages`).join('\n');

            const messageLbEmbed = new EmbedBuilder()
              .setColor(0x00AA00)
              .setTitle("💬 Message Leaderboard")
              .setDescription(messageText)
              .setFooter({ text: "Top 10 message senders" })
              .setTimestamp();

            await message.reply({ embeds: [messageLbEmbed] });
          } else if (leaderboardType === "catches") {
            const catchLeaderboard = allLbUsers.sort((a, b) => b.catches - a.catches).slice(0, 10);
            const catchText = catchLeaderboard.map((u, i) => `**${i + 1}.** <@${u.id}> - ${u.catches} catches | ✨ ${u.shinyCatches || 0} shiny | 💎 ${u.rareShinyCatches || 0} rare`).join('\n');

            const catchLbEmbed = new EmbedBuilder()
              .setColor(0xFF6B6B)
              .setTitle("🕸️ Catch Leaderboard")
              .setDescription(catchText)
              .setFooter({ text: "Top 10 catchers" })
              .setTimestamp();

            await message.reply({ embeds: [catchLbEmbed] });
          }
          break;

        case "withdraw":
          const withdrawAmount = parseInt(args[1]);

          if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            await message.reply("❌ Please provide a valid withdrawal amount. Usage: `Dwithdraw [amount]`");
            return;
          }

          let withdrawUser = await storage.getUser(userId);
          if (!withdrawUser) {
            withdrawUser = await storage.createUser({ id: userId, username, discriminator });
          }

          if (withdrawUser.pokecoins < withdrawAmount) {
            await message.reply(`❌ You don't have enough Pokecoins! You have **${withdrawUser.pokecoins}** but requested **${withdrawAmount}**.`);
            return;
          }

          pendingWithdrawals.set(userId, withdrawAmount);

          const withdrawEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("💰 Withdrawal Request")
            .setDescription(`You're about to withdraw **${withdrawAmount}** Pokecoins`)
            .addFields(
              { name: "🪙 Amount", value: `${withdrawAmount}`, inline: true },
              { name: "💼 Your Balance", value: `${withdrawUser.pokecoins}`, inline: true }
            )
            .setFooter({ text: "Click the button below to proceed and enter your Market ID" })
            .setTimestamp();

          const withdrawButton = new ButtonBuilder()
            .setCustomId(`withdraw_${userId}`)
            .setLabel("Confirm Withdrawal")
            .setStyle(ButtonStyle.Success);

          const row = new ActionRowBuilder().addComponents(withdrawButton);

          await message.reply({ embeds: [withdrawEmbed], components: [row] });
          break;

        case "event":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const settings = await storage.getBotSettings();

          if (!args[1]) {
            const eventStatusEmbed = new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle("⚙️ Event Status")
              .addFields(
                { name: "💬 Messages Event", value: settings.messageEventActive ? "✅ ON" : "❌ OFF", inline: true },
                { name: "🕸️ Catch Event", value: settings.catchEventActive ? "✅ ON" : "❌ OFF", inline: true }
              )
              .setFooter({ text: "Use Devent [messages/catches] [on/off] to toggle" })
              .setTimestamp();

            await message.reply({ embeds: [eventStatusEmbed] });
            return;
          }

          const eventType = args[1].toLowerCase();
          const eventStatus = args[2]?.toLowerCase();

          if (!["messages", "catches"].includes(eventType)) {
            await message.reply("❌ Invalid event type. Use `messages` or `catches`.");
            return;
          }

          if (!["on", "off"].includes(eventStatus)) {
            await message.reply("❌ Invalid status. Use `on` or `off`.");
            return;
          }

          const isActive = eventStatus === "on";

          if (eventType === "messages") {
            await storage.updateMessageEventStatus(isActive);
            await message.reply(`✅ Message event is now **${isActive ? "ON" : "OFF"}**`);
          } else {
            await storage.updateCatchEventStatus(isActive);
            await message.reply(`✅ Catch event is now **${isActive ? "ON" : "OFF"}**`);
          }
          break;

        case "rate":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const messagesPerReward = parseInt(args[1]);
          const coinAmount = parseInt(args[2]);

          if (isNaN(messagesPerReward) || isNaN(coinAmount)) {
            await message.reply("❌ Invalid parameters. Usage: `Drate [messages] [coins]`");
            return;
          }

          await storage.updateMessagesPerReward(messagesPerReward);
          await storage.updatePokecoinRate(coinAmount);
          await message.reply(`✅ Reward rate updated: **${coinAmount}** coins per **${messagesPerReward}** messages`);
          break;

        case "reset":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const resetType = args[1]?.toLowerCase();
          const resetTarget = args[2];

          if (!["messages", "catches", "all"].includes(resetType)) {
            await message.reply("❌ Invalid reset type. Use `messages`, `catches`, or `all`.");
            return;
          }

          if (resetTarget === "all") {
            await storage.resetAllUserStats(resetType);
            await message.reply(`✅ All user **${resetType}** stats have been reset`);
          } else {
            const resetUser = await storage.getUser(resetTarget);
            if (!resetUser) {
              await message.reply(`❌ User with ID **${resetTarget}** not found.`);
              return;
            }

            await storage.resetUserStats(resetTarget, resetType);
            await message.reply(`✅ Reset **${resetType}** stats for <@${resetTarget}>`);
          }
          break;

        case "resetbal":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const targetUserId = args[1];
          const newBalance = parseInt(args[2]);

          if (!targetUserId || isNaN(newBalance)) {
            await message.reply("❌ Invalid parameters. Usage: `Dresetbal [user_id] [amount]`");
            return;
          }

          let targetUser = await storage.getUser(targetUserId);
          if (!targetUser) {
            await message.reply(`❌ User with ID **${targetUserId}** not found.`);
            return;
          }

          await storage.setUserPokecoins(targetUserId, newBalance);
          await message.reply(`✅ Set balance for <@${targetUserId}> to **${newBalance}** Pokecoins`);
          break;

        case "setproofs":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const proofsChannelId = args[1]?.replace(/[<#>]/g, '');

          if (!proofsChannelId) {
            await message.reply("❌ Please provide a channel ID. Usage: `Dsetproofs [channel_id]`");
            return;
          }

          try {
            const testChannel = await message.client.channels.fetch(proofsChannelId);
            if (!testChannel || !testChannel.isTextBased()) {
              await message.reply("❌ Invalid channel. Please provide a valid text channel ID.");
              return;
            }
          } catch (error) {
            await message.reply("❌ Channel not found or not accessible. Please check the channel ID.");
            return;
          }

          await storage.setProofsChannel(proofsChannelId);
          await message.reply(`✅ Proofs channel set to <#${proofsChannelId}>`);
          break;

        case "setwithdrawal":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const withdrawalChannelId = args[1]?.replace(/[<#>]/g, '');

          if (!withdrawalChannelId) {
            await message.reply("❌ Please provide a channel ID. Usage: `Dsetwithdrawal [channel_id]`");
            return;
          }

          try {
            const testWithdrawalChannel = await message.client.channels.fetch(withdrawalChannelId);
            if (!testWithdrawalChannel || !testWithdrawalChannel.isTextBased()) {
              await message.reply("❌ Invalid channel. Please provide a valid text channel ID.");
              return;
            }
          } catch (error) {
            await message.reply("❌ Channel not found or not accessible. Please check the channel ID.");
            return;
          }

          await storage.setWithdrawalChannel(withdrawalChannelId);
          await message.reply(`✅ Withdrawal channel set to <#${withdrawalChannelId}>`);
          break;

        case "addcounting":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const addChannelId = args[1]?.replace(/[<#>]/g, '');

          if (!addChannelId) {
            await message.reply("❌ Please provide a channel ID. Usage: `Daddcounting [channel_id]`");
            return;
          }

          try {
            const testAddChannel = await message.client.channels.fetch(addChannelId);
            if (!testAddChannel || !testAddChannel.isTextBased()) {
              await message.reply("❌ Invalid channel. Please provide a valid text channel ID.");
              return;
            }
          } catch (error) {
            await message.reply("❌ Channel not found or not accessible. Please check the channel ID.");
            return;
          }

          await storage.addCountingChannel(addChannelId);
          await message.reply(`✅ Added <#${addChannelId}> to counting channels`);
          break;

        case "removecounting":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const removeChannelId = args[1]?.replace(/[<#>]/g, '');

          if (!removeChannelId) {
            await message.reply("❌ Please provide a channel ID. Usage: `Dremovecounting [channel_id]`");
            return;
          }

          await storage.removeCountingChannel(removeChannelId);
          await message.reply(`✅ Removed <#${removeChannelId}> from counting channels`);
          break;

        case "channels":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const currentSettings = await storage.getBotSettings();
          
          const cleanProofsId = currentSettings.proofsChannelId?.replace(/[<#>]/g, '') || '';
          const cleanWithdrawalId = currentSettings.withdrawalChannelId?.replace(/[<#>]/g, '') || '';
          const cleanCountingIds = currentSettings.countingChannels.map(id => id.replace(/[<#>]/g, ''));
          
          const countingList = cleanCountingIds.length > 0 
            ? cleanCountingIds.map(id => `<#${id}>`).join(", ")
            : "None";

          const channelsEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("⚙️ Channel Configuration")
            .addFields(
              { name: "📝 Proofs Channel", value: cleanProofsId ? `<#${cleanProofsId}>` : "Not set", inline: false },
              { name: "💰 Withdrawal Channel", value: cleanWithdrawalId ? `<#${cleanWithdrawalId}>` : "Not set", inline: false },
              { name: "💬 Counting Channels", value: countingList, inline: false }
            )
            .setFooter({ text: "Use Dsetproofs, Dsetwithdrawal, Daddcounting, Dremovecounting to configure" })
            .setTimestamp();

          await message.reply({ embeds: [channelsEmbed] });
          break;

        default:
          break;
      }
    } catch (error) {
      console.error(`Error handling command ${command}:`, error);
      await message.reply("❌ An error occurred while processing your command.");
    }
  }

  console.log('[BOT] About to call client.login()...');
  client.login(token).then(() => {
    console.log('[BOT] Login promise resolved');
  }).catch(err => {
    console.error('[BOT] Login error:', err);
  });

  console.log('[BOT] startDiscordBot() returning');
  return client;
}
