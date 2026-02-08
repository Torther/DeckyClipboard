import { FC, useState, useEffect, useRef, useCallback } from "react";
import {
  DialogBody,
  DialogControlsSection,
  DialogControlsSectionHeader,
  ToggleField,
  TextField,
} from "@decky/ui";
import { callable, toaster } from "@decky/api";
import { FaCog, FaDatabase } from "react-icons/fa";
import { t } from "../i18n";

// Settings type
interface Settings {
  auto_start: boolean;
  max_history: number;
  port: number;
  enable_history: boolean;
}

const getSettings = callable<[], Settings>("get_settings");
const saveSettings = callable<
  [settings: Partial<Settings>],
  { success: boolean }
>("save_settings");

// Pre-defined styles to avoid re-creating objects on each render
const settingsStyles = {
  loadingContainer: {
    textAlign: "center" as const,
    padding: "20px",
    color: "#888",
  },
  headerContainer: { display: "flex", alignItems: "center", gap: "8px" },
  fieldContainer: {
    padding: "10px 0",
  },
  fieldLabel: {
    marginBottom: "6px",
    fontSize: "13px",
    color: "#b8c7d0",
  },
  fieldHint: {
    fontSize: "11px",
    color: "#666",
    marginTop: "6px",
    lineHeight: "1.4",
  },
  fieldInput: { width: "100%" },
  sectionSpacer: { height: "4px" },
} as const;

export const Settings: FC = () => {
  const translations = t();
  const [settings, setSettings] = useState<Settings>({
    auto_start: true,
    max_history: 20,
    port: 8765,
    enable_history: false,
  });
  const [loading, setLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const settingsRef = useRef(settings);

  // Keep ref in sync with state
  settingsRef.current = settings;

  useEffect(() => {
    loadSettings();
    return () => {
      // Cleanup: save any pending changes before unmount
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const loadSettings = async () => {
    try {
      const result = await getSettings();
      setSettings(result);
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    setLoading(false);
  };

  // Debounced save function - waits 500ms after last change before saving
  const debouncedSave = useCallback(
    (newSettings: Partial<Settings>, isPortChange: boolean = false) => {
      // Update local state immediately for responsive UI
      setSettings((prev) => ({ ...prev, ...newSettings }));

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout to save
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const toSave = { ...settingsRef.current, ...newSettings };
          await saveSettings(toSave);

          if (isPortChange) {
            const currentTranslations = t();
            toaster.toast({
              title: currentTranslations.serverSettings || "Server Settings",
              body:
                currentTranslations.portChangeHint ||
                "Port changes will take effect after restarting the device.",
            });
          }
        } catch (e) {
          console.error("Failed to save settings:", e);
          const currentTranslations = t();
          toaster.toast({
            title: currentTranslations.error || "Error",
            body: String(e),
          });
        }
      }, 1000);
    },
    [],
  ); // No dependencies - uses refs for latest values

  // Immediate save for toggle fields (no notification)
  const handleToggleSave = async (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      await saveSettings(updated);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  if (loading) {
    return (
      <DialogBody>
        <DialogControlsSection>
          <div style={settingsStyles.loadingContainer}>
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
          <div style={settingsStyles.headerContainer}>
            <FaCog />
            {translations.serverSettings || "Server Settings"}
          </div>
        </DialogControlsSectionHeader>

        <ToggleField
          label={translations.autoStart}
          description={translations.autoStartDesc}
          checked={settings.auto_start}
          onChange={(value) => handleToggleSave({ auto_start: value })}
        />

        <div style={settingsStyles.fieldContainer}>
          <div style={settingsStyles.fieldLabel}>{translations.serverPort}</div>
          <TextField
            value={String(settings.port)}
            onChange={(e: any) => {
              const value = e?.target?.value ?? e;
              const val = parseInt(value, 10);
              if (!isNaN(val) && val >= 1024 && val <= 65535) {
                debouncedSave({ port: val }, true);
              } else if (
                value === "" ||
                (!isNaN(val) && val >= 1 && val < 1024)
              ) {
                setSettings((prev) => ({ ...prev, port: val || 8765 }));
              }
            }}
            style={settingsStyles.fieldInput}
          />
          <div style={settingsStyles.fieldHint}>
            {translations.portChangeHint ||
              "Port changes will take effect after restarting the device."}
          </div>
        </div>
      </DialogControlsSection>

      <div style={settingsStyles.sectionSpacer} />

      <DialogControlsSection>
        <DialogControlsSectionHeader>
          <div style={settingsStyles.headerContainer}>
            <FaDatabase />
            {translations.historySettings || "History Settings"}
          </div>
        </DialogControlsSectionHeader>

        <ToggleField
          label={translations.enableHistory}
          description={translations.enableHistoryDesc}
          checked={settings.enable_history}
          onChange={(value) => handleToggleSave({ enable_history: value })}
        />

        {settings.enable_history && (
          <div style={settingsStyles.fieldContainer}>
            <div style={settingsStyles.fieldLabel}>
              {translations.maxHistory}
            </div>
            <TextField
              value={String(settings.max_history)}
              onChange={(e: any) => {
                const value = e?.target?.value ?? e;
                const val = parseInt(value, 10);
                if (!isNaN(val) && val >= 1 && val <= 100) {
                  debouncedSave({ max_history: val });
                }
              }}
              style={settingsStyles.fieldInput}
            />
            <div style={settingsStyles.fieldHint}>
              {`${settings.max_history} ${translations.items}`}
            </div>
          </div>
        )}
      </DialogControlsSection>
    </DialogBody>
  );
};
