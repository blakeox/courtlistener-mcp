#!/bin/bash

# Legal MCP Server Development Scripts
# This script provides common development tasks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command_exists node; then
        print_error "Node.js is required but not installed"
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is required but not installed"
        exit 1
    fi
    
    NODE_VERSION=$(node --version)
    print_status "Node.js version: $NODE_VERSION"
}

# Install dependencies
install_deps() {
    print_status "Installing dependencies..."
    npm install
    print_status "Dependencies installed"
}

# Build the project
build_project() {
    print_status "Building project..."
    npm run build
    print_status "Build completed"
}

# Run tests
run_tests() {
    print_status "Running tests..."
    npm test
    print_status "Tests completed"
}

# Start development server
dev_server() {
    print_status "Starting development server with watch mode..."
    echo "Press Ctrl+C to stop"
    npm run dev
}

# Start production server
prod_server() {
    print_status "Starting production server..."
    CACHE_ENABLED=true \
    LOG_LEVEL=info \
    LOG_FORMAT=json \
    METRICS_ENABLED=true \
    METRICS_PORT=3001 \
    NODE_ENV=production \
    npm start
}

# Health check
health_check() {
    print_status "Performing health check..."
    
    if command_exists curl; then
        if curl -f -s http://localhost:3001/health > /dev/null; then
            print_status "Server is healthy"
            curl -s http://localhost:3001/health | jq -r '.status'
        else
            print_warning "Health check failed or server not running"
        fi
    else
        print_warning "curl not available for health check"
    fi
}

# Clean build artifacts
clean() {
    print_status "Cleaning build artifacts..."
    npm run clean
    print_status "Clean completed"
}

# Full setup
setup() {
    print_status "Setting up Legal MCP Server..."
    check_prerequisites
    install_deps
    build_project
    run_tests
    print_status "Setup completed successfully!"
    echo ""
    print_status "Next steps:"
    echo "  - Copy .env.example to .env and configure as needed"
    echo "  - Run './scripts/dev.sh dev' to start development server"
    echo "  - Run './scripts/dev.sh prod' to start production server"
    echo "  - Run './scripts/dev.sh health' to check server health"
}

# Show help
show_help() {
    echo "Legal MCP Server Development Tools"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup     - Full project setup (install, build, test)"
    echo "  install   - Install dependencies"
    echo "  build     - Build the project"
    echo "  test      - Run tests"
    echo "  dev       - Start development server"
    echo "  prod      - Start production server"
    echo "  health    - Check server health"
    echo "  clean     - Clean build artifacts"
    echo "  help      - Show this help"
    echo ""
}

# Main script logic
case "${1:-help}" in
    setup)
        setup
        ;;
    install)
        check_prerequisites
        install_deps
        ;;
    build)
        build_project
        ;;
    test)
        run_tests
        ;;
    dev)
        dev_server
        ;;
    prod)
        prod_server
        ;;
    health)
        health_check
        ;;
    clean)
        clean
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac