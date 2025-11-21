import { startDiscordBot } from "./discord-bot";
import runApp from "./app";

console.log("Starting Discord bot...");
startDiscordBot();

console.log("Starting web server...");
runApp();