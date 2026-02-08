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

const getClipboardHistory = callable<
  [],
  { success: boolean; history: HistoryItem[] }
>("get_clipboard_history");
const clearHistory = callable<[], { success: boolean }>("clear_history");
const restoreHistoryItem = callable<[item: HistoryItem], { success: boolean }>(
  "restore_history_item",
);

// Module-level utility to avoid re-creation on each render
const truncatePreview = (
  text: string,
  emptyText: string,
  maxLength: number = 80,
): string => {
  if (!text) return emptyText;
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

// Pre-defined styles to avoid re-creating objects on each render
const styles = {
  loadingContainer: {
    textAlign: "center" as const,
    padding: "20px",
    color: "#888",
  },
  headerContainer: { display: "flex", alignItems: "center", gap: "8px" },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#8ba4b5",
    fontWeight: "normal" as const,
  },
  clearBtnContainer: {
    padding: "16px 0 8px",
    display: "flex",
    justifyContent: "center",
  },
  clearBtn: {
    padding: "8px 20px",
    fontSize: "13px",
    background: "rgba(255, 71, 87, 0.15)",
    color: "#ff6b7a",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  clockIcon: { fontSize: "10px", opacity: 0.5 },
  imagePreview: {
    maxWidth: "100%",
    maxHeight: "60px",
    objectFit: "contain" as const,
    borderRadius: "4px",
    display: "block" as const,
  },
  imageContainer: { marginTop: "4px" },
  textPreview: {
    fontFamily: "monospace",
    fontSize: "11px",
    color: "#8ba4b5",
    marginTop: "2px",
    lineHeight: "1.3",
  },
  emptyContainer: {
    textAlign: "center" as const,
    color: "#555",
    padding: "48px 20px",
    fontSize: "13px",
  },
  emptyIcon: { fontSize: "28px", marginBottom: "12px", opacity: 0.2 },
  checkIcon: { color: "#2ed573", display: "block" as const },
  copyIcon: { display: "block" as const, opacity: 0.6 },
  restoreBtn: { padding: "6px 12px", fontSize: "11px" },
  itemLabel: { display: "flex", alignItems: "center", gap: "6px" },
} as const;

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
          body:
            translations.failedToLoadHistory ||
            "Failed to load clipboard history",
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
          body: translations.historyClearedBody,
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
      const result = await restoreHistoryItem(item);

      if (result.success) {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 1500);
        toaster.toast({
          title: translations.copiedFromHistory,
          body: translations.copiedFromHistoryBody,
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
    if (diff < 3600000)
      return `${Math.floor(diff / 60000)}${translations.minutesAgo}`;
    if (diff < 86400000)
      return `${Math.floor(diff / 3600000)}${translations.hoursAgo}`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <DialogBody>
        <DialogControlsSection>
          <div style={styles.loadingContainer}>{translations.loading}</div>
        </DialogControlsSection>
      </DialogBody>
    );
  }

  return (
    <DialogBody>
      <DialogControlsSection>
        <DialogControlsSectionHeader>
          <div style={styles.headerContainer}>
            <FaHistory />
            <span>{translations.clipboardHistory}</span>
            <span style={styles.headerRight}>({history.length})</span>
          </div>
        </DialogControlsSectionHeader>

        {history.length > 0 ? (
          <>
            {history.map((item, index) => (
              <Field
                key={item.timestamp}
                label={
                  <div style={styles.itemLabel}>
                    <FaClock style={styles.clockIcon} />
                    <span>{formatTime(item.timestamp)}</span>
                  </div>
                }
                description={
                  item.is_binary && item.type?.startsWith("image/") ? (
                    <div style={styles.imageContainer}>
                      <img
                        src={`data:${item.type};base64,${item.preview}`}
                        alt="History Image"
                        style={styles.imagePreview}
                      />
                    </div>
                  ) : (
                    <div style={styles.textPreview}>
                      {truncatePreview(
                        item.preview || item.content,
                        translations.empty,
                      )}
                    </div>
                  )
                }
                icon={
                  copiedIndex === index ? (
                    <FaCheck style={styles.checkIcon} />
                  ) : (
                    <FaCopy style={styles.copyIcon} />
                  )
                }
                focusable
                onClick={() => handleRestore(item, index)}
              >
                <DialogButton
                  style={styles.restoreBtn}
                  onClick={() => handleRestore(item, index)}
                >
                  {translations.restore}
                </DialogButton>
              </Field>
            ))}
            <div style={styles.clearBtnContainer}>
              <DialogButton
                style={styles.clearBtn}
                onClick={handleClearHistory}
              >
                <FaTrash />
                {translations.clearHistory}
              </DialogButton>
            </div>
          </>
        ) : (
          <div style={styles.emptyContainer}>
            <FaHistory style={styles.emptyIcon} />
            <div>{translations.noHistory}</div>
          </div>
        )}
      </DialogControlsSection>
    </DialogBody>
  );
};
