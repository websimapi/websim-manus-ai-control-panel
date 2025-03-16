const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configuration
const PORT = process.env.PORT || 8080;
const CLIENT_PORT = process.env.CLIENT_PORT || 3000;
const CLIENT_PATH = path.join(__dirname, 'client');

// Initialize Express app
const app = express();
app.use(express.static(CLIENT_PATH));
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Store active tasks
let tasks = [];
// Store active command executions
const activeCommands = new Map();

// Get system information
function getSystemInfo() {
  try {
    // CPU usage (Linux)
    const cpuInfo = os.loadavg()[0] / os.cpus().length * 100;
    
    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = Math.round((1 - freeMem / totalMem) * 100);
    
    // System uptime (hours)
    const uptime = Math.floor(os.uptime() / 3600);
    
    return {
      cpu: Math.round(cpuInfo),
      memory: memoryUsage,
      uptime: uptime
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    return {
      cpu: 0,
      memory: 0,
      uptime: 0
    };
  }
}

// Broadcast message to all connected clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Send system info to all clients
function broadcastSystemInfo() {
  const systemInfo = getSystemInfo();
  broadcast({
    type: 'systemInfo',
    payload: systemInfo
  });
}

// Execute a command and send updates
function executeCommand(commandStr, ws) {
  const commandId = uuidv4();
  
  try {
    // Create a new task for this command
    const task = {
      id: commandId,
      name: `Command: ${commandStr.substring(0, 30)}${commandStr.length > 30 ? '...' : ''}`,
      status: 'in_progress',
      progress: 0,
      createdAt: new Date().toISOString()
    };
    
    tasks.push(task);
    broadcast({
      type: 'task',
      payload: task
    });

    // Execute the command
    const proc = exec(commandStr, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
    activeCommands.set(commandId, proc);
    
    let output = '';
    
    proc.stdout.on('data', (data) => {
      output += data;
      ws.send(JSON.stringify({
        sender: 'Command',
        message: data.toString()
      }));
      
      // Update task progress (simulate progress)
      task.progress = Math.min(90, task.progress + 10);
      broadcast({
        type: 'task',
        payload: task
      });
    });
    
    proc.stderr.on('data', (data) => {
      output += data;
      ws.send(JSON.stringify({
        sender: 'Command',
        message: `Error: ${data.toString()}`
      }));
    });
    
    proc.on('close', (code) => {
      activeCommands.delete(commandId);
      
      // Update task status
      task.status = code === 0 ? 'completed' : 'failed';
      task.progress = 100;
      broadcast({
        type: 'task',
        payload: task
      });
      
      ws.send(JSON.stringify({
        sender: 'System',
        message: `Command completed with exit code: ${code}`
      }));
    });
    
    proc.on('error', (error) => {
      activeCommands.delete(commandId);
      
      // Update task status
      task.status = 'failed';
      task.progress = 100;
      broadcast({
        type: 'task',
        payload: task
      });
      
      ws.send(JSON.stringify({
        sender: 'System',
        message: `Command error: ${error.message}`
      }));
    });
    
    return commandId;
  } catch (error) {
    ws.send(JSON.stringify({
      sender: 'System',
      message: `Error executing command: ${error.message}`
    }));
    return null;
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Assign a unique client ID
  const clientId = uuidv4();
  ws.clientId = clientId;
  
  // Send current system info to new client
  ws.send(JSON.stringify({
    type: 'systemInfo',
    payload: getSystemInfo()
  }));
  
  // Send current tasks to new client
  tasks.forEach(task => {
    ws.send(JSON.stringify({
      type: 'task',
      payload: task
    }));
  });
  
  // Welcome message
  ws.send(JSON.stringify({
    sender: 'System',
    message: 'Connected to Manus AI Server. Type help for available commands.'
  }));
  
  // Message handler
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'command') {
        const command = data.command.trim();
        
        // Handle built-in commands
        if (command === 'help') {
          ws.send(JSON.stringify({
            sender: 'System',
            message: `
Available commands:
- help: Show this help message
- info: Get system information
- tasks: List active tasks
- clear: Clear completed tasks
- exec <command>: Execute a shell command
- kill <task_id>: Kill a running task
- collaborators: Show connected clients
            `.trim()
          }));
        } else if (command === 'info') {
          const info = getSystemInfo();
          ws.send(JSON.stringify({
            sender: 'System',
            message: `
System Information:
- CPU Usage: ${info.cpu}%
- Memory Usage: ${info.memory}%
- Uptime: ${info.uptime} hours
            `.trim()
          }));
        } else if (command === 'tasks') {
          if (tasks.length === 0) {
            ws.send(JSON.stringify({
              sender: 'System',
              message: 'No active tasks.'
            }));
          } else {
            ws.send(JSON.stringify({
              sender: 'System',
              message: `Active Tasks:\n${tasks.map(t => 
                `- ID: ${t.id}\n  Name: ${t.name}\n  Status: ${t.status}\n  Progress: ${t.progress}%\n  Created: ${new Date(t.createdAt).toLocaleString()}`
              ).join('\n')}`
            }));
          }
        } else if (command === 'collaborators') {
          // Count connected clients
          const clientCount = wss.clients.size;
          ws.send(JSON.stringify({
            sender: 'System',
            message: `There are currently ${clientCount} client(s) connected to this server.`
          }));
        } else if (command === 'clear') {
          // Remove completed and failed tasks
          const initialCount = tasks.length;
          tasks = tasks.filter(t => t.status === 'in_progress');
          const removedCount = initialCount - tasks.length;
          
          ws.send(JSON.stringify({
            sender: 'System',
            message: `Removed ${removedCount} completed/failed tasks.`
          }));
        } else if (command.startsWith('kill ')) {
          const taskId = command.substring(5).trim();
          const activeCommand = activeCommands.get(taskId);
          
          if (activeCommand) {
            // Kill the process
            try {
              if (process.platform === 'win32') {
                execSync(`taskkill /pid ${activeCommand.pid} /T /F`);
              } else {
                process.kill(-activeCommand.pid, 'SIGKILL');
              }
              
              activeCommands.delete(taskId);
              
              // Update task status
              const task = tasks.find(t => t.id === taskId);
              if (task) {
                task.status = 'failed';
                task.progress = 100;
                broadcast({
                  type: 'task',
                  payload: task
                });
              }
              
              ws.send(JSON.stringify({
                sender: 'System',
                message: `Killed task with ID: ${taskId}`
              }));
            } catch (error) {
              ws.send(JSON.stringify({
                sender: 'System',
                message: `Error killing task: ${error.message}`
              }));
            }
          } else {
            ws.send(JSON.stringify({
              sender: 'System',
              message: `No active task found with ID: ${taskId}`
            }));
          }
        } else if (command.startsWith('exec ')) {
          const cmd = command.substring(5).trim();
          executeCommand(cmd, ws);
        } else {
          // Treat as shell command by default
          executeCommand(command, ws);
        }
      }
    } catch (error) {
      ws.send(JSON.stringify({
        sender: 'System',
        message: `Error processing message: ${error.message}`
      }));
    }
  });
  
  // Connection close handler
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Periodically broadcast system info (every 5 seconds)
setInterval(broadcastSystemInfo, 5000);

// Clean up completed tasks after 1 hour
setInterval(() => {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
  tasks = tasks.filter(task => {
    // Keep in-progress tasks and recently completed tasks
    return task.status === 'in_progress' || 
           new Date(task.createdAt) > oneHourAgo;
  });
}, 60 * 60 * 1000); // 1 hour

// Route to serve the client
app.get('/', (req, res) => {
  res.sendFile(path.join(CLIENT_PATH, 'index.html'));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Manus AI Server running on port ${PORT}`);
  console.log(`Client interface available at http://localhost:${PORT}`);
});