# Utility Bot Dashboard

## Overview

This is a Discord bot application with a web dashboard built for managing server events, leaderboards, and rewards. The application tracks user activities such as messages and Pokémon catches (via integration with the Poketwo bot), rewarding users with virtual currency (Pokecoins). The system features both a Discord bot that monitors and responds to server activities and a web-based dashboard for viewing statistics and managing bot settings.

## Recent Changes

**November 21, 2025 - Latest Update**
- Fixed withdrawal channel validation: `-payed` command now works correctly in configured withdrawal channel
- Added channel validation when setting withdrawal/proofs channels (prevents configuration errors)
- Added `Dresetbal` command for admin to reset/set user balance: `Dresetbal [user_id] [amount]`
- Verified event toggles work correctly: when events are off, they don't count
- Improved error messages with actionable remediation steps
- Fixed all TypeScript LSP errors
- Added comprehensive input validation for admin commands

**November 21, 2025 - Earlier**
- Implemented separate event toggles for messages and catches
- Discord bot token now securely stored in Replit Secrets
- Updated `Devent` command to support independent control: `Devent [messages/catches] [on/off]`
- Added event status display when `Devent` is called without parameters
- Fixed counting feature and database schema
- Database migrations generated and applied successfully
- Changed bot command prefix from `.` to `D` (all commands now use `D` prefix, e.g., `Dhelp`, `Dcatches`)
- Withdrawal system uses modal for market ID entry

## User Preferences

Preferred communication style: Simple, everyday language.
No need for preview or additional connections.
Prefer well-organized and human-readable code.

## System Architecture

### Frontend Architecture

**Framework & Build Tools**
- **React with TypeScript**: Modern component-based UI using functional components and hooks
- **Vite**: Fast build tool and development server configured for React with hot module replacement
- **Wouter**: Lightweight client-side routing library (alternative to React Router)
- **TailwindCSS v4**: Utility-first CSS framework with custom theme configuration

**UI Component Strategy**
- **shadcn/ui**: Comprehensive UI component library based on Radix UI primitives
- Uses "new-york" style variant with CSS variables for theming
- All components are co-located in `client/src/components/ui/` for easy customization
- Supports light/dark mode theming through CSS custom properties

**State Management**
- **TanStack Query (React Query)**: Server state management with automatic caching, refetching, and synchronization
- Custom query client configured with infinite stale time and disabled automatic refetching
- Form state managed through react-hook-form with Zod validation

**Project Structure**
- Path aliases configured: `@/` for client source, `@shared/` for shared code, `@assets/` for assets
- Single-page application with minimal routing (main chat interface + 404 page)

### Backend Architecture

**Server Framework**
- **Express.js**: Minimal REST API server handling GET endpoints only
- Separate development and production entry points (`index-dev.ts` and `index-prod.ts`)
- Development mode runs both web server and Discord bot; production runs bot only
- Custom logging middleware for API request tracking

**API Design**
- Read-only REST endpoints (`/api/users`, `/api/settings`, `/api/messages`)
- No authentication/authorization currently implemented
- JSON-based request/response format
- Simple error handling with 500 status codes for failures

**Discord Bot Integration**
- **Discord.js v14**: Official Discord API wrapper with gateway intents
- Monitors specific bot (Poketwo) for catch confirmations
- Command prefix system (`.` prefix) for bot commands
- Hardcoded admin user ID for privileged operations
- Real-time event tracking for messages and catches

**Bot Features**
- Message counting with anti-spam protection (time window, minimum length, max messages)
- Pokémon catch tracking with reward multipliers for shiny/rare catches
- Configurable reward system (Pokecoins per activity)
- Channel-specific counting (designated counting channels)
- Proofs channel for validation/verification

### Data Storage

**Database**
- **PostgreSQL**: Relational database via Neon serverless platform
- **Drizzle ORM**: Type-safe SQL query builder and schema management
- WebSocket connection using `@neondatabase/serverless` with ws polyfill
- Schema-first approach with migrations stored in `/migrations`

**Schema Design**
Three main tables:
1. **users**: User profiles with activity statistics (messages, catches, Pokecoins, shiny counts)
2. **bot_settings**: Global bot configuration (single-row table with event toggles, rates, channels)
3. **messages**: Message audit log with spam detection flags

**Data Access Pattern**
- Storage abstraction layer (`server/storage.ts`) providing typed interface
- Promise-based async operations using Drizzle's query builder
- Support for increment operations, bulk resets, and configuration updates

### External Dependencies

**Third-Party Services**
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Discord API**: Real-time gateway connection for bot events and messaging

**Discord Bot Integration**
- Poketwo Bot (ID: `716390085896962058`): Third-party Pokémon bot whose events are monitored
- Requires `DISCORD_BOT_TOKEN` environment variable
- Uses Gateway Intents: Guilds, GuildMessages, MessageContent

**Development Tools**
- Replit-specific plugins for runtime error overlay, cartographer, and dev banner
- Custom fonts from Google Fonts (JetBrains Mono, Inter)

**Key Dependencies**
- `discord.js`: Discord bot framework
- `drizzle-orm` + `drizzle-zod`: Database ORM and schema validation
- `@neondatabase/serverless`: Neon database client
- `@tanstack/react-query`: Client-side data fetching
- `@radix-ui/*`: Headless UI primitives (20+ components)
- `express`: Web server framework
- `zod`: Runtime type validation
- `date-fns`: Date manipulation utilities

**Environment Variables Required**
- `DATABASE_URL`: PostgreSQL connection string
- `DISCORD_BOT_TOKEN`: Discord bot authentication token
- `PORT`: HTTP server port (defaults to 5000)
- `NODE_ENV`: Environment mode (development/production)