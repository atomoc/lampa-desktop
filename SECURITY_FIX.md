# Security Fixes

This PR addresses critical security vulnerabilities that allowed arbitrary code execution (RCE) and unrestricted file system access from the renderer process.

## Changes

1.  **Removed Insecure IPC Handlers (`src/modules/ipcHandlers/processHandlers.js`)**
    *   Deleted the generic `child-process-spawn` and `fs-existsSync` IPC handlers.
    *   These handlers allowed any script in the renderer (including potential XSS or malicious plugins) to execute arbitrary system commands and probe the file system.
    *   **Impact:** Prevents RCE.

2.  **Sanitized `preload.js`**
    *   Removed the `window.require` bridge that exposed `child_process` and `fs` modules to the frontend.
    *   **Impact:** Enforces context isolation and prevents the frontend from accessing Node.js internals directly.

3.  **Restricted External Links (`src/modules/windowManager.js`)**
    *   Updated `setWindowOpenHandler` to only allow `http:` and `https:` protocols.
    *   **Impact:** Prevents the application from opening potentially dangerous protocols (e.g., `file://`, `smb://`, `javascript:`) via `shell.openExternal`.

4.  **Updated `package.json`**
    *   Removed `"npm": "please-use-yarn"` restriction to allow installation via standard `npm`.

## verification
*   The application continues to function because `LampaInitializer` and `TorrServerManager` use internal main-process logic for their operations, rather than relying on the insecure frontend-to-backend bridge.
