# Manus AI Server

A Node.js server with WebSocket connectivity that enables Manus AI to operate on a Linux system. This project provides a web-based control panel for interacting with Manus AI, featuring real-time collaboration capabilities.

## Original Source

This project is based on the implementation shared at:
[https://gist.github.com/jlia0/db0a9695b3ca7609c9b1a08dcbf872c9](https://gist.github.com/jlia0/db0a9695b3ca7609c9b1a08dcbf872c9)

## Features

- WebSocket connection between server and frontend
- Real-time system monitoring (CPU, memory, uptime)
- Command execution with live output
- Task tracking and management
- Web-based control panel interface
- Linux-optimized implementation
- **Real-time collaboration features:**
  - Team chat with typing indicators
  - Shared command history across clients
  - User presence indicators
  - Command broadcasting to all clients

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm

### Setup

1. Clone this repository:

```bash
git clone <repository-url>
cd manus-ai-server

