"""
Decky Clipboard - Share clipboard between Steam Deck and other devices via web interface.
"""

import socket
import json
import os
import base64
import time
from pathlib import Path
from collections import deque
from typing import List, Dict, Any

from aiohttp import web

import decky
from decky import logger
from clipboard import get_clipboard_data, set_clipboard_data, is_clipboard_available


# Get the path to frontend files and settings
# Note: frontend files are stored in defaults/frontend during build,
# but Decky CLI strips the "defaults" prefix when packaging, so runtime path is "frontend"
FRONTEND_PATH = Path(__file__).parent / "frontend"
SETTINGS_PATH = Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / "settings.json"

# Default settings
DEFAULT_SETTINGS = {
    "auto_start": True,
    "max_history": 20,
    "port": 8765,
    "enable_history": False
}

# Clipboard history storage
clipboard_history: deque = deque(maxlen=50)
last_clipboard_content = ""

# IP address cache
_cached_ip = None
_cached_ip_time = 0
_IP_CACHE_TTL = 60  # seconds

# Frontend file cache
_frontend_cache: Dict[str, str] = {}


def get_frontend_file(filename: str) -> str:
    """Load and cache frontend files."""
    if filename in _frontend_cache:
        return _frontend_cache[filename]
    file_path = FRONTEND_PATH / filename
    if file_path.exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            _frontend_cache[filename] = content
            return content
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
    
    # Create preview and manage memory for large content
    if is_binary and mime_type.startswith("image/"):
        # For images, truncate preview to first 2KB of base64 (enough for a tiny thumbnail indicator)
        preview = content[:2048] if len(content) > 2048 else content
        # Don't store full image content if it's too large (>500KB base64 ≈ 375KB raw)
        # This prevents 50 large images from consuming hundreds of MB
        stored_content = content if len(content) <= 512_000 else ""
    else:
        # For text, first 100 chars
        preview = content.replace('\n', ' ').replace('\r', '')[:100]
        stored_content = content
    
    # Add to history with timestamp
    history_item = {
        "content": stored_content,
        "timestamp": int(time.time()),
        "preview": preview,
        "type": mime_type,
        "is_binary": is_binary
    }
    
    # Remove duplicate if exists (iterate from end for safe deletion)
    for i in range(len(clipboard_history) - 1, -1, -1):
        if clipboard_history[i]["content"] == content:
            del clipboard_history[i]
            break
    
    clipboard_history.appendleft(history_item)


def get_local_ip():
    global _cached_ip, _cached_ip_time
    now = time.monotonic()
    if _cached_ip and (now - _cached_ip_time) < _IP_CACHE_TTL:
        return _cached_ip
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        _cached_ip = ip
        _cached_ip_time = now
        return ip
    except:
        return _cached_ip or "127.0.0.1"


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
        self._runner = None
        self._site = None
        self._html_cache = None
        self._i18n_cache = None
    
    async def _handle_index(self, request):
        if self._html_cache is None:
            self._html_cache = get_frontend_file("index.html")
        return web.Response(text=self._html_cache, content_type="text/html")
    
    async def _handle_i18n(self, request):
        if self._i18n_cache is None:
            self._i18n_cache = get_frontend_file("i18n.js")
        return web.Response(text=self._i18n_cache, content_type="application/javascript")

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
        ip = get_local_ip()
        return {
            "running": running,
            "ip": ip,
            "port": self.server_port,
            "url": f"http://{ip}:{self.server_port}",
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
            
            # Add to history if enabled
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

    async def _unload(self):
        logger.info("Decky Clipboard unloading...")
        await self.stop_server()

    async def _uninstall(self):
        logger.info("Decky Clipboard uninstalling...")
        await self.stop_server()
