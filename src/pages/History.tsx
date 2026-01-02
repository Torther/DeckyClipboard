import { FC, useState, useEffect } from "react";
import {
  DialogBody,
  DialogControlsSection,
  DialogControlsSectionHeader,
  DialogButton,
  Field,
} from "@decky/ui";
import { callable, toaster } from "@decky/api";
import { FaHistory, FaTrash, FaCopy, FaCheck, FaClock } from "react-icons/fa";
import { t } from "../i18n";

// History item type
interface HistoryItem {
  content: string;
  timestamp: number;
  preview: string;
  type?: string;
  is_binary?: boolean;
}

const getClipboardHistory = callable<[], { success: boolean; history: HistoryItem[] }>("get_clipboard_history");
const clearHistory = callable<[], { success: boolean }>("clear_history");

export const History: FC = () => {
  const translations = t();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const result = await getClipboardHistory();
      if (result.success) {
        setHistory(result.history || []);
      } else {
        console.error("Failed to load history");
        toaster.toast({
          title: translations.error || "Error",
          body: translations.failedToLoadHistory || "Failed to load clipboard history",
        });
      }
    } catch (e) {
      console.error("Failed to load history:", e);
      toaster.toast({
        title: translations.error || "Error",
        body: String(e),
      });
    }
    setLoading(false);
  };

  const handleClearHistory = async () => {
    try {
      const result = await clearHistory();
      if (result.success) {
        setHistory([]);
        toaster.toast({
          title: translations.historyCleared,
          body: translations.historyClearedBody
        });
      } else {
        toaster.toast({
          title: translations.error || "Error",
          body: translations.failedToClearHistory || "Failed to clear history",
        });
      }
    } catch (e) {
      console.error("Failed to clear history:", e);
      toaster.toast({
        title: translations.error || "Error",
        body: String(e),
      });
    }
  };

  const handleRestore = async (item: HistoryItem, index: number) => {
    try {
      const result = await callable<[item: HistoryItem], { success: boolean }>("restore_history_item")(item);
      
      if (result.success) {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 1500);
        toaster.toast({
          title: translations.copiedFromHistory,
          body: translations.copiedFromHistoryBody
        });
      } else {
        toaster.toast({
          title: translations.error || "Error",
          body: translations.failedToRestore || "Failed to restore clipboard",
        });
      }
    } catch (e) {
      console.error("Failed to restore from history:", e);
      toaster.toast({
        title: translations.error || "Error",
        body: String(e),
      });
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return translations.justNow;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}${translations.minutesAgo}`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}${translations.hoursAgo}`;
    return date.toLocaleDateString();
  };

  const truncateText = (text: string, maxLength: number = 80): string => {
    if (!text) return translations.empty;
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  if (loading) {
    return (
      <DialogBody>
        <DialogControlsSection>
          <div style={{ textAlign: "center", padding: "20px", color: "#888" }}>
            {translations.loading}
          </div>
        </DialogControlsSection>
      </DialogBody>
    );
  }

  return (
    <DialogBody>
      <DialogControlsSection>
        <DialogControlsSectionHeader>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaHistory />
            {translations.clipboardHistory} ({history.length})
          </div>
        </DialogControlsSectionHeader>

        {history.length > 0 ? (
          <>
          <div style={{ padding: "8px 0 16px", display: "flex", justifyContent: "center" }}>
            <DialogButton
              style={{ 
                padding: "10px 24px", 
                fontSize: "14px",
                background: "#ff4757",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
              onClick={handleClearHistory}
            >
              <FaTrash />
              {translations.clearHistory}
            </DialogButton>
          </div>
          {history.map((item, index) => (
            <Field
              key={item.timestamp}
              label={
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <FaClock style={{ fontSize: "10px", opacity: 0.6 }} />
                  <span>{formatTime(item.timestamp)}</span>
                </div>
              }
              description={
                item.is_binary && item.type?.startsWith("image/") ? (
                  <div style={{ marginTop: "4px" }}>
                    <img 
                      src={`data:${item.type};base64,${item.preview}`}
                      alt="History Image"
                      style={{ 
                        maxWidth: "100%",
                        maxHeight: "80px",
                        objectFit: "contain",
                        borderRadius: "4px",
                        display: "block"
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ 
                    fontFamily: "monospace", 
                    fontSize: "12px",
                    color: "#b8c7d0",
                    marginTop: "4px"
                  }}>
                    {truncateText(item.preview || item.content)}
                  </div>
                )
              }
              icon={copiedIndex === index ? 
                <FaCheck style={{ color: "#2ed573", display: "block" }} /> : 
                <FaCopy style={{ display: "block" }} />
              }
              focusable
              onClick={() => handleRestore(item, index)}
            >
              <DialogButton
                style={{ padding: "6px 14px", fontSize: "12px" }}
                onClick={() => handleRestore(item, index)}
              >
                {translations.restore}
              </DialogButton>
            </Field>
          ))}
          </>
        ) : (
          <div style={{ 
            textAlign: "center", 
            color: "#666", 
            padding: "40px 20px",
            fontSize: "14px"
          }}>
            <FaHistory style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.3 }} />
            <div>{translations.noHistory}</div>
          </div>
        )}
      </DialogControlsSection>
    </DialogBody>
  );
};
