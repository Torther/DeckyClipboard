/**
 * i18n translations for Decky Clipboard
 * Supports English and Chinese (Simplified)
 */

export type Locale = 'en' | 'zh';

interface Translations {
  // Loading
  loading: string;
  initializing: string;
  
  // Tab navigation
  tabHistory: string;
  tabSettings: string;
  
  // Web Server section
  webServer: string;
  enableWebInterface: string;
  enableWebInterfaceDesc: string;
  showQR: string;
  showQRDesc: string;
  openInBrowser: string;
  
  // Clipboard section
  currentClipboard: string;
  contentPreview: string;
  empty: string;
  clear: string;
  clearing: string;
  clipboardCleared: string;
  clipboardClearedBody: string;
  error: string;
  
  // History section
  clipboardHistory: string;
  noHistory: string;
  clearHistory: string;
  restore: string;
  copiedFromHistory: string;
  copiedFromHistoryBody: string;
  historyCleared: string;
  historyClearedBody: string;
  justNow: string;
  minutesAgo: string;
  hoursAgo: string;
  
  // Settings section
  autoStart: string;
  autoStartDesc: string;
  maxHistory: string;
  items: string;
  serverPort: string;
  portChangeHint: string;
  serverSettings: string;
  historySettings: string;
  enableHistory: string;
  enableHistoryDesc: string;
  monitorInterval: string;
  seconds: string;
  
  // Quick actions
  quickActions: string;
  
  // Toast messages
  serverStarted: string;
  serverStartedBody: (url: string) => string;
  serverStartFailed: string;
  serverStartFailedBody: (error: string) => string;
  serverStopped: string;
  serverStoppedBody: string;
  serverReady: string;
  serverReadyBody: (url: string) => string;
  
  // Console messages
  consoleInitializing: string;
  consoleUnloading: string;
  consoleServerStarted: (url: string) => string;

  // Error handling
  failedToLoadHistory: string;
  failedToClearHistory: string;
  failedToRestore: string;
}

const translations: Record<Locale, Translations> = {
  en: {
    loading: 'Loading...',
    initializing: 'Initializing...',
    
    // Tab navigation
    tabHistory: 'History',
    tabSettings: 'Settings',
    
    webServer: 'Web Server',
    enableWebInterface: 'Enable Web Interface',
    enableWebInterfaceDesc: 'Share clipboard via browser',
    showQR: 'Show QR Code',
    showQRDesc: 'Scan with phone to connect',
    openInBrowser: 'Open in Browser',
    
    currentClipboard: 'Current Clipboard',
    contentPreview: 'Content Preview',
    empty: '(empty)',
    clear: 'Clear',
    clearing: 'Clearing...',
    clipboardCleared: 'Clipboard Cleared',
    clipboardClearedBody: 'Clipboard content has been cleared',
    error: 'Error',
    
    // History section
    clipboardHistory: 'Clipboard History',
    noHistory: 'No clipboard history yet',
    clearHistory: 'Clear All',
    restore: 'Restore',
    copiedFromHistory: 'Restored',
    copiedFromHistoryBody: 'Content restored to clipboard',
    historyCleared: 'History Cleared',
    historyClearedBody: 'Clipboard history has been cleared',
    justNow: 'Just now',
    minutesAgo: 'm ago',
    hoursAgo: 'h ago',
    
    // Settings section
    autoStart: 'Auto Start Server',
    autoStartDesc: 'Start web server when plugin loads',
    maxHistory: 'Max History Items',
    items: 'items',
    serverPort: 'Server Port',
    portChangeHint: 'Port changes will take effect after restarting the device.',
    serverSettings: 'Server Settings',
    historySettings: 'History Settings',
    enableHistory: 'Enable Clipboard History',
    enableHistoryDesc: 'Automatically record clipboard changes',
    monitorInterval: 'Monitor Interval',
    seconds: 'seconds',
    
    // Quick actions
    quickActions: 'Quick Actions',
    
    serverStarted: 'Clipboard Server Started',
    serverStartedBody: (url) => `Access at ${url}`,
    serverStartFailed: 'Failed to start server',
    serverStartFailedBody: (error) => error || 'Unknown error',
    serverStopped: 'Clipboard Server Stopped',
    serverStoppedBody: 'Web interface is no longer available',
    serverReady: 'Clipboard Server Ready',
    serverReadyBody: (url) => `Access at ${url}`,
    
    consoleInitializing: 'Decky Clipboard initializing...',
    consoleUnloading: 'Decky Clipboard unloading...',
    consoleServerStarted: (url) => `Server started at: ${url}`,

    failedToLoadHistory: "Failed to load clipboard history",
    failedToClearHistory: "Failed to clear history",
    failedToRestore: "Failed to restore clipboard",
  },
  
  zh: {
    loading: '加载中...',
    initializing: '初始化中...',
    
    // Tab navigation
    tabHistory: '历史',
    tabSettings: '设置',
    
    webServer: 'Web 服务器',
    enableWebInterface: '启用 Web 界面',
    enableWebInterfaceDesc: '通过浏览器共享剪贴板',
    showQR: '显示二维码',
    showQRDesc: '手机扫码即可连接',
    openInBrowser: '在浏览器中打开',
    
    currentClipboard: '当前剪贴板',
    contentPreview: '内容预览',
    empty: '(空)',
    clear: '清空',
    clearing: '清空中...',
    clipboardCleared: '剪贴板已清空',
    clipboardClearedBody: '剪贴板内容已被清除',
    error: '错误',
    
    // History section
    clipboardHistory: '剪贴板历史',
    noHistory: '暂无剪贴板历史记录',
    clearHistory: '清空全部',
    restore: '恢复',
    copiedFromHistory: '已恢复',
    copiedFromHistoryBody: '内容已恢复到剪贴板',
    historyCleared: '历史已清空',
    historyClearedBody: '剪贴板历史记录已被清除',
    justNow: '刚刚',
    minutesAgo: '分钟前',
    hoursAgo: '小时前',
    
    // Settings section
    autoStart: '自动启动服务器',
    autoStartDesc: '插件加载时自动启动 Web 服务器',
    maxHistory: '最大历史记录数',
    items: '条',
    serverPort: '服务器端口',
    portChangeHint: '端口更改将在重启设备后生效。',
    serverSettings: '服务器设置',
    historySettings: '历史记录设置',
    enableHistory: '启用剪贴板历史',
    enableHistoryDesc: '自动记录剪贴板变更',
    monitorInterval: '监控间隔',
    seconds: '秒',
    
    // Quick actions
    quickActions: '快捷操作',
    
    serverStarted: '剪贴板服务器已启动',
    serverStartedBody: (url) => `访问地址: ${url}`,
    serverStartFailed: '启动服务器失败',
    serverStartFailedBody: (error) => error || '未知错误',
    serverStopped: '剪贴板服务器已停止',
    serverStoppedBody: 'Web 界面不再可用',
    serverReady: '剪贴板服务器就绪',
    serverReadyBody: (url) => `访问地址: ${url}`,
    
    consoleInitializing: 'Decky Clipboard 初始化中...',
    consoleUnloading: 'Decky Clipboard 卸载中...',
    consoleServerStarted: (url) => `服务器已启动: ${url}`,

    failedToLoadHistory: "加载剪贴板历史失败",
    failedToClearHistory: "清空历史失败",
    failedToRestore: "恢复剪贴板失败",
  },
};

/**
 * Detect system locale
 * Returns 'zh' for Chinese locales, 'en' for everything else
 */
function detectLocale(): Locale {
  // Check browser/system language
  const lang = navigator.language || (navigator as any).userLanguage || 'en';
  
  // Check if it's Chinese (zh, zh-CN, zh-TW, etc.)
  if (lang.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  
  return 'en';
}

// Current locale
let currentLocale: Locale = detectLocale();

/**
 * Get current translations
 */
export function t(): Translations {
  return translations[currentLocale];
}

/**
 * Get current locale
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Set locale (for future use if we add language selector)
 */
export function setLocale(locale: Locale): void {
  if (locale in translations) {
    currentLocale = locale;
  }
}
