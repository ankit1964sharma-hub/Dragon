import { Client, GatewayIntentBits, Message, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { storage } from "./storage";

const PREFIX = "D";
const ADMIN_ID = "763625050213187614";
const POKETWO_BOT_ID = "716390085896962058"; // Poketwo bot ID

// Store pending withdrawals temporarily (userId -> amount)
const pendingWithdrawals = new Map<string, number>();

export function startDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    console.error("❌ DISCORD_BOT_TOKEN not found in environment variables");
    return;
  }

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

  // Handle button clicks and modal submissions
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // Handle button clicks
      if (interaction.isButton()) {
        const customId = interaction.customId;

        // Check if it's a withdrawal button
        if (customId.startsWith('withdraw_')) {
          const userId = customId.split('_')[1];

          // Verify the user clicking is the same user who initiated
          if (interaction.user.id !== userId) {
            await interaction.reply({ content: "❌ This withdrawal request is not for you!", ephemeral: true });
            return;
          }

          // Get the pending amount
          const amount = pendingWithdrawals.get(userId);
          if (!amount) {
            await interaction.reply({ content: "❌ Withdrawal request expired. Please start a new withdrawal.", ephemeral: true });
            return;
          }

          // Create modal for market ID input
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

          const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(marketIdInput);
          modal.addComponents(actionRow);

          await interaction.showModal(modal);
        }
      }

      // Handle modal submissions
      if (interaction.isModalSubmit()) {
        const customId = interaction.customId;

        if (customId.startsWith('withdraw_modal_')) {
          try {
            const userId = customId.split('_')[2];
            const marketId = interaction.fields.getTextInputValue('market_id_input').trim();

            console.log(`[WITHDRAW MODAL] User ${userId} submitted market ID: ${marketId}`);

            // Get the pending amount
            const amount = pendingWithdrawals.get(userId);
            if (!amount) {
              console.log(`[WITHDRAW MODAL] No pending withdrawal found for user ${userId}`);
              await interaction.reply({ content: "❌ Withdrawal request expired. Please start a new withdrawal.", ephemeral: true });
              return;
            }

            console.log(`[WITHDRAW MODAL] Pending amount: ${amount}`);

            // Remove from pending
            pendingWithdrawals.delete(userId);

            const username = interaction.user.username;

            // Validate market ID
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

            // Get withdrawal requests count to assign a number
            const withdrawalMessages = await storage.getWithdrawalRequestsCount();
            const requestNumber = withdrawalMessages + 1;

            console.log(`[WITHDRAW MODAL] Creating request #${requestNumber} for user ${userId}, amount: ${amount}, marketId: ${marketId}`);

            // Store withdrawal request
            const withdrawalRequest = await storage.createWithdrawalRequest({
              userId,
              marketId,
              requestNumber,
              amount,
              status: "pending"
            });

            console.log(`[WITHDRAW MODAL] Request created:`, withdrawalRequest);

            // Send embed to withdrawal channel
            // Clean the channel ID in case it has Discord formatting
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

  client.on(Events.MessageCreate, async (message: Message) => {
    const userId = message.author.id;
    const username = message.author.username;
    const discriminator = message.author.discriminator;
    const channelId = message.channel.id;
    const content = message.content;

    // Detect Poketwo catches (when bot sends catch confirmation)
    if (message.author.bot && message.author.id === POKETWO_BOT_ID) {
      try {
        // Check if catch event is active
        const settings = await storage.getBotSettings();

        // Get user mention first
        const userMention = message.mentions.users.first();
        if (!userMention) {
          return; // No user mentioned, not a catch
        }

        // Validate this is actually a Pokemon catch message
        // Real catches have "Congratulations" AND user mention AND "caught" in content OR embed
        const hasCongrats = content.toLowerCase().includes("congratulations");
        const embedDescription = message.embeds?.[0]?.description?.toLowerCase() || "";
        const fullText = (content + " " + embedDescription).toLowerCase();

        const hasCaught = fullText.includes("caught");

        // Filter out event messages (they usually say "bonus" or "event" or "halloween")
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

        // Only count if catch event is active
        if (!settings.catchEventActive) {
          console.log(`[CATCH] Catch event inactive - not counting`);
          return;
        }

        // Determine catch type from content and embed
        const isRareShiny = fullText.includes("✨") && fullText.includes("these colors seem unusual");
        const isShiny = fullText.includes("✨") && !isRareShiny;

        // Get or create user
        let user = await storage.getUser(catchUserId);
        if (!user) {
          user = await storage.createUser({
            id: catchUserId,
            username: catchUsername,
            discriminator: catchDiscriminator
          });
        }

        // Increment catch count based on type
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

    // Ignore other bot messages
    if (message.author.bot) return;

    try {
      // Handle commands with prefix
      if (content.startsWith(PREFIX)) {
        await handleCommand(message);
        return;
      }

      // Handle -payed special case
      if (content.startsWith("-payed")) {
        await handlePayedCommand(message);
        return;
      }

      console.log(`[MESSAGE] Received from ${username} in channel ${channelId}: "${content.substring(0, 50)}..."`);

      // Get settings first
      const settings = await storage.getBotSettings();

      // Check if message event is active
      if (!settings.messageEventActive) {
        console.log(`[MESSAGE] Message event inactive - not saving or counting`);
        return;
      }

      // Check if we should count this channel
      const shouldCount = settings.countingChannels.includes(channelId);

      console.log(`[MESSAGE] Should count: ${shouldCount}, Counting channels:`, settings.countingChannels);

      if (!shouldCount) {
        console.log(`[MESSAGE] Channel ${channelId} not in counting list - not saving`);
        return;
      }

      // Save message with spam check
      const { message: savedMessage, spam } = await storage.createMessageWithSpamCheck(
        content,
        userId,
        channelId,
        false
      );

      // Get or create user
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.createUser({ id: userId, username, discriminator });
      }

      // Only increment if not spam
      if (!spam.blocked) {
        console.log(`[MESSAGE] Valid message - counting for ${username}`);
        await storage.incrementUserMessages(userId, channelId);
      } else {
        // Mark spam with emoji only
        console.log(`[MESSAGE] Spam detected: ${spam.reason}`);
        await message.react("💣");
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  async function handlePayedCommand(message: Message) {
    try {
      const settings = await storage.getBotSettings();

      // -payed must be used in the WITHDRAWAL channel
      // Clean both IDs for comparison
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

      // Get withdrawal request
      const request = await storage.getWithdrawalRequestByNumber(requestNumber);

      if (!request) {
        await message.reply(`❌ Withdrawal request #${requestNumber} not found.`);
        return;
      }

      if (request.status === "completed") {
        await message.reply(`❌ Withdrawal request #${requestNumber} has already been processed.`);
        return;
      }

      // Get user info
      const user = await storage.getUser(request.userId);

      if (!user) {
        await message.reply(`❌ User not found for withdrawal request #${requestNumber}.`);
        return;
      }

      // Check if user has sufficient balance
      if (user.pokecoins < request.amount) {
        await message.reply(`❌ User <@${request.userId}> has insufficient balance! They have **${user.pokecoins}** Pokecoins but request is for **${request.amount}** Pokecoins.\n\n⚠️ This withdrawal request cannot be completed.`);
        return;
      }

      // First, deduct the pokecoins - this validates the balance
      const updatedUser = await storage.deductUserPokecoins(request.userId, request.amount);

      // Only after successful deduction, mark the request as completed
      const completionResult = await storage.completeWithdrawalIfPending(requestNumber);

      if (!completionResult.success) {
        // Request was already processed - refund the coins
        await storage.addUserPokecoins(request.userId, request.amount);
        await message.reply(`❌ Withdrawal request #${requestNumber} has already been processed. Coins have been refunded.`);
        return;
      }

      // Send confirmation in withdrawal channel
      await message.react("✅");
      await message.reply(`✅ Payment processed for request #${requestNumber}. Proof sent to proofs channel.`);

      // Send detailed proof to the PROOFS channel
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

  async function handleCommand(message: Message) {
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const userId = message.author.id;
    const username = message.author.username;
    const discriminator = message.author.discriminator;

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

        case "leaderboard":
        case "lb":
          const lbType = args[1]?.toLowerCase();
          const users = await storage.getAllUsers();

          if (users.length === 0) {
            await message.reply("📊 No users yet!");
            return;
          }

          if (lbType === "catches") {
            // Catches Leaderboard
            const sortedByCatches = users.sort((a, b) => b.catches - a.catches).slice(0, 10);
            const totalCatches = users.reduce((sum, u) => sum + u.catches, 0);

            const catchesDescription = sortedByCatches
              .map((u, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**#${i + 1}**`;
                return `${medal} <@${u.id}>\n🕸️ **${u.catches}** catches | 🪙 ${u.pokecoins} coins`;
              })
              .join("\n\n");

            const catchesEmbed = new EmbedBuilder()
              .setColor(0xFF6B6B)
              .setTitle("🕸️ Catches Leaderboard")
              .setDescription(catchesDescription || "No catches yet!")
              .addFields(
                { name: "📈 Total Catches", value: `${totalCatches}`, inline: true },
                { name: "👥 Active Users", value: `${users.length}`, inline: true }
              )
              .setFooter({ text: "Keep catching to climb the ranks!" })
              .setTimestamp();

            await message.reply({ embeds: [catchesEmbed] });
          } else if (lbType === "messages") {
            // Messages Leaderboard
            const sortedByMessages = users.sort((a, b) => b.messages - a.messages).slice(0, 10);
            const totalMessages = users.reduce((sum, u) => sum + u.messages, 0);

            const messagesDescription = sortedByMessages
              .map((u, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**#${i + 1}**`;
                return `${medal} <@${u.id}>\n💬 **${u.messages}** messages | 🪙 ${u.pokecoins} coins`;
              })
              .join("\n\n");

            const messagesEmbed = new EmbedBuilder()
              .setColor(0x4CAF50)
              .setTitle("💬 Messages Leaderboard")
              .setDescription(messagesDescription || "No messages yet!")
              .addFields(
                { name: "📈 Total Messages", value: `${totalMessages}`, inline: true },
                { name: "👥 Active Users", value: `${users.length}`, inline: true }
              )
              .setFooter({ text: "Keep chatting to earn more rewards!" })
              .setTimestamp();

            await message.reply({ embeds: [messagesEmbed] });
          } else {
            await message.reply("Please specify leaderboard type: `Dlb messages` or `Dlb catches`");
          }
          break;

        case "profile":
          let user = await storage.getUser(userId);
          if (!user) {
            user = await storage.createUser({ id: userId, username, discriminator });
          }

          const allUsers = await storage.getAllUsers();
          const messageRank = allUsers.sort((a, b) => b.messages - a.messages).findIndex(u => u.id === userId) + 1;
          const catchRank = allUsers.sort((a, b) => b.catches - a.catches).findIndex(u => u.id === userId) + 1;

          const profileEmbed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`📊 ${username}'s Profile`)
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
              { name: "💬 Messages", value: `**${user.messages}**\nRank: #${messageRank}`, inline: true },
              { name: "🕸️ Catches", value: `**${user.catches}**\nRank: #${catchRank}`, inline: true },
              { name: "🪙 Pokecoins", value: `**${user.pokecoins}**`, inline: true }
            )
            .setFooter({ text: `User ID: ${userId}` })
            .setTimestamp();

          await message.reply({ embeds: [profileEmbed] });
          break;

        case "event":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const eventType = args[1]?.toLowerCase();
          const state = args[2]?.toLowerCase();

          if (!eventType || !state) {
            const settings = await storage.getBotSettings();
            const statusEmbed = new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle("📊 Event Status")
              .addFields(
                { name: "💬 Messages Event", value: settings.messageEventActive ? "✅ Active" : "🛑 Inactive", inline: true },
                { name: "🕸️ Catches Event", value: settings.catchEventActive ? "✅ Active" : "🛑 Inactive", inline: true }
              )
              .setFooter({ text: "Usage: Devent [messages/catches] [on/off]" })
              .setTimestamp();
            await message.reply({ embeds: [statusEmbed] });
            return;
          }

          if (eventType === "messages" || eventType === "message") {
            if (state === "on") {
              await storage.updateMessageEventStatus(true);
              const eventEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("✅ Messages Event Activated")
                .setDescription("Users can now earn rewards from messages!")
                .setTimestamp();
              await message.reply({ embeds: [eventEmbed] });
            } else if (state === "off") {
              await storage.updateMessageEventStatus(false);
              const eventEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle("🛑 Messages Event Deactivated")
                .setDescription("Message rewards are paused.")
                .setTimestamp();
              await message.reply({ embeds: [eventEmbed] });
            } else {
              await message.reply("Usage: `Devent messages on` or `Devent messages off`");
            }
          } else if (eventType === "catches" || eventType === "catch") {
            if (state === "on") {
              await storage.updateCatchEventStatus(true);
              const eventEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle("✅ Catches Event Activated")
                .setDescription("Catches will now be counted!")
                .setTimestamp();
              await message.reply({ embeds: [eventEmbed] });
            } else if (state === "off") {
              await storage.updateCatchEventStatus(false);
              const eventEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle("🛑 Catches Event Deactivated")
                .setDescription("Catches will not be counted.")
                .setTimestamp();
              await message.reply({ embeds: [eventEmbed] });
            } else {
              await message.reply("Usage: `Devent catches on` or `Devent catches off`");
            }
          } else {
            await message.reply("Usage: `Devent [messages/catches] [on/off]`");
          }
          break;

        case "reset":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const targetType = args[1]?.toLowerCase();
          const targetUser = args[2];

          if (!["messages", "catches", "all"].includes(targetType)) {
            await message.reply("Usage: `Dreset [messages/catches/all] [user_id/all]`");
            return;
          }

          if (targetUser === "all") {
            await storage.resetAllUserStats(targetType as any);
            await message.reply(`✅ Reset **${targetType}** for **all users**.`);
          } else if (targetUser) {
            await storage.resetUserStats(targetUser, targetType as any);
            await message.reply(`✅ Reset **${targetType}** for <@${targetUser}>.`);
          } else {
            await message.reply("Please specify a user ID or 'all'");
          }
          break;

        case "resetbal":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const balTargetUser = args[1]?.trim();
          const balAmountStr = args[2]?.trim();

          if (!balTargetUser || !balAmountStr) {
            await message.reply("Usage: `Dresetbal [user_id] [amount]`\nExample: `Dresetbal 123456789 0` (reset to 0)\nExample: `Dresetbal 123456789 1000` (set to 1000)");
            return;
          }

          const balAmount = parseInt(balAmountStr, 10);

          if (isNaN(balAmount)) {
            await message.reply("❌ Amount must be a valid number.");
            return;
          }

          if (balAmount < 0) {
            await message.reply("❌ Amount must be 0 or greater.");
            return;
          }

          try {
            const balUser = await storage.getUser(balTargetUser);
            if (!balUser) {
              await message.reply(`❌ User <@${balTargetUser}> not found.`);
              return;
            }

            const oldBalance = balUser.pokecoins;
            await storage.setUserPokecoins(balTargetUser, balAmount);
            
            const balEmbed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle("✅ Balance Reset")
              .setDescription(`Successfully updated balance for <@${balTargetUser}>`)
              .addFields(
                { name: "👤 User", value: `<@${balTargetUser}>`, inline: true },
                { name: "💰 Old Balance", value: `${oldBalance} Pokecoins`, inline: true },
                { name: "💰 New Balance", value: `${balAmount} Pokecoins`, inline: true }
              )
              .setTimestamp();
            
            await message.reply({ embeds: [balEmbed] });
          } catch (balError) {
            await message.reply(`❌ Failed to reset balance: ${balError instanceof Error ? balError.message : "Unknown error"}`);
          }
          break;

        case "rate":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const messagesCount = parseInt(args[1]);
          const coinsAmount = parseInt(args[2]);

          if (isNaN(messagesCount) || isNaN(coinsAmount)) {
            await message.reply("Usage: `Drate [messages] [coins]`\nExample: `Drate 50 50000` (every 50 messages = 50000 coins)");
            return;
          }

          await storage.updateMessagesPerReward(messagesCount);
          await storage.updatePokecoinRate(coinsAmount);
          await message.reply(`✅ Rate updated: Every **${messagesCount}** messages = **${coinsAmount}** Pokecoins`);
          break;

        case "withdraw":
          try {
            const amount = parseInt(args[1]);

            if (!amount || isNaN(amount)) {
              const withdrawEmbed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle("💰 Withdrawal Request")
                .setDescription("Please specify the amount of Pokecoins to withdraw")
                .addFields(
                  { name: "📝 How to use", value: "`Dwithdraw [amount]`", inline: false },
                  { name: "📌 Example", value: "`Dwithdraw 30000`", inline: false },
                  { name: "💡 Next Step", value: "Click the button below to enter your Market ID", inline: false }
                )
                .setFooter({ text: "Make sure you have enough Pokecoins!" })
                .setTimestamp();

              await message.reply({ embeds: [withdrawEmbed] });
              return;
            }

            let withdrawUser = await storage.getUser(userId);
            if (!withdrawUser) {
              withdrawUser = await storage.createUser({ id: userId, username, discriminator });
            }

            // Check if user has enough pokecoins
            if (withdrawUser.pokecoins <= 0) {
              await message.reply("❌ You don't have any Pokecoins to withdraw!");
              return;
            }

            if (amount > withdrawUser.pokecoins) {
              await message.reply(`❌ You don't have enough Pokecoins! You have **${withdrawUser.pokecoins}** Pokecoins but tried to withdraw **${amount}** Pokecoins.`);
              return;
            }

            if (amount <= 0) {
              await message.reply("❌ Withdrawal amount must be greater than 0!");
              return;
            }

            // Store the pending withdrawal amount
            pendingWithdrawals.set(userId, amount);

            // Create a button for the user to click
            const button = new ButtonBuilder()
              .setCustomId(`withdraw_${userId}`)
              .setLabel("📝 Enter Market ID")
              .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(button);

            const buttonEmbed = new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle("💰 Withdrawal Request")
              .setDescription(`You are withdrawing **${amount}** Pokecoins.\n\n**Current Balance:** ${withdrawUser.pokecoins} Pokecoins\n**After Withdrawal:** ${withdrawUser.pokecoins - amount} Pokecoins`)
              .addFields(
                { name: "📋 Next Step", value: "Click the button below to enter your Market ID", inline: false }
              )
              .setFooter({ text: "Button will expire in 5 minutes" })
              .setTimestamp();

            await message.reply({ embeds: [buttonEmbed], components: [row] });
          } catch (withdrawError) {
            console.error("[WITHDRAW] Error processing withdrawal:", withdrawError);
            await message.reply("❌ Failed to process withdrawal request. Please try again or contact an admin.");
          }
          break;

        case "setproofs":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const proofsChannelId = args[1];
          if (!proofsChannelId) {
            await message.reply("Usage: `Dsetproofs [channel_id]`\nExample: `Dsetproofs 123456789` or mention the channel");
            return;
          }

          // Clean the channel ID (remove <#> if present) and validate
          const cleanProofsChannelId = proofsChannelId.replace(/[<#>]/g, '');
          
          if (!/^\d+$/.test(cleanProofsChannelId)) {
            await message.reply("❌ Invalid channel ID. Please provide a valid channel ID (numeric) or mention the channel.");
            return;
          }

          // Verify the channel exists and is text-based
          try {
            const testProofsChannel = await message.client.channels.fetch(cleanProofsChannelId);
            if (!testProofsChannel || !testProofsChannel.isTextBased()) {
              await message.reply("❌ Channel not found or is not a text channel. Please provide a valid text channel.");
              return;
            }
          } catch (proofsError) {
            await message.reply("❌ Could not fetch channel. Please verify the channel ID is correct and the bot has access to it.");
            return;
          }

          await storage.setProofsChannel(cleanProofsChannelId);
          await message.reply(`✅ Proofs channel set to <#${cleanProofsChannelId}>`);
          break;

        case "setwithdrawal":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const withdrawalChannelId = args[1];
          if (!withdrawalChannelId) {
            await message.reply("Usage: `Dsetwithdrawal [channel_id]`\nExample: `Dsetwithdrawal 123456789` or mention the channel");
            return;
          }

          // Clean the channel ID (remove <#> if present) and validate
          const cleanWithdrawalChannelId = withdrawalChannelId.replace(/[<#>]/g, '');
          
          if (!/^\d+$/.test(cleanWithdrawalChannelId)) {
            await message.reply("❌ Invalid channel ID. Please provide a valid channel ID (numeric) or mention the channel.");
            return;
          }

          // Verify the channel exists and is text-based
          try {
            const testChannel = await message.client.channels.fetch(cleanWithdrawalChannelId);
            if (!testChannel || !testChannel.isTextBased()) {
              await message.reply("❌ Channel not found or is not a text channel. Please provide a valid text channel.");
              return;
            }
          } catch (channelError) {
            await message.reply("❌ Could not fetch channel. Please verify the channel ID is correct and the bot has access to it.");
            return;
          }

          await storage.setWithdrawalChannel(cleanWithdrawalChannelId);
          await message.reply(`✅ Withdrawal channel set to <#${cleanWithdrawalChannelId}>`);
          break;

        case "addcounting":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const countingChannelId = args[1];
          if (!countingChannelId) {
            await message.reply("Usage: `Daddcounting [channel_id]`\nExample: `Daddcounting 123456789`");
            return;
          }

          // Clean the channel ID (remove <#> if present)
          const cleanChannelId = countingChannelId.replace(/[<#>]/g, '');
          
          // Validate that it's a valid snowflake ID (Discord IDs are numeric strings)
          if (!/^\d+$/.test(cleanChannelId)) {
            await message.reply("❌ Invalid channel ID. Please provide a valid channel ID or mention.");
            return;
          }

          await storage.addCountingChannel(cleanChannelId);
          await message.reply(`✅ Added <#${cleanChannelId}> to counting channels`);
          break;

        case "removecounting":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const removeChannelId = args[1];
          if (!removeChannelId) {
            await message.reply("Usage: `Dremovecounting [channel_id]`\nExample: `Dremovecounting 123456789`");
            return;
          }

          // Clean the channel ID (remove <#> if present)
          const cleanRemoveChannelId = removeChannelId.replace(/[<#>]/g, '');
          
          // Validate that it's a valid snowflake ID
          if (!/^\d+$/.test(cleanRemoveChannelId)) {
            await message.reply("❌ Invalid channel ID. Please provide a valid channel ID or mention.");
            return;
          }

          await storage.removeCountingChannel(cleanRemoveChannelId);
          await message.reply(`✅ Removed <#${cleanRemoveChannelId}> from counting channels`);
          break;

        case "channels":
          if (userId !== ADMIN_ID) {
            await message.reply("❌ You do not have permission to use this command.");
            return;
          }

          const currentSettings = await storage.getBotSettings();
          
          // Clean all channel IDs before displaying
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
          // Unknown command - ignore silently
          break;
      }
    } catch (error) {
      console.error(`Error handling command ${command}:`, error);
      await message.reply("❌ An error occurred while processing your command.");
    }
  }

  client.login(token);

  return client;
}