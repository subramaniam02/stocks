# Stock Portfolio Tracker

A web-based stock portfolio tracker that imports holdings from CSV, tracks daily performance at mid-market (12:00 PM EST), and provides AI-powered action recommendations using Ollama.

## Features

- **CSV Import**: Upload your holdings with ticker, purchase date, price, and quantity
- **Real-time Pricing**: Fetches current prices from Yahoo Finance
- **Lot-level Tracking**: Track performance of individual purchase lots
- **Daily Snapshots**: Automatic daily snapshots at 12:00 PM EST
- **AI Recommendations**: Get portfolio analysis and action suggestions from Ollama

## Prerequisites

- Python 3.11+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Ollama (for AI recommendations)

## Quick Start (using Make)

```bash
# Install all dependencies
make install

# Start both backend and frontend with auto-reload
make dev
```

The app will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

## Make Commands

| Command | Description |
|---------|-------------|
| `make install` | Install all dependencies (backend + frontend) |
| `make dev` | Start both servers with auto-reload |
| `make backend` | Start backend only (with auto-reload) |
| `make frontend` | Start frontend only (with hot reload) |
| `make reload` | Trigger backend reload |
| `make status` | Check if services are running |
| `make db-reset` | Reset the database |
| `make clean` | Remove generated files and caches |

## Manual Setup

### 1. Install uv (if not already installed)

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Or with Homebrew
brew install uv
```

### 2. Install Ollama (Optional, for AI features)

```bash
# macOS
brew install ollama

# Then pull a model
ollama pull llama3
```

### 3. Backend Setup

```bash
cd backend

# Install dependencies and create virtual environment
uv sync

# Start the server with auto-reload
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at http://localhost:8000

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at http://localhost:5173

## CSV Format

Create a CSV file with the following columns:

```csv
ticker,purchase_date,purchase_price,quantity
AAPL,2024-01-15,185.50,10
AAPL,2024-06-20,195.00,5
GOOGL,2024-03-10,140.25,20
MSFT,2024-02-01,380.00,15
```

- **ticker**: Stock symbol (e.g., AAPL, GOOGL)
- **purchase_date**: Date of purchase in YYYY-MM-DD format
- **purchase_price**: Price per share at purchase
- **quantity**: Number of shares purchased

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/portfolio` | GET | Get portfolio overview with performance |
| `/api/holdings` | GET | Get all holdings |
| `/api/holdings` | DELETE | Clear all holdings |
| `/api/upload-csv` | POST | Upload CSV file with holdings |
| `/api/portfolio/snapshot` | POST | Take manual snapshot |
| `/api/portfolio/history` | GET | Get historical snapshots |
| `/api/recommendations` | GET | Get AI recommendations |
| `/api/recommendations/generate` | POST | Generate new recommendations |
| `/api/ai/status` | GET | Check Ollama status |
| `/api/stock/{ticker}` | GET | Get stock info |

## Architecture

```
stock-app/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── database.py          # Database connection
│   └── services/
│       ├── portfolio.py     # Portfolio operations
│       ├── stock_data.py    # Yahoo Finance integration
│       ├── ai_advisor.py    # Ollama integration
│       └── scheduler.py     # Daily snapshot scheduler
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main application
│   │   ├── components/      # React components
│   │   └── services/        # API client
│   └── package.json
└── README.md
```

## Daily Snapshots

The application automatically takes portfolio snapshots at 12:00 PM EST on weekdays (when the market is at mid-session). These snapshots:

1. Record current prices for all holdings
2. Calculate daily change percentages
3. Trigger AI analysis (if Ollama is available)

You can also take manual snapshots using the "Snapshot" button in the header.
