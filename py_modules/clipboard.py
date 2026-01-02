"""
Clipboard access module for Steam Deck.
Supports text and images using xclip. Works in Game Mode via XWayland.
Automatically handles file:// URIs and converts image files to clipboard data.
"""

import subprocess
import os
import stat
import base64
import tempfile
from typing import Optional, Tuple, Dict, Union
from urllib.parse import unquote, urlparse

# Try to import decky module for paths and logger
try:
    import decky
    from decky import logger
    PLUGIN_DIR = decky.DECKY_PLUGIN_DIR
    def log_info(msg): logger.info(msg)
    def log_error(msg): logger.error(msg)
    def log_debug(msg): logger.debug(msg)
except ImportError:
    PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    def log_info(msg): print(f"[INFO] {msg}")
    def log_error(msg): print(f"[ERROR] {msg}")
    def log_debug(msg): print(f"[DEBUG] {msg}")


# Constants
BIN_DIR = os.path.join(PLUGIN_DIR, "bin")
GAMESCOPE_ENV_FILE = "/run/user/1000/gamescope-environment"

# Timeout constants (seconds)
TIMEOUT_VERSION_CHECK = 2
TIMEOUT_TARGETS = 10
TIMEOUT_TEXT = 15
TIMEOUT_IMAGE = 45

# Supported image extensions
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}

# Text target types in priority order
TEXT_TARGETS = ['UTF8_STRING', 'text/plain', 'text/uri-list', 'STRING']

# Module state
_xclip_cmd = None
_initialized = False
_x11_display = ":0"
_cached_env = None  # Cached environment variables


def _read_gamescope_env() -> None:
    """Read gamescope environment to get correct DISPLAY."""
    global _x11_display
    
    if not os.path.exists(GAMESCOPE_ENV_FILE):
        return
    
    try:
        with open(GAMESCOPE_ENV_FILE, 'r') as f:
            for line in f:
                if line.startswith('DISPLAY='):
                    _x11_display = line.strip().split('=', 1)[1]
                    log_info(f"Gamescope DISPLAY: {_x11_display}")
                    break
    except Exception as e:
        log_error(f"Failed to read gamescope environment: {e}")


def _find_command(name: str, bundled_path: str, system_paths: list) -> Optional[str]:
    """Find command, preferring bundled binary over system-installed."""
    # Check bundled binary first
    if os.path.isfile(bundled_path):
        try:
            current_mode = os.stat(bundled_path).st_mode
            if not (current_mode & stat.S_IXUSR):
                os.chmod(bundled_path, current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
                log_debug(f"Set executable permission on {bundled_path}")
        except Exception as e:
            log_error(f"Failed to set permissions on {bundled_path}: {e}")
        return bundled_path
    
    # Check system paths
    for path in system_paths:
        try:
            if path.startswith("/"):
                if os.path.isfile(path) and os.access(path, os.X_OK):
                    return path
            else:
                result = subprocess.run(["which", path], capture_output=True, timeout=TIMEOUT_VERSION_CHECK)
                if result.returncode == 0:
                    return result.stdout.decode().strip()
        except:
            pass
    
    return None


def _init_commands() -> None:
    """Initialize command paths and cache environment variables."""
    global _xclip_cmd, _initialized, _cached_env
    
    if _initialized:
        return
    _initialized = True
    
    _read_gamescope_env()
    
    _xclip_cmd = _find_command(
        "xclip",
        os.path.join(BIN_DIR, "xclip"),
        ["/usr/bin/xclip", "/usr/local/bin/xclip", "xclip"]
    )
    
    # Cache environment variables for reuse
    _cached_env = _get_env()
    
    if _xclip_cmd:
        log_info(f"Clipboard initialized with xclip: {_xclip_cmd}")
    else:
        log_error("xclip not found! Clipboard will not work.")


def _get_env() -> dict:
    """Get environment variables for X11 clipboard access."""
    env = os.environ.copy()
    env["DISPLAY"] = _x11_display
    # Try to get XAUTHORITY from deck user
    xauth_path = "/home/deck/.Xauthority"
    if os.path.exists(xauth_path):
        env["XAUTHORITY"] = xauth_path
    return env


def _run_command(cmd: list, env: dict, input_data: bytes = None, 
                 timeout: int = TIMEOUT_TEXT, use_sudo: bool = False, capture_output: bool = True) -> Tuple[int, bytes, str]:
    """
    Run a command with optional runuser (faster than sudo).
    Returns (returncode, stdout_bytes, stderr_str)
    """
    if use_sudo:
        # Use sudo instead of runuser to ensure stdin is handled correctly
        # Pass environment variables directly to the command
        final_cmd = ["sudo", "-u", "deck"]
        
        # Add environment variables as separate arguments
        if "DISPLAY" in env:
            final_cmd.extend(["env", f"DISPLAY={env['DISPLAY']}"])
        if "XAUTHORITY" in env:
            final_cmd.append(f"XAUTHORITY={env['XAUTHORITY']}")
        
        # Add the actual command
        final_cmd.extend(cmd)
        cmd = final_cmd
        env = None  # Don't pass env dict to subprocess when using sudo
    
    stdout_dest = subprocess.PIPE if capture_output else subprocess.DEVNULL
    stderr_dest = subprocess.PIPE if capture_output else subprocess.DEVNULL

    try:
        result = subprocess.run(
            cmd,
            input=input_data,
            stdout=stdout_dest,
            stderr=stderr_dest,
            env=env,
            timeout=timeout
        )
        return result.returncode, result.stdout or b"", (result.stderr or b"").decode() if capture_output else ""
    except subprocess.TimeoutExpired:
        log_error(f"Command timeout: {' '.join(cmd)}")
        return 1, b"", "Timeout"
    except Exception as e:
        log_error(f"Command error: {e}")
        return 1, b"", str(e)


def _run_as_deck_user(cmd: list, env: dict, input_data: bytes = None, 
                      timeout: int = TIMEOUT_TEXT) -> Tuple[int, bytes, str]:
    """
    Run a command as the 'deck' user using runuser (faster than sudo).
    Returns (returncode, stdout_bytes, stderr_str)
    """
    return _run_command(cmd, env, input_data, timeout, use_sudo=True)


def _select_text_target(targets: str) -> Optional[str]:
    """Select the best available text target type."""
    for target in TEXT_TARGETS:
        if target in targets:
            return target
    return None


def _read_image_from_uri(uri: str) -> Optional[Dict[str, Union[str, bool]]]:
    """Read image file from file:// URI and return as base64."""
    try:
        parsed = urlparse(uri.strip())
        file_path = unquote(parsed.path)
        ext = os.path.splitext(file_path)[1].lower()
        
        if ext not in IMAGE_EXTENSIONS:
            return None
            
        if not os.path.isfile(file_path):
            log_error(f"Image file not found: {file_path}")
            return None
        
        with open(file_path, 'rb') as f:
            image_data = f.read()
        
        mime_type = 'image/jpeg' if ext in {'.jpg', '.jpeg'} else f'image/{ext[1:]}'
        log_info(f"Read image from URI: {len(image_data)} bytes, {mime_type}")
        
        return {
            "type": mime_type,
            "content": base64.b64encode(image_data).decode('ascii'),
            "is_binary": True
        }
    except Exception as e:
        log_error(f"Failed to read image from URI: {e}")
        return None


def _get_clipboard_targets() -> Optional[str]:
    """
    Query available clipboard targets (MIME types).
    This is much faster than trying to read and fail.
    Returns space-separated list of available targets or None.
    """
    if not _xclip_cmd:
        return None
    
    try:
        rc, out, err = _run_command(
            [_xclip_cmd, "-selection", "clipboard", "-t", "TARGETS", "-o"],
            _cached_env,
            timeout=TIMEOUT_TARGETS,
            use_sudo=True
        )
        
        if rc == 0 and out:
            targets = out.decode('utf-8', errors='ignore')
            log_debug(f"Clipboard targets: {targets.strip()}")
            return targets
            
    except Exception as e:
        log_debug(f"Failed to query clipboard targets: {e}")
    
    return None


def get_clipboard_data() -> Dict[str, Union[str, bool]]:
    """
    Get the current clipboard content with type information.
    Returns dict with 'type' (mime-type), 'content' (string or base64), and 'is_binary'.
    Optimized with TARGETS probing to avoid unnecessary read attempts.
    """
    _init_commands()
    
    if not _xclip_cmd:
        log_error("xclip not available")
        return {"type": "text/plain", "content": "", "is_binary": False}
    
    # Use cached environment
    env = _cached_env
    
    try:
        # OPTIMIZATION: Query TARGETS first to know what's available
        targets = _get_clipboard_targets()
        
        # Determine what to read based on targets
        has_image = targets and ('image/png' in targets or 'image/jpeg' in targets)
        has_text = targets and any(t in targets for t in TEXT_TARGETS)
        
        # If we have image target, try image first (it's likely what user wants)
        if has_image:
            rc, out, err = _run_command(
                [_xclip_cmd, "-selection", "clipboard", "-t", "image/png", "-o"],
                env, timeout=TIMEOUT_IMAGE, use_sudo=True
            )
            
            if rc == 0 and out:
                log_info(f"Read PNG image: {len(out)} bytes")
                return {
                    "type": "image/png",
                    "content": base64.b64encode(out).decode('ascii'),
                    "is_binary": True
                }
        
        # Try text (either as fallback or primary target)
        if has_text or not targets:
            # Select best text target
            text_target = _select_text_target(targets) if targets else None
            cmd = [_xclip_cmd, "-selection", "clipboard", "-o"]
            if text_target:
                cmd = [_xclip_cmd, "-selection", "clipboard", "-t", text_target, "-o"]
            
            rc, out, err = _run_command(cmd, env, timeout=TIMEOUT_TEXT, use_sudo=True)
            
            if rc == 0 and out:
                content = out.decode('utf-8', errors='ignore')
                
                # Check for file:// URI pointing to an image
                if content.startswith('file://'):
                    image_data = _read_image_from_uri(content)
                    if image_data:
                        return image_data
                
                return {
                    "type": "text/plain",
                    "content": content,
                    "is_binary": False
                }
        
        return {"type": "text/plain", "content": "", "is_binary": False}
        
    except Exception as e:
        log_error(f"Clipboard read error: {e}")
    
    return {"type": "text/plain", "content": "", "is_binary": False}


def set_clipboard_data(content: str, mime_type: str = "text/plain", is_base64: bool = False) -> bool:
    """
    Set the clipboard content.
    
    Args:
        content: Text or base64-encoded binary data
        mime_type: MIME type (e.g., 'text/plain', 'image/png')
        is_base64: Whether content is base64-encoded
    
    Returns:
        True if successful, False otherwise
    """
    _init_commands()
    
    if not _xclip_cmd:
        log_error("xclip not available")
        return False
    
    # Encode data - optimize to avoid unnecessary conversions
    try:
        data_bytes = base64.b64decode(content) if is_base64 else content.encode('utf-8')
    except Exception as e:
        log_error(f"Data encoding error: {e}")
        return False
    
    # Set clipboard - use runuser for better performance
    env = _cached_env
    timeout = TIMEOUT_IMAGE if mime_type.startswith('image/') else TIMEOUT_TEXT
    
    # Use temporary file for data transfer to avoid pipe buffer issues with large files (like GIFs)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(data_bytes)
            tmp_path = tmp.name
        
        # Make readable by deck user
        os.chmod(tmp_path, 0o644)
        
        # Use shell redirection to feed xclip from file
        # Command: xclip -selection clipboard -t mime_type -i < tmp_file
        # We wrap it in sh -c because we are using sudo/runuser
        
        # Note: _run_command prepends sudo/env logic.
        # We pass ["sh", "-c", "..."] as the command.
        
        shell_cmd = f"{_xclip_cmd} -selection clipboard -t {mime_type} -i < {tmp_path}"
        
        # Don't capture output to avoid hanging when xclip forks
        rc, out, err = _run_command(
            ["sh", "-c", shell_cmd],
            env,
            input_data=None, # Data is in file
            timeout=timeout,
            use_sudo=True,
            capture_output=False
        )
        
        if rc == 0:
            log_debug(f"Set clipboard: {mime_type}, {len(data_bytes)} bytes")
            return True
        
        log_error(f"Failed to set clipboard: {err}")
    except Exception as e:
        log_error(f"Clipboard set error: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except:
                pass
    
    return False


def is_clipboard_available() -> bool:
    """Check if clipboard functionality is available."""
    _init_commands()
    return _xclip_cmd is not None
