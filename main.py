"""
Decky Clipboard - Share clipboard between Steam Deck and other devices via web interface.
"""

import socket
import json
import os
import base64
import mimetypes
import time
import asyncio
from pathlib import Path
from collections import deque
from typing import List, Dict, Any

from aiohttp import web, WSMsgType

import decky
from decky import logger
from clipboard import get_clipboard_data, set_clipboard_data, is_clipboard_available


# Get the path to frontend files and settings
FRONTEND_PATH = Path(__file__).parent / "frontend"
SETTINGS_PATH = Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / "settings.json"

# Default settings
DEFAULT_SETTINGS = {
    "auto_start": True,
    "refresh_interval": 3,
    "max_history": 20,
    "port": 8765,
    "enable_history": False,
    "monitor_interval": 2
}

# Clipboard history storage
clipboard_history: deque = deque(maxlen=50)
last_clipboard_content = ""


def get_frontend_file(filename: str) -> str:
    """Load and cache frontend files."""
    file_path = FRONTEND_PATH / filename
    if file_path.exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    return ""


def load_settings() -> Dict[str, Any]:
    """Load settings from file or return defaults."""
    try:
        if SETTINGS_PATH.exists():
            with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                # Merge with defaults for any missing keys
                return {**DEFAULT_SETTINGS, **settings}
    except Exception as e:
        logger.error(f"Failed to load settings: {e}")
    return DEFAULT_SETTINGS.copy()


def save_settings(settings: Dict[str, Any]) -> bool:
    """Save settings to file."""
    try:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        return False


def add_to_history(content: str, mime_type: str = "text/plain", is_binary: bool = False) -> None:
    """Add content to clipboard history."""
    global last_clipboard_content
    if not content or content == last_clipboard_content:
        return
    
    last_clipboard_content = content
    
    # Create preview
    if is_binary and mime_type.startswith("image/"):
        # For images, preview is the base64 content itself (or a thumbnail if we processed it)
        # Since we don't have image processing lib, we use the full base64 as preview for now
        # In a real app we might want to resize it
        preview = content
    else:
        # For text, first 100 chars
        preview = content.replace('\n', ' ').replace('\r', '')[:100]
    
    # Add to history with timestamp
    history_item = {
        "content": content,
        "timestamp": int(time.time()),
        "preview": preview,
        "type": mime_type,
        "is_binary": is_binary
    }
    
    # Remove duplicate if exists
    for i, item in enumerate(clipboard_history):
        if item["content"] == content:
            del clipboard_history[i]
            break
    
    clipboard_history.appendleft(history_item)


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"


class WebServer:
    """aiohttp-based web server for clipboard sharing."""
    
    def __init__(self):
        # Increase max request size to 50MB to support image uploads
        self._app = web.Application(client_max_size=1024**2 * 50)
        self._app.router.add_get("/", self._handle_index)
        self._app.router.add_get("/i18n.js", self._handle_i18n)
        self._app.router.add_get("/api/clipboard", self._handle_get_clipboard)
        self._app.router.add_post("/api/clipboard", self._handle_set_clipboard)
        self._app.router.add_get("/api/status", self._handle_status)
        self._app.router.add_get("/api/ws", self._handle_websocket)
        self._runner = None
        self._site = None
        self._html_cache = None
        self._i18n_cache = None
        self._websockets = set()
    
    async def _handle_index(self, request):
        if self._html_cache is None:
            self._html_cache = get_frontend_file("index.html")
        return web.Response(text=self._html_cache, content_type="text/html")
    
    async def _handle_i18n(self, request):
        if self._i18n_cache is None:
            self._i18n_cache = get_frontend_file("i18n.js")
        return web.Response(text=self._i18n_cache, content_type="application/javascript")

    async def _handle_websocket(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        self._websockets.add(ws)
        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    if msg.data == 'ping':
                        await ws.send_str('pong')
                elif msg.type == WSMsgType.ERROR:
                    logger.error(f'ws connection closed with exception {ws.exception()}')
        finally:
            self._websockets.discard(ws)
        return ws

    async def broadcast(self, data: Dict[str, Any]):
        if not self._websockets:
            return
        for ws in list(self._websockets):
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.error(f"Failed to send to websocket: {e}")
                self._websockets.discard(ws)
    
    async def _handle_get_clipboard(self, request):
        try:
            data = get_clipboard_data()
            content = data.get("content", "")
            mime_type = data.get("type", "text/plain")
            is_binary = data.get("is_binary", False)
            
            # For binary/image data, convert to base64 for JSON serialization
            if is_binary and content:
                content = base64.b64encode(content).decode('utf-8') if isinstance(content, bytes) else content
            
            return web.json_response({
                "success": True, 
                "type": mime_type,
                "content": content,
                "is_binary": is_binary
            })
        except Exception as e:
            logger.error(f"get_clipboard error: {e}")
            return web.json_response({"success": False, "error": str(e)})
    
    async def _handle_set_clipboard(self, request):
        try:
            data = await request.json()
            content = data.get("content", "")
            mime_type = data.get("type", "text/plain")
            is_base64 = data.get("is_base64", False)
            
            success = set_clipboard_data(content, mime_type, is_base64)
            return web.json_response({"success": success})
        except Exception as e:
            logger.error(f"set_clipboard error: {e}")
            return web.json_response({"success": False, "error": str(e)})
    
    async def _handle_status(self, request):
        return web.json_response({
            "running": self._runner is not None,
            "ip": get_local_ip(),
            "clipboard_available": is_clipboard_available()
        })
    
    async def start(self, port: int):
        if self._runner is not None:
            logger.warning("WebServer already running")
            return
        
        logger.info(f"Starting aiohttp web server on port {port}")
        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        # Enable SO_REUSEADDR to allow quick restart
        self._site = web.TCPSite(self._runner, host="0.0.0.0", port=port, reuse_address=True)
        await self._site.start()
        logger.info(f"Web server listening on 0.0.0.0:{port}")
    
    async def stop(self):
        if self._runner is not None:
            logger.info("Stopping web server")
            try:
                await self._runner.cleanup()
            except Exception as e:
                logger.warning(f"Error during cleanup: {e}")
            self._runner = None
            self._site = None
    
    @property
    def is_running(self):
        return self._runner is not None


class Plugin:
    server_port = 8765
    web_server = None
    settings = DEFAULT_SETTINGS.copy()

    # Frontend API
    async def get_server_status(self):
        running = self.web_server is not None and self.web_server.is_running
        return {
            "running": running,
            "ip": get_local_ip(),
            "port": self.server_port,
            "url": f"http://{get_local_ip()}:{self.server_port}",
            "clipboard_available": is_clipboard_available()
        }

    async def start_server(self):
        if self.web_server is not None and self.web_server.is_running:
            return {"success": True, "message": "Already running"}
        try:
            if self.web_server is None:
                self.web_server = WebServer()
            await self.web_server.start(self.server_port)
            return {"success": True, "url": f"http://{get_local_ip()}:{self.server_port}"}
        except Exception as e:
            logger.error(f"Failed to start server: {e}")
            return {"success": False, "error": str(e)}

    async def stop_server(self):
        if self.web_server is not None:
            await self.web_server.stop()
        return {"success": True}

    async def restart_server(self):
        """Restart server with current port setting."""
        try:
            # Stop existing server
            if self.web_server is not None and self.web_server.is_running:
                await self.web_server.stop()
                logger.info("Stopped server for restart")
            
            # Reload settings to get latest port
            self.settings = load_settings()
            self.server_port = self.settings.get("port", 8765)
            
            # Start with new port
            if self.web_server is None:
                self.web_server = WebServer()
            
            await self.web_server.start(self.server_port)
            url = f"http://{get_local_ip()}:{self.server_port}"
            logger.info(f"Server restarted on {url}")
            return {"success": True, "url": url}
        except Exception as e:
            logger.error(f"Failed to restart server: {e}")
            return {"success": False, "error": str(e)}

    async def get_clipboard_content(self):
        # Legacy frontend support (text only)
        content = get_clipboard()
        if content and self.settings.get("enable_history", False):
            add_to_history(content)
        return {"success": content is not None, "content": content or ""}

    async def get_clipboard_data(self):
        """Get clipboard data with type information (supports images)."""
        try:
            data = get_clipboard_data()
            content = data.get("content", "")
            mime_type = data.get("type", "text/plain")
            is_binary = data.get("is_binary", False)
            
            # Add to history if enabled (even if monitor is slow/disabled, manual refresh triggers save)
            # But only if history is enabled in settings
            if self.settings.get("enable_history", False) and content:
                add_to_history(content, mime_type, is_binary)
            
            return {
                "success": True,
                "type": mime_type,
                "content": content,
                "is_binary": is_binary
            }
        except Exception as e:
            logger.error(f"get_clipboard_data error: {e}")
            return {"success": False, "type": "text/plain", "content": "", "is_binary": False}

    async def set_clipboard_content(self, content: str):
        # Legacy frontend support (text only)
        result = set_clipboard(content)
        if result and content and self.settings.get("enable_history", False):
            add_to_history(content)
        return {"success": result}

    async def clear_clipboard(self):
        """Clear the clipboard content."""
        try:
            result = set_clipboard("")
            return {"success": result}
        except Exception as e:
            logger.error(f"Failed to clear clipboard: {e}")
            return {"success": False, "error": str(e)}

    async def get_settings(self):
        """Get current settings."""
        self.settings = load_settings()
        return self.settings

    async def save_settings(self, settings: Dict[str, Any]):
        """Save settings."""
        try:
            self.settings = {**self.settings, **settings}
            result = save_settings(self.settings)
            
            if not result:
                return {"success": False, "error": "Failed to write settings file"}
            
            # Update port in memory (actual restart handled by frontend)
            if "port" in settings:
                old_port = self.server_port
                new_port = settings["port"]
                if new_port != old_port:
                    logger.info(f"Port changed from {old_port} to {new_port}")
                    self.server_port = new_port
            
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
            return {"success": False, "error": str(e)}

    async def get_clipboard_history(self):
        """Get clipboard history."""
        max_items = self.settings.get("max_history", 20)
        history_list = list(clipboard_history)[:max_items]
        return {"success": True, "history": history_list}

    async def clear_history(self):
        """Clear clipboard history."""
        clipboard_history.clear()
        return {"success": True}

    async def restore_history_item(self, item: Dict[str, Any]):
        """Restore a history item to clipboard."""
        try:
            content = item.get("content", "")
            mime_type = item.get("type", "text/plain")
            is_binary = item.get("is_binary", False)
            
            # If it's binary image, content is base64 string
            # set_clipboard_data expects base64 string if is_base64=True
            
            success = set_clipboard_data(content, mime_type, is_base64=is_binary)
            return {"success": success}
        except Exception as e:
            logger.error(f"Failed to restore history item: {e}")
            return {"success": False, "error": str(e)}

    # Lifecycle
    async def _main(self):
        logger.info("Decky Clipboard starting...")
        
        # Load settings
        self.settings = load_settings()
        self.server_port = self.settings.get("port", 8765)
        
        # Initialize web server
        self.web_server = WebServer()
        
        # Auto-start if enabled
        if self.settings.get("auto_start", True):
            result = await self.start_server()
            if result.get("success"):
                logger.info(f"Web server at {result.get('url')}")
            else:
                logger.error(f"Server failed: {result.get('error')}")
        else:
            logger.info("Auto-start disabled, server not started")

        # Start clipboard monitor
        self._monitor_running = True
        asyncio.create_task(self._clipboard_monitor())

    async def _clipboard_monitor(self):
        """Monitor clipboard for changes."""
        logger.info("Clipboard monitor started")
        last_content = None
        
        while getattr(self, '_monitor_running', False):
            try:
                # Check clipboard content
                data = get_clipboard_data()
                content = data.get("content", "")
                mime_type = data.get("type", "text/plain")
                is_binary = data.get("is_binary", False)
                
                # If content changed, broadcast and update history
                if content != last_content:
                    last_content = content
                    
                    # Broadcast to websockets
                    if self.web_server and self.web_server.is_running:
                        # Prepare data for broadcast
                        broadcast_content = content
                        if is_binary and content:
                            broadcast_content = base64.b64encode(content).decode('utf-8') if isinstance(content, bytes) else content
                            
                        await self.web_server.broadcast({
                            "success": True,
                            "type": mime_type,
                            "content": broadcast_content,
                            "is_binary": is_binary
                        })

                    # Add to history if enabled
                    if self.settings.get("enable_history", False) and content:
                        add_to_history(content, mime_type, is_binary)
            except Exception as e:
                logger.debug(f"Monitor error: {e}")
            
            # Wait before next check
            interval = self.settings.get("monitor_interval", 2)
            await asyncio.sleep(max(0.5, interval))

    async def _unload(self):
        logger.info("Decky Clipboard unloading...")
        self._monitor_running = False
        await self.stop_server()

    async def _uninstall(self):
        logger.info("Decky Clipboard uninstalling...")
        await self.stop_server()
