#!/bin/bash

# Helper functions
function print_status() {
  echo ">>> $1"
}

# Install fnm if not installed
if ! command -v fnm &> /dev/null
then
  print_status "Installing fnm (Fast Node Manager)..."
  curl -fsSL https://fnm.vercel.app/install | bash
  print_status "fnm installed. You may need to restart your shell."
  
  # Add fnm to bashrc if it doesn't already exist
  if ! grep -q 'eval "$(fnm env)"' ~/.bashrc; then
    echo 'eval "$(fnm env)"' >> ~/.bashrc
  fi

  # Source bashrc to activate fnm
  source ~/.bashrc
else
  print_status "fnm is already installed, skipping installation."
fi

# Use or install Node.js version 20.x if not present
NODE_VERSION="20"
if ! fnm current | grep -q "$NODE_VERSION"; then
  print_status "Installing Node.js $NODE_VERSION using fnm..."
  fnm use --install-if-missing "$NODE_VERSION"
else
  print_status "Node.js $NODE_VERSION is already installed, skipping installation."
fi

# Verify Node.js version
NODE_VER=$(node -v)
print_status "Node.js version: $NODE_VER"

# Check npm version and update to the latest if necessary
print_status "Checking npm version..."
npm install -g npm@latest
NPM_VER=$(npm -v)
print_status "npm updated to version: $NPM_VER"

# Install pnpm globally if not already installed
if ! command -v pnpm &> /dev/null
then
  print_status "Installing pnpm..."
  npm install -g pnpm
  print_status "pnpm installed."
else
  print_status "pnpm is already installed, skipping installation."
fi

# Final status
print_status "Setup complete. Node.js, npm, and pnpm are ready."

