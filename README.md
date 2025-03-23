<h1 align="center">Niite Bot</h1>

<p align="center">
  A versatile Telegram bot powered by AI for image generation, information retrieval, and entertainment
</p>

## 🌟 Overview

Niite Bot is a feature-rich Telegram bot that combines AI capabilities with utility functions to provide a seamless user experience. Built with Node.js and modern APIs, it offers everything from AI image generation to real-time information services.

## ✨ Features

### AI & Image Generation
- Image generation using multiple Hugging Face models
- Smart model selection for different art styles
- Image regeneration and customization options
- AI-powered image upscaling with Real-ESRGAN (4x upscaling with face enhancement)

### Information Services
- Real-time timezone information
- Currency conversion
- Random facts with relevant images
- Joke generation
- Reddit meme integration

### Admin Features
- Maintenance mode management
- User activity monitoring
- Broadcasting capabilities
- System statistics and analytics
- Command usage tracking

## 🛠 Technical Stack

- **Runtime**: Node.js
- **Main Dependencies**:
  - node-telegram-bot-api
  - @huggingface/inference
  - @google/generative-ai
  - moment-timezone
  - natural (NLP)
  - sharp (image processing)
  - extract-zip
  - dotenv

## 🚀 Getting Started

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Install Vulkan Runtime (Required for AI image upscaling):
   - Download from [Vulkan Runtime](https://sdk.lunarg.com/sdk/download/1.3.268.0/windows/VulkanRT-1.3.268.0-Installer.exe)
   - Run the installer
   - Restart your system if prompted

4. Create a `.env` file with required credentials:
```env
TELEGRAM_BOT_TOKEN=your_token
HUGGING_FACE_TOKEN=your_token
GOOGLE_AI_API_KEY=your_key
ADMIN_USER_ID=your_admin_id
UNSPLASH_ACCESS_KEY=your_key
PIXABAY_API_KEY=your_key
NINJA_API_KEY=your_key
```
5. Start the bot:
```bash
node bot.js
```

## Setup Cloudflared (Required for Games)

To run the games feature, you'll need to set up Cloudflared:

1. Download Cloudflared:
   - Windows: Download [cloudflared-windows-amd64.exe](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe)
   - Linux: `wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64`
   - Mac: `brew install cloudflare/cloudflare/cloudflared`

2. Rename the downloaded file:
   - Windows: Rename to `cloudflared.exe`
   - Linux/Mac: Rename to `cloudflared`

3. Place the file in your project root directory

The tunnel will automatically start when you run the bot.

## 📝 Environment Variables

- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
- `HUGGING_FACE_TOKEN`: Hugging Face API token
- `GOOGLE_AI_API_KEY`: Google AI API key
- `ADMIN_USER_ID`: Telegram user ID for admin access
- `UNSPLASH_ACCESS_KEY`: Unsplash API key (optional)
- `PIXABAY_API_KEY`: Pixabay API key (optional)
- `NINJA_API_KEY`: API Ninjas key (optional)