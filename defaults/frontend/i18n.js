// Internationalization support for web frontend
const i18n = {
    locale: 'en',
    
    // Auto-detect locale from browser
    detect() {
        const browserLang = navigator.language || navigator.userLanguage;
        this.locale = browserLang.startsWith('zh') ? 'zh' : 'en';
        return this.locale;
    },
    
    // Get all translations for current locale
    t() {
        return this.translations[this.locale];
    },
    
    translations: {
        en: {
            clipboardManager: 'Clipboard Manager',
            syncHint: 'Sync content between your devices and Steam Deck',
            menuClipboard: 'Clipboard',
            fromDeck: 'From Steam Deck',
            toDeck: 'To Steam Deck',
            refresh: 'Refresh',
            refreshing: 'Refreshing...',
            copyToDevice: 'Copy to Device',
            clear: 'Clear',
            sendToDeck: 'Send to Deck',
            sending: 'Sending...',
            placeholder: 'Type text or paste image here...',
            imageReady: 'Image ready to send',
            
            // Toasts / Status
            empty: '(Clipboard is empty)',
            copied: 'Copied to clipboard',
            sent: 'Sent to Steam Deck',
            error: 'Operation failed',
            networkError: 'Network error',
            nothingToCopy: 'Nothing to copy',
            notImage: 'Not an image file',
            gifNotSupported: 'GIF images are not supported',
            httpsRequired: 'Image copy requires HTTPS or Localhost'
        },
        zh: {
            clipboardManager: '剪贴板管理',
            syncHint: '在您的设备和 Steam Deck 之间同步内容',
            menuClipboard: '剪贴板',
            fromDeck: '来自 Steam Deck',
            toDeck: '发送到 Steam Deck',
            refresh: '刷新',
            refreshing: '刷新中...',
            copyToDevice: '复制到本机',
            clear: '清空',
            sendToDeck: '发送到 Steam Deck',
            sending: '发送中...',
            placeholder: '在此输入文本或粘贴图片...',
            imageReady: '图片已准备好发送',
            
            // Toasts / Status
            empty: '(剪贴板为空)',
            copied: '已复制到剪贴板',
            sent: '已发送到 Steam Deck',
            error: '操作失败',
            networkError: '网络错误',
            nothingToCopy: '没有可复制的内容',
            notImage: '不是图片文件',
            gifNotSupported: '不支持 GIF 图片',
            httpsRequired: '复制图片需要 HTTPS 或 Localhost'
        }
    }
};

// Initialize locale on load
i18n.detect();
