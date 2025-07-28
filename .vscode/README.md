# Legal MCP Server - VS Code README

This directory contains VS Code-specific configuration for the Legal MCP Server project.

## 📁 Configuration Files

### `.vscode/settings.json`
Project-specific VS Code settings optimized for MCP development:
- TypeScript/JavaScript configuration
- ESLint and Prettier integration
- MCP-specific file associations
- Testing and debugging setup

### `.vscode/launch.json`
Debug configurations for:
- 🚀 **MCP Server** - Main server debugging
- 🏢 **Enterprise Server** - Enterprise features debugging
- 🧪 **Unit Tests** - Test debugging
- 🔧 **MCP Inspector** - Inspector tool debugging
- 📊 **Performance Tests** - Performance analysis

### `.vscode/tasks.json`
Build and test tasks:
- **Build TypeScript** - Compile TypeScript to JavaScript
- **Watch Mode** - Development with auto-compilation
- **Test Suites** - Various test configurations
- **MCP Inspector** - Launch inspector tools
- **Coverage Analysis** - Code coverage reports

### `.vscode/snippets.code-snippets`
Custom code snippets for:
- MCP tool definitions
- Tool handlers
- Test suites
- Enterprise middleware
- Logger statements
- Metrics recording

### `.vscode/extensions.json`
Recommended extensions for optimal development experience:
- **TypeScript/JavaScript** - Enhanced language support
- **Testing** - Test discovery and execution
- **Git** - Version control integration
- **Docker** - Container development
- **API Testing** - REST client tools
- **Documentation** - Markdown support
- **Code Quality** - ESLint, Prettier, spell checking

## 🚀 Quick Start

### 1. Install Recommended Extensions
```bash
# VS Code will prompt to install recommended extensions
# Or install via command palette: "Extensions: Show Recommended Extensions"
```

### 2. Build and Run
Use the VS Code Command Palette (`Cmd+Shift+P`):
- **Tasks: Run Task** → "🔨 Build TypeScript"
- **Debug: Start Debugging** → "🚀 Launch MCP Server"

### 3. Testing
- **Tasks: Run Task** → "🧪 Run All Tests"
- **Debug: Start Debugging** → "🧪 Debug Unit Tests"

### 4. MCP Inspector
- **Tasks: Run Task** → "🔍 MCP Inspector (Local)"
- **Debug: Start Debugging** → "🔧 Debug MCP Inspector"

## 🔧 Development Workflow

### Debugging MCP Server
1. Set breakpoints in TypeScript source files
2. Press `F5` or use "🚀 Launch MCP Server" configuration
3. VS Code will build, start the server, and attach the debugger

### Running Tests
1. Use Test Explorer in the sidebar
2. Run individual tests or test suites
3. Debug tests with the "🧪 Debug Unit Tests" configuration

### MCP Inspector Integration
1. Build the project: `Cmd+Shift+P` → "Tasks: Run Task" → "🔨 Build TypeScript"
2. Launch inspector: `Cmd+Shift+P` → "Tasks: Run Task" → "🔍 MCP Inspector (Local)"
3. Browser opens automatically at `http://localhost:6274`

## 📊 Code Quality

### ESLint Integration
- Automatic linting on save
- Fix issues with `Cmd+Shift+P` → "ESLint: Fix all auto-fixable Problems"

### Prettier Formatting
- Format on save enabled
- Manual format: `Shift+Alt+F`

### Test Coverage
- Install "Coverage Gutters" extension
- Run tests with coverage: `npm run test:coverage`
- View coverage in editor gutters

## 🐳 Development Container

### Using Dev Container
1. Install "Remote - Containers" extension
2. `Cmd+Shift+P` → "Remote-Containers: Reopen in Container"
3. Container provides consistent development environment

### Features
- Node.js 20 with Alpine Linux
- Pre-installed development tools
- MCP Inspector available
- Consistent environment across machines

## 💡 Pro Tips

### Keyboard Shortcuts
- `F5` - Start debugging
- `Ctrl+C` - Stop debugging
- `Cmd+Shift+P` - Command palette
- `Cmd+T` - Go to symbol
- `Cmd+Shift+T` - Reopen closed tab

### Multi-root Workspace
Open the `.code-workspace` file for enhanced project organization:
```bash
code legal-mcp.code-workspace
```

### Integrated Terminal
- Multiple terminals for different tasks
- Environment variables automatically set
- Easy access to npm scripts

## 🔗 Related Files

- `../package.json` - Project dependencies and scripts
- `../tsconfig.json` - TypeScript configuration
- `../.env.example` - Environment variables
- `../README.md` - Project documentation
