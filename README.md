<h1 align="center">NiteBot v2</h1>

<p align="center">
  A feature-rich Telegram bot built with Node.js.
</p>

## Project Structure

```
nitebot-v2/
├── src/                          # Source code directory
│   ├── commands/                 # Bot commands
│   │   ├── admin/               # Admin-related commands
│   │   ├── media/               # Media-related commands
│   │   └── utility/             # Utility commands
│   ├── services/                # Core services
│   │   ├── api/                 # External API integrations
│   │   └── database/            # Database operations
│   ├── middleware/              # Middleware functions
│   ├── utils/                   # Utility functions
│   ├── config/                  # Configuration files
│   └── app.js                   # Main application file
├── data/                        # Data storage
├── logs/                        # Log files
├── tests/                       # Test files
└── scripts/                     # Utility scripts
```

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   TELEGRAM_BOT_TOKEN=your_token
   OPENAI_API_KEY=your_key
   GOOGLE_API_KEY=your_key
   TMDB_API_KEY=your_key
   RAPID_API_KEY=your_key
   ```

## Running the Bot

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## Features

- Media commands (memes, images, movies)
- Utility commands (time, currency, translation)
- Admin controls
- Rate limiting
- Voice transcription
- And more!

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

ISC