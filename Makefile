.PHONY: help install install-backend install-frontend dev backend frontend reload clean db-reset docker-up docker-down docker-build docker-logs

# Default target
help:
	@echo "Stock Portfolio Tracker - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install          Install all dependencies (backend + frontend)"
	@echo "  make install-backend  Install backend dependencies only"
	@echo "  make install-frontend Install frontend dependencies only"
	@echo ""
	@echo "Development:"
	@echo "  make dev              Start both backend and frontend (with auto-reload)"
	@echo "  make backend          Start backend only (with auto-reload)"
	@echo "  make frontend         Start frontend only (with hot reload)"
	@echo "  make reload           Restart backend server"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up        Build and start all services with Docker Compose"
	@echo "  make docker-down      Stop and remove Docker Compose services"
	@echo "  make docker-build     Rebuild Docker images without cache"
	@echo "  make docker-logs      Tail logs from all Docker Compose services"
	@echo ""
	@echo "Database:"
	@echo "  make db-reset         Reset the database (delete portfolio.db)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean            Remove generated files and caches"

# Install all dependencies
install: install-backend install-frontend

# Install backend dependencies using uv
install-backend:
	@echo "Installing backend dependencies..."
	cd backend && uv sync

# Install frontend dependencies
install-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

# Start both backend and frontend for development
dev:
	@echo "Starting development servers..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:5173"
	@make -j2 backend frontend

# Start backend with auto-reload (uvicorn --reload)
backend:
	@echo "Starting backend with auto-reload..."
	cd backend && uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Start frontend with hot reload (vite dev server)
frontend:
	@echo "Starting frontend with hot reload..."
	cd frontend && npm run dev

# Reload backend by touching main.py (triggers uvicorn reload)
reload:
	@echo "Triggering backend reload..."
	@touch backend/main.py
	@echo "Backend will reload automatically (if running with --reload)"

# Docker Compose targets
docker-up:
	@echo "Starting services with Docker Compose..."
	docker compose up --build -d
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:8000"

docker-down:
	@echo "Stopping Docker Compose services..."
	docker compose down

docker-build:
	@echo "Rebuilding Docker images..."
	docker compose build --no-cache

docker-logs:
	docker compose logs -f

# Reset the database
db-reset:
	@echo "Resetting database..."
	rm -f backend/portfolio.db
	@echo "Database reset complete. Restart backend to recreate."

# Clean generated files
clean:
	@echo "Cleaning generated files..."
	rm -rf backend/.venv
	rm -rf backend/__pycache__
	rm -rf backend/services/__pycache__
	rm -rf frontend/node_modules
	rm -rf frontend/dist
	rm -f backend/portfolio.db
	@echo "Clean complete."

# Run backend tests (placeholder)
test-backend:
	@echo "Running backend tests..."
	cd backend && uv run pytest

# Run frontend tests (placeholder)
test-frontend:
	@echo "Running frontend tests..."
	cd frontend && npm test

# Build frontend for production
build:
	@echo "Building frontend for production..."
	cd frontend && npm run build

# Check if services are running
status:
	@echo "Checking service status..."
	@curl -s http://localhost:8000/api/health > /dev/null 2>&1 && echo "Backend: ✓ Running" || echo "Backend: ✗ Not running"
	@curl -s http://localhost:5173 > /dev/null 2>&1 && echo "Frontend: ✓ Running" || echo "Frontend: ✗ Not running"
