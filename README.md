# PRE LOVED Store

A pre-loved fashion e-commerce site selling handbags, shoes & clothing — priced in Kenyan Shillings.

## Project Structure

```
legendary/
├── index.html        # Main storefront
├── product.html      # Product detail page
├── styles.css        # All styles (dark/light mode)
├── script.js         # Frontend interactivity + M-Pesa integration
├── BAG 1-10.jpg      # Bag product images
├── Shoe 1-12.jpg     # Shoe product images
└── server/           # Node.js backend (Railway)
    ├── index.js      # Express server — Daraja STK Push API
    ├── package.json
    ├── railway.json  # Railway deployment config
    └── .env.example  # Environment variable template
```

## M-Pesa Daraja Setup

### 1. Get Credentials
- Go to [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
- Create an app and get your **Consumer Key**, **Consumer Secret**, **Shortcode**, and **Passkey**

### 2. Deploy Backend to Railway
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the `server/` folder as the root directory
3. Add these environment variables in Railway dashboard:

```
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_SHORTCODE=your_shortcode
MPESA_PASSKEY=your_passkey
MPESA_ENV=sandbox         # change to "live" for production
RAILWAY_URL=https://your-app.up.railway.app
FRONTEND_URL=https://your-vercel-url.vercel.app
PORT=3000
```

### 3. Update Frontend
After deploying to Railway, replace `SERVER_URL` in:
- `script.js` (line 1)
- `product.html` (inside the script block at the bottom)

with your actual Railway URL.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| POST | `/stk-push` | Initiate M-Pesa STK Push |
| POST | `/callback` | Safaricom payment callback |
| GET | `/status/:id` | Poll payment status |

## Local Development

```bash
cd server
cp .env.example .env   # fill in your credentials
npm install
npm run dev            # starts with nodemon
```

## Frontend Deployment
The frontend is deployed on **Vercel** (static site — no build step needed).
