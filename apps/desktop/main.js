const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow = null;
let staticServer = null;

// Determine if we are in development mode
const isDev = !app.isPackaged;

// Start a lightweight HTTP static server in production
function startStaticServer(callback) {
  const server = http.createServer((req, res) => {
    // Exclude query parameters from file path resolution
    const urlPath = req.url.split('?')[0];
    
    // Target directory: Next.js static export at apps/frontend/out
    const outDir = path.join(__dirname, '../frontend/out');
    let filePath = path.join(outDir, urlPath);

    // If target is a directory, load its index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    // Next.js routing fallback:
    // If file does not exist and doesn't have an extension, try appending .html (e.g. /register -> /register.html)
    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
      if (fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      }
    }

    // General fallback: if file still does not exist, serve index.html (or 404.html if it exists)
    if (!fs.existsSync(filePath)) {
      const errorPage = path.join(outDir, '404.html');
      filePath = fs.existsSync(errorPage) ? errorPage : path.join(outDir, 'index.html');
    }

    // Resolve mime-type
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'font/eot',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Read and serve the file
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end(`Internal Server Error: ${err.code}`);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  // Listen on a random ephemeral port (0) on localhost
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    callback(address.port);
  });

  return server;
}

function createWindow(port = null) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Ovik Attendance",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Hide default menu bar
  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    // In development, load next.js dev server
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // In production, load from local HTTP static server
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Automatically grant camera permissions for media feeds (e.g. employee registration)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'camera', 'microphone'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  if (isDev) {
    createWindow();
  } else {
    staticServer = startStaticServer((port) => {
      createWindow(port);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isDev) {
        createWindow();
      } else {
        staticServer = startStaticServer((port) => {
          createWindow(port);
        });
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (staticServer) {
    staticServer.close();
  }
});
