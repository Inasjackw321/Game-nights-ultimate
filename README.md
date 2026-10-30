# Game Nights Ultimate

Live party games for up to 10 friends, set on a pixel-art reef. One person makes a room, everyone joins with a 4-letter code on their phone or laptop, and the host picks from ten games. Players sit on rocks in a ring around the anglerfish host.

| Game | Type | How it works |
| --- | --- | --- |
| **Deep Cut** | Word | Name something in the category that nobody else will. The game checks your answer instantly (typos forgiven), and if it's not on the list you can try again. Rarer correct answers score more, and duplicates split the points. |
| **Hive Mind** | Word | The opposite of Deep Cut: score for every player who gives the same answer as you. |
| **Fib Factory** | Bluffing | Write a fake answer to a strange-but-true fact, then try to spot the real one. Score for finding the truth and for every player your lie fools. |
| **Blitz** | Trivia | Quick-fire multiple choice. Faster correct answers score more. |
| **Most Likely To** | Social | "Who's most likely to…?" Vote for a player, and score for agreeing with the room. |
| **Who Am I?** | Guessing | You pick a secret character for someone else. Everyone sees the character over your head except you. Ask yes/no questions or guess, and the room answers. |
| **Reef Tycoon** | Board | An original roll-and-move property game. Claim reef plots, charge tolls, grow coral for bigger tolls, and link neighbouring plots into a reef network. Richest diver after the last round wins. |
| **Blackjack** | Casino | Play against the house with play chips. Everyone acts at once. Most chips at the end wins. |
| **Liar's Dice** | Casino | Bid on the dice hidden under everyone's cups (ones are wild) or call "Liar!". Your dice are your hearts. |
| **Reef Derby** | Casino | Bet play chips on racing sea creatures. The odds are fair, and long shots pay big. |

Casino games use **play chips only**. There is no real money, buying chips, or cashing out.

## Accounts and leaderboards

- **Guests** can play everything without signing in.
- **Sign in with Discord** (one click, top right) to appear on the **global leaderboard**. It ranks players by wins, for each game and across all games. A game only counts when it had 3 or more players, so a solo game can't pad your stats.
- **Tonight's standings** in the room: every finished game awards pearls (3 / 2 / 1 for the top three), so you can crown the overall winner of the night.

## Voice chat

Click **🎙 Join voice chat** under the reef, allow the microphone, and everyone else in voice can hear you. A player's creature glows green while they talk, and 🎧 / 🔇 shows who's in voice and who's muted.

- Audio goes **directly between players' browsers** (WebRTC). The server only passes along the connection set-up, so voice costs nothing to run and is never recorded.
- Like any peer-to-peer call, players in voice can see each other's IP address, so only join voice with people you know.
- It works for most home Wi-Fi and phones out of the box. Some strict networks (certain mobile carriers, school or office Wi-Fi) also need a relay ("TURN") server. To add one for free, create a TURN key in the Cloudflare dashboard under **Realtime → TURN Server**, then:
  ```bash
  npx wrangler secret put TURN_KEY_ID
  ```
  ```bash
  npx wrangler secret put TURN_KEY_API_TOKEN
  ```

## How it's built

All of it runs on the Cloudflare Workers free plan:

- **`src/worker.js`**: routes `/api/*` and `/auth/*`, and serves `public/` as static assets.
- **`src/room.js`**: one **Durable Object per room**. It holds the only copy of hidden information (answers, cards, dice), enforces every deadline with a storage alarm (so timing never relies on players' clocks), and uses WebSocket Hibernation so idle rooms cost nothing. Players are keyed by a stored id (or their Discord id), so a refresh or dropped connection rejoins as the same player. If the host disconnects, the longest-standing online player can take over.
- **`src/games/*.js`**: each game is a small state machine with the same interface (`init`, `action`, `timeout`, `view`). `view()` decides what each player is allowed to see. To add a game, add a module and register it in `src/games/index.js`.
- **`src/hub.js`**: a single global Durable Object with its own SQLite database, holding Discord users and game results for the leaderboard. There's no separate database to set up.
- **`src/auth.js`**: Discord OAuth2 sign-in and an HMAC-signed session cookie.
- **`public/`**: a framework-free frontend. The sprites are pixel maps drawn to canvas (`public/sprites.js`).
- **Content packs** live in `src/content/`: tiered answer lists, Fib facts, quiz questions, prompts and characters.

## Run it locally

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run dev
```

Open http://localhost:8787 in a few browser windows (or on your phone on the same network).

Tests:

```bash
npm test
```

The unit tests cover the scoring rules, and the suite also plays every game to completion with simulated players. With `npm run dev` running, the end-to-end test plays real games over WebSockets and checks the leaderboard:

```bash
npm run smoke
```

## Set up "Sign in with Discord"

1. Go to https://discord.com/developers/applications, click **New Application** and give it a name.
2. Under **OAuth2**, copy the **Client ID**, then reset and copy the **Client Secret**.
3. Under **OAuth2 → Redirects**, add both:
   - `http://localhost:8787/auth/discord/callback` (local dev)
   - `https://<your-worker>.<your-subdomain>.workers.dev/auth/discord/callback` (or your custom domain)
4. For local dev, put them in `.dev.vars`:
   ```
   SESSION_SECRET=<any long random string>
   DISCORD_CLIENT_ID=<client id>
   DISCORD_CLIENT_SECRET=<client secret>
   ```
5. For production, store them as Worker secrets:
   ```bash
   npx wrangler secret put DISCORD_CLIENT_ID
   ```
   ```bash
   npx wrangler secret put DISCORD_CLIENT_SECRET
   ```
   ```bash
   npx wrangler secret put SESSION_SECRET
   ```

The app only asks Discord for the `identify` scope (username and avatar). Without these secrets the app still works, in guest-only mode, and the sign-in button is hidden.

### Sign-in troubleshooting

- **No "Sign in with Discord" button:** the home page says which Worker secrets are missing. You can also open `https://<your-site>/api/me`; `authMissing` lists them. Add each with `npx wrangler secret put <NAME>`, then refresh.
- **Discord shows "Invalid OAuth2 redirect_uri":** the redirect in the Discord portal must match exactly. `/api/me` shows the exact `redirectUri` your site uses; paste that into **OAuth2 → Redirects** and save.
- **"Discord rejected the sign-in" after approving:** the Client Secret is wrong (or was reset). Reset it in the portal and run `npx wrangler secret put DISCORD_CLIENT_SECRET` again.
- **Bounced back with "took too long or cookies are blocked":** allow cookies for the site and try again.

## Deploy

```bash
npx wrangler login
```

```bash
npm run deploy
```

That's it: the frontend, the rooms and the leaderboard database deploy together.

## Adding content

- **Deep Cut / Hive Mind prompts** (`src/content/prompts.js`): answers are split into four tiers (Common, Solid, Rare, Deep cut). Separate entries with `;` and aliases with `|`. Case, accents, punctuation and plurals are ignored automatically, and `npm test` fails if two entries collide.
- **Fib facts** (`src/content/facts.js`): include `alts` (other ways of writing the true answer) and two `decoys`.
- **Blitz questions** (`src/content/quiz.js`): put the correct choice first. Choices are shuffled when dealt.
