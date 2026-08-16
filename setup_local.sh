#!/bin/bash

# Define colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}===================================================${NC}"
echo -e "${GREEN}    Agos Local ERP - Local Automated Setup        ${NC}"
echo -e "${BLUE}===================================================${NC}"
echo.

# Check for Node.js
if ! command -v node &> /dev/null
then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please download and install Node.js (LTS version) from:"
    echo "https://nodejs.org/"
    # Open browser on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "https://nodejs.org/"
    fi
    exit 1
fi

echo -e "${GREEN}✓ Check status: Node.js is installed ($(node -v))${NC}"

# Run install
echo -e "\n${YELLOW}Installing dependencies (ingredients) for the application...${NC}"
npm install

# Create desktop shortcut
DESKTOP_DIR="$HOME/Desktop"
if [ -d "$DESKTOP_DIR" ]; then
    echo -e "\n${YELLOW}Creating a Desktop shortcut...${NC}"
    
    cat <<EOT > "$DESKTOP_DIR/Agos Local ERP.url"
[InternetShortcut]
URL=http://localhost:3000
EOT
    chmod +x "$DESKTOP_DIR/Agos Local ERP.url"
    
    echo -e "${GREEN}✓ Created 'Agos Local ERP' shortcut on your Desktop!${NC}"
fi

echo -e "\n${GREEN}Starting local development server...${NC}"
echo -e "${BLUE}Opening http://localhost:3000 in your browser...${NC}"

# Try to open the browser automatically in the background
if [[ "$OSTYPE" == "darwin"* ]]; then
    (sleep 3 && open "http://localhost:3000") &
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    (sleep 3 && xdg-open "http://localhost:3000") &
fi

npm run dev
