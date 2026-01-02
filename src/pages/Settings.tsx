import { FC, useState, useEffect, useRef, useCallback } from "react";
import {
  DialogBody,
  DialogControlsSection,
  DialogControlsSectionHeader,
  ToggleField,
  SliderField,
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
  monitor_interval: number;
}

const getSettings = callable<[], Settings>("get_settings");
const saveSettings = callable<[settings: Partial<Settings>], { success: boolean }>("save_settings");

export const Settings: FC = () => {
  const translations = t();
  const [settings, setSettings] = useState<Settings>({
    auto_start: true,
    max_history: 20,
    port: 8765,
    enable_history: false,
    monitor_interval: 5
  });
  const [loading, setLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const debouncedSave = useCallback((newSettings: Partial<Settings>, isPortChange: boolean = false) => {
    // Update local state immediately for responsive UI
    setSettings(prev => ({ ...prev, ...newSettings }));
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout to save
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const toSave = { ...settings, ...newSettings };
        await saveSettings(toSave);
        
        if (isPortChange) {
          toaster.toast({
            title: translations.serverSettings || "Server Settings",
            body: translations.portChangeHint || "Port changes will take effect after restarting the device.",
          });
        }
      } catch (e) {
        console.error("Failed to save settings:", e);
        toaster.toast({
          title: translations.error || "Error",
          body: String(e),
        });
      }
    }, 1000);
  }, [settings, translations]);

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

        <div style={{ padding: "8px 0" }}>
          <div style={{ marginBottom: "4px", fontSize: "14px" }}>{translations.serverPort}</div>
          <TextField
            value={String(settings.port)}
            onChange={(e: any) => {
              const value = e?.target?.value ?? e;
              const val = parseInt(value, 10);
              if (!isNaN(val) && val >= 1024 && val <= 65535) {
                debouncedSave({ port: val }, true);
              } else if (value === '' || (!isNaN(val) && val >= 1 && val < 1024)) {
                // Allow typing, but don't save invalid ports
                setSettings(prev => ({ ...prev, port: val || 8765 }));
              }
            }}
            style={{ width: "100%" }}
          />
          <div style={{ 
            fontSize: "11px", 
            color: "#888", 
            marginTop: "8px",
            lineHeight: "1.4"
          }}>
            {translations.portChangeHint || "Port changes will take effect after restarting the device."}
          </div>
        </div>
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
          <>
            <SliderField
              label={translations.monitorInterval}
              description={`${settings.monitor_interval} ${translations.seconds}`}
              value={settings.monitor_interval}
              min={5}
              max={60}
              step={5}
              onChange={(value) => debouncedSave({ monitor_interval: value })}
            />

            <SliderField
              label={translations.maxHistory}
              description={`${settings.max_history} ${translations.items}`}
              value={settings.max_history}
              min={5}
              max={50}
              step={5}
              onChange={(value) => debouncedSave({ max_history: value })}
            />
          </>
        )}
      </DialogControlsSection>
    </DialogBody>
  );
};
