import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  ToggleField,
  Field,
  Router,
  SidebarNavigation,
  staticClasses,
  Navigation,
} from "@decky/ui";
import {
  addEventListener,
  removeEventListener,
  callable,
  definePlugin,
  toaster,
  routerHook,
} from "@decky/api";
import { FC, useState, useEffect, useCallback, useRef } from "react";
import {
  FaClipboard,
  FaTrash,
  FaHistory,
  FaCog,
  FaSync,
  FaExternalLinkAlt,
  FaImage,
  FaQrcode,
} from "react-icons/fa";
import { QRCodeSVG } from "qrcode.react";
import { t } from "./i18n";
import { Settings, History } from "./pages";

// Pre-defined styles to avoid re-creating objects on each render
const contentStyles = {
  loadingContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "12px",
    padding: "20px 0",
  },
  qrContainer: {
    display: "flex",
    justifyContent: "center",
    padding: "12px 0",
    background: "transparent",
  },
  buttonContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  imagePreview: {
    maxWidth: "100%",
    maxHeight: "120px",
    objectFit: "contain" as const,
    borderRadius: "6px",
    display: "block" as const,
  },
  imageContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "8px",
    background: "#1a2329",
    borderRadius: "6px",
    border: "1px solid #2a3439",
  },
  textPreviewFilled: {
    fontSize: "12px",
    maxHeight: "80px",
    overflow: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    background: "#1a2329",
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #2a3439",
    fontFamily: "monospace",
    color: "#b8c7d0",
    lineHeight: "1.4",
  },
  textPreviewEmpty: {
    fontSize: "12px",
    maxHeight: "80px",
    overflow: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    background: "#1a2329",
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #2a3439",
    fontFamily: "monospace",
    color: "#666",
    textAlign: "center" as const,
    lineHeight: "1.4",
  },
  actionRow: {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  },
  actionBtnFlex: {
    flex: 1,
  },
  serverUrlText: {
    fontSize: "11px",
    color: "#8ba4b5",
    fontFamily: "monospace",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
} as const;

// Backend API calls
const getServerStatus = callable<
  [],
  {
    running: boolean;
    ip: string;
    port: number;
    url: string;
    clipboard_available: boolean;
  }
>("get_server_status");

const startServer = callable<
  [],
  { success: boolean; url?: string; error?: string }
>("start_server");
const stopServer = callable<[], { success: boolean }>("stop_server");
const getClipboardData = callable<
  [],
  { success: boolean; type?: string; content?: string; is_binary?: boolean }
>("get_clipboard_data");
const clearClipboard = callable<[], { success: boolean }>("clear_clipboard");

// Clipboard content type
interface ClipboardData {
  content: string;
  type: string;
  isBinary: boolean;
}

// Utility function - defined at module level to avoid re-creation on each render
const truncateText = (
  text: string,
  emptyText: string,
  maxLength: number = 100,
): string => {
  if (!text) return emptyText;
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

// Sidebar main content
const Content: FC = () => {
  const [serverRunning, setServerRunning] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [clipboardData, setClipboardData] = useState<ClipboardData>({
    content: "",
    type: "text/plain",
    isBinary: false,
  });
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serverChanging, setServerChanging] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const clearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isClearingRef = useRef(false);

  const translations = t();

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getServerStatus();
      setServerRunning(status.running);
      setServerUrl(status.url);
    } catch (e) {
      console.error("Failed to get server status:", e);
    }
    setLoading(false);
  }, []);

  const refreshClipboard = useCallback(async () => {
    try {
      const result = await getClipboardData();
      if (result.success) {
        setClipboardData({
          content: result.content || "",
          type: result.type || "text/plain",
          isBinary: result.is_binary || false,
        });
      }
    } catch (e) {
      console.error("Failed to get clipboard:", e);
    }
  }, []);

  // Refresh when component mounts (sidebar opens)
  useEffect(() => {
    refreshStatus();
    refreshClipboard();
  }, []);

  const toggleServer = async (enabled: boolean) => {
    setServerChanging(true);
    try {
      if (enabled) {
        const result = await startServer();
        if (result.success) {
          setServerRunning(true);
          setServerUrl(result.url || "");
          toaster.toast({
            title: translations.serverStarted,
            body: translations.serverStartedBody(result.url || ""),
            icon: <FaClipboard />,
          });
        } else {
          toaster.toast({
            title: translations.serverStartFailed,
            body: translations.serverStartFailedBody(result.error || ""),
            icon: <FaClipboard />,
          });
        }
      } else {
        await stopServer();
        setServerRunning(false);
        setShowQR(false);
        toaster.toast({
          title: translations.serverStopped,
          body: translations.serverStoppedBody,
          icon: <FaClipboard />,
        });
      }
    } catch (e) {
      console.error("Failed to toggle server:", e);
    }
    setServerChanging(false);
  };

  const handleClearClipboard = useCallback(async () => {
    // Debounce: prevent rapid repeated clicks
    if (isClearingRef.current) return;

    // Clear any pending timeout
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
    }

    isClearingRef.current = true;
    setIsClearing(true);
    try {
      await clearClipboard();
      setClipboardData({ content: "", type: "text/plain", isBinary: false });
      const currentTranslations = t();
      toaster.toast({
        title: currentTranslations.clipboardCleared,
        body: currentTranslations.clipboardClearedBody,
        icon: <FaClipboard />,
      });
    } catch (e) {
      console.error("Failed to clear clipboard:", e);
      const currentTranslations = t();
      toaster.toast({
        title: currentTranslations.error || "Error",
        body: String(e),
        icon: <FaClipboard />,
      });
    }
    // Add debounce delay before allowing next clear
    clearTimeoutRef.current = setTimeout(() => {
      isClearingRef.current = false;
      setIsClearing(false);
    }, 500);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshClipboard();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (loading) {
    return (
      <PanelSection>
        <PanelSectionRow>
          <div style={contentStyles.loadingContainer}>
            <FaSync
              className="decky-clipboard-spin"
              style={{ fontSize: "18px" }}
            />
            <span style={{ color: "#8ba4b5", fontSize: "13px" }}>
              {translations.initializing}
            </span>
          </div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      {/* Service Control */}
      <PanelSection title={translations.webServer}>
        <PanelSectionRow>
          <ToggleField
            label={translations.enableWebInterface}
            description={
              serverRunning ? undefined : translations.enableWebInterfaceDesc
            }
            checked={serverRunning}
            disabled={serverChanging}
            onChange={toggleServer}
          />
        </PanelSectionRow>

        {serverRunning && (
          <>
            <PanelSectionRow>
              <Field
                label={
                  <div style={contentStyles.serverUrlText}>{serverUrl}</div>
                }
                focusable
                onClick={() => Navigation.NavigateToExternalWeb(serverUrl)}
                icon={<FaExternalLinkAlt style={{ fontSize: "12px" }} />}
              >
                <FaQrcode
                  style={{
                    fontSize: "14px",
                    cursor: "pointer",
                    opacity: showQR ? 1 : 0.5,
                  }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setShowQR(!showQR);
                  }}
                />
              </Field>
            </PanelSectionRow>

            {showQR && (
              <PanelSectionRow>
                <div style={contentStyles.qrContainer}>
                  <QRCodeSVG
                    value={serverUrl}
                    size={140}
                    bgColor="transparent"
                    fgColor="#32373D"
                    level="M"
                  />
                </div>
              </PanelSectionRow>
            )}
          </>
        )}
      </PanelSection>

      {/* Current Clipboard */}
      <PanelSection title={translations.currentClipboard}>
        <PanelSectionRow>
          <Field
            label={translations.contentPreview}
            icon={clipboardData.isBinary ? <FaImage /> : <FaClipboard />}
            focusable
            onClick={handleRefresh}
          >
            <FaSync
              style={{
                fontSize: "12px",
                animation: isRefreshing ? "spin 0.5s linear infinite" : "none",
              }}
            />
          </Field>
        </PanelSectionRow>

        <PanelSectionRow>
          {clipboardData.isBinary &&
          clipboardData.type?.startsWith("image/") ? (
            <div style={contentStyles.imageContainer}>
              <img
                src={`data:${clipboardData.type};base64,${clipboardData.content}`}
                alt="Clipboard Image"
                style={contentStyles.imagePreview}
              />
            </div>
          ) : (
            <div
              style={
                clipboardData.content
                  ? contentStyles.textPreviewFilled
                  : contentStyles.textPreviewEmpty
              }
            >
              {truncateText(clipboardData.content, translations.empty)}
            </div>
          )}
        </PanelSectionRow>

        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={handleClearClipboard}
            disabled={!clipboardData.content || isClearing}
          >
            <div style={contentStyles.buttonContent}>
              {isClearing ? (
                <FaSync className="decky-clipboard-spin" />
              ) : (
                <FaTrash />
              )}
              {isClearing
                ? translations.clearing || "Clearing..."
                : translations.clear}
            </div>
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      {/* Navigation */}
      <PanelSection>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => {
              Router.CloseSideMenus();
              Router.Navigate("/decky-clipboard/history");
            }}
          >
            <div style={contentStyles.buttonContent}>
              <FaHistory />
              {translations.tabHistory}
            </div>
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => {
              Router.CloseSideMenus();
              Router.Navigate("/decky-clipboard/settings");
            }}
          >
            <div style={contentStyles.buttonContent}>
              <FaCog />
              {translations.tabSettings}
            </div>
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .decky-clipboard-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </>
  );
};

// Router component for settings pages
const DeckyClipboardRouter: FC = () => {
  const translations = t();

  return (
    <SidebarNavigation
      title="Decky Clipboard"
      showTitle
      pages={[
        {
          title: translations.tabHistory,
          content: <History />,
          route: "/decky-clipboard/history",
        },
        {
          title: translations.tabSettings,
          content: <Settings />,
          route: "/decky-clipboard/settings",
        },
      ]}
    />
  );
};

export default definePlugin(() => {
  const translations = t();
  console.log(translations.consoleInitializing);

  // Register router
  routerHook.addRoute("/decky-clipboard", DeckyClipboardRouter);

  // Listen for server started event
  const listener = addEventListener<[url: string]>("server_started", (url) => {
    console.log(translations.consoleServerStarted(url));
    toaster.toast({
      title: translations.serverReady,
      body: translations.serverReadyBody(url),
      icon: <FaClipboard />,
    });
  });

  return {
    name: "Decky Clipboard",
    titleView: <div className={staticClasses.Title}>Decky Clipboard</div>,
    content: <Content />,
    icon: <FaClipboard />,
    onDismount() {
      console.log(translations.consoleUnloading);
      removeEventListener("server_started", listener);
      routerHook.removeRoute("/decky-clipboard");
    },
  };
});
