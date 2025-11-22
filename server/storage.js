import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  users,
  botSettings,
  messages,
  withdrawalRequests,
} from "../shared/schema.js";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool });

export class DatabaseStorage {
  async getUser(id) {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async createUser(insertUser) {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getAllUsers() {
    return await db.select().from(users);
  }

  async checkIsSpam(userId, content, channelId) {
    const settings = await this.getBotSettings();

    if (!settings.antiSpamEnabled) {
      return { isSpam: false };
    }

    if (content.trim().length < settings.minMessageLength) {
      return { isSpam: true, reason: "Message too short" };
    }

    const recentMessages = await this.getRecentMessagesByUser(userId, settings.spamTimeWindow);

    if (recentMessages.length >= settings.maxMessagesInWindow) {
      return { isSpam: true, reason: "Too many messages in short time" };
    }

    return { isSpam: false };
  }

  async getRecentMessagesByUser(userId, seconds) {
    const timeThreshold = new Date(Date.now() - seconds * 1000);

    const result = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.authorId, userId),
          gte(messages.timestamp, timeThreshold),
          eq(messages.isBot, false)
        )
      )
      .orderBy(desc(messages.timestamp));

    return result;
  }

  async incrementUserMessages(userId, channelId) {
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    const settings = await this.getBotSettings();

    console.log(`[MESSAGE COUNT] User: ${userId}, Channel: ${channelId}`);
    console.log(`[MESSAGE COUNT] Message Event Active: ${settings.messageEventActive}`);
    console.log(`[MESSAGE COUNT] Counting Channels:`, settings.countingChannels);
    console.log(`[MESSAGE COUNT] Channel in list: ${settings.countingChannels.includes(channelId)}`);

    if (!settings.messageEventActive) {
      console.log(`[MESSAGE COUNT] Message event inactive - not counting`);
      return user;
    }

    if (!settings.countingChannels.includes(channelId)) {
      console.log(`[MESSAGE COUNT] Channel not in counting list - not counting`);
      return user;
    }

    const newMessages = user.messages + 1;
    let newPokecoins = user.pokecoins;

    if (newMessages % settings.messagesPerReward === 0) {
      newPokecoins += settings.pokecoinRate;
      console.log(`[MESSAGE COUNT] Awarded ${settings.pokecoinRate} pokecoins! Total: ${newPokecoins}`);
    }

    console.log(`[MESSAGE COUNT] Incrementing messages: ${user.messages} -> ${newMessages}`);

    const result = await db
      .update(users)
      .set({ messages: newMessages, pokecoins: newPokecoins })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async incrementUserCatches(userId) {
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    const result = await db
      .update(users)
      .set({ catches: user.catches + 1 })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async incrementUserShinyCatches(userId) {
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    const result = await db
      .update(users)
      .set({
        catches: user.catches + 1,
        shinyCatches: (user.shinyCatches || 0) + 1
      })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async incrementUserRareShinyCatches(userId) {
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    const result = await db
      .update(users)
      .set({
        catches: user.catches + 1,
        shinyCatches: (user.shinyCatches || 0) + 1,
        rareShinyCatches: (user.rareShinyCatches || 0) + 1
      })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async addUserPokecoins(userId, amount) {
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    const result = await db
      .update(users)
      .set({ pokecoins: user.pokecoins + amount })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async deductUserPokecoins(userId, amount) {
    let user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.pokecoins < amount) {
      throw new Error(`Insufficient balance: User has ${user.pokecoins} Pokecoins but ${amount} is required`);
    }

    const newBalance = user.pokecoins - amount;

    const result = await db
      .update(users)
      .set({ pokecoins: newBalance })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async setUserPokecoins(userId, amount) {
    let user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const result = await db
      .update(users)
      .set({ pokecoins: amount })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async resetUserStats(userId, type) {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const updates = {};
    if (type === "messages" || type === "all") updates.messages = 0;
    if (type === "catches" || type === "all") updates.catches = 0;

    const result = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async resetAllUserStats(type) {
    if (type === 'messages') {
      await db.update(users).set({ messages: 0 });
    } else if (type === 'catches') {
      await db.update(users).set({ catches: 0, shinyCatches: 0, rareShinyCatches: 0 });
    } else {
      await db.update(users).set({ messages: 0, catches: 0, shinyCatches: 0, rareShinyCatches: 0, pokecoins: 0 });
    }
  }

  async setProofsChannel(channelId) {
    const settings = await this.getBotSettings();
    await db.update(botSettings).set({ proofsChannelId: channelId }).where(eq(botSettings.id, settings.id));
  }

  async setWithdrawalChannel(channelId) {
    const settings = await this.getBotSettings();
    await db.update(botSettings).set({ withdrawalChannelId: channelId }).where(eq(botSettings.id, settings.id));
  }

  async addCountingChannel(channelId) {
    const settings = await this.getBotSettings();
    const currentChannels = settings.countingChannels || [];
    if (!currentChannels.includes(channelId)) {
      await db.update(botSettings)
        .set({ countingChannels: [...currentChannels, channelId] })
        .where(eq(botSettings.id, settings.id));
    }
  }

  async removeCountingChannel(channelId) {
    const settings = await this.getBotSettings();
    const updatedChannels = settings.countingChannels.filter(id => id !== channelId);
    await db
      .update(botSettings)
      .set({ countingChannels: updatedChannels })
      .where(eq(botSettings.id, settings.id));
  }

  async createWithdrawalRequest(request) {
    const result = await db
      .insert(withdrawalRequests)
      .values(request)
      .returning();
    return result[0];
  }

  async getWithdrawalRequestByNumber(requestNumber) {
    const result = await db
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.requestNumber, requestNumber))
      .limit(1);
    return result[0];
  }

  async getWithdrawalRequestsCount() {
    const result = await db
      .select()
      .from(withdrawalRequests);
    return result.length;
  }

  async updateWithdrawalRequestStatus(requestNumber, status) {
    const result = await db
      .update(withdrawalRequests)
      .set({ status })
      .where(eq(withdrawalRequests.requestNumber, requestNumber))
      .returning();
    return result[0];
  }

  async completeWithdrawalIfPending(requestNumber) {
    const result = await db
      .update(withdrawalRequests)
      .set({ status: "completed" })
      .where(sql`${withdrawalRequests.requestNumber} = ${requestNumber} AND ${withdrawalRequests.status} = 'pending'`)
      .returning();
    
    if (result.length === 0) {
      return { success: false };
    }
    
    return { success: true, request: result[0] };
  }

  async getBotSettings() {
    const result = await db.select().from(botSettings);
    if (result.length === 0) {
      const newSettings = await db.insert(botSettings).values({}).returning();
      return newSettings[0];
    }
    return result[0];
  }

  async updateMessageEventStatus(active) {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ messageEventActive: active })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateCatchEventStatus(active) {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ catchEventActive: active })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updatePokecoinRate(rate) {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ pokecoinRate: rate })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateMessagesPerReward(count) {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ messagesPerReward: count })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateCountingChannels(channels) {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ countingChannels: channels })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateProofsChannel(channelId) {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ proofsChannelId: channelId })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateAntiSpamSettings(
    enabled,
    timeWindow,
    maxMessages,
    minLength
  ) {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({
        antiSpamEnabled: enabled,
        spamTimeWindow: timeWindow,
        maxMessagesInWindow: maxMessages,
        minMessageLength: minLength
      })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async createMessageWithSpamCheck(
    content,
    authorId,
    channelId,
    isBot
  ) {
    let spamCheck = { isSpam: false };
    if (!isBot) {
      spamCheck = await this.checkIsSpam(authorId, content, channelId);
    }

    const result = await db.insert(messages).values({
      content,
      authorId,
      channelId,
      isBot,
    }).returning();

    const message = result[0];

    if (spamCheck.isSpam || !spamCheck.isSpam) {
      const updated = await db
        .update(messages)
        .set({
          isSpam: spamCheck.isSpam,
          isCounted: !spamCheck.isSpam
        })
        .where(eq(messages.id, message.id))
        .returning();

      return {
        message: updated[0],
        spam: { blocked: spamCheck.isSpam, reason: spamCheck.reason }
      };
    }

    return {
      message,
      spam: { blocked: false }
    };
  }

  async getMessagesByChannel(channelId, limit = 100) {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.channelId, channelId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
  }

  async getAllMessages(limit = 100) {
    return await db
      .select()
      .from(messages)
      .orderBy(desc(messages.timestamp))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
