import { pgTable, text, integer, boolean, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  discriminator: text("discriminator").notNull(),
  messages: integer("messages").notNull().default(0),
  catches: integer("catches").notNull().default(0),
  shinyCatches: integer("shiny_catches").notNull().default(0),
  rareShinyCatches: integer("rare_shiny_catches").notNull().default(0),
  pokecoins: integer("pokecoins").notNull().default(0),
});

export const botSettings = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  messageEventActive: boolean("message_event_active").notNull().default(true),
  catchEventActive: boolean("catch_event_active").notNull().default(true),
  pokecoinRate: integer("pokecoin_rate").notNull().default(10),
  messagesPerReward: integer("messages_per_reward").notNull().default(10),
  countingChannels: text("counting_channels").array().notNull().default([]),
  proofsChannelId: text("proofs_channel_id"),
  withdrawalChannelId: text("withdrawal_channel_id"),
  adminUserId: text("admin_user_id").notNull().default("763625050213187614"),
  // Anti-spam settings
  antiSpamEnabled: boolean("anti_spam_enabled").notNull().default(true),
  spamTimeWindow: integer("spam_time_window").notNull().default(5), // seconds
  maxMessagesInWindow: integer("max_messages_in_window").notNull().default(3), // max messages allowed in time window
  minMessageLength: integer("min_message_length").notNull().default(3), // minimum characters to count as valid
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  authorId: text("author_id").notNull(),
  channelId: text("channel_id").notNull(),
  isBot: boolean("is_bot").notNull().default(false),
  isCounted: boolean("is_counted").notNull().default(true), // whether this message counted towards stats
  isSpam: boolean("is_spam").notNull().default(false), // flagged as spam
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  marketId: text("market_id").notNull(),
  requestNumber: integer("request_number").notNull().unique(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"), // pending, completed, cancelled
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ 
  messages: true, 
  catches: true, 
  pokecoins: true 
});

export const insertBotSettingsSchema = createInsertSchema(botSettings).omit({ id: true });

export const insertMessageSchema = createInsertSchema(messages).omit({ 
  id: true,
  timestamp: true,
  isCounted: true,
  isSpam: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type BotSettings = typeof botSettings.$inferSelect;
export type InsertBotSettings = z.infer<typeof insertBotSettingsSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequests).omit({ 
  id: true,
  timestamp: true,
});

export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export type InsertWithdrawalRequest = z.infer<typeof insertWithdrawalRequestSchema>;