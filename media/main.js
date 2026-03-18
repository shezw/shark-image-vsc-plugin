(function () {
  const vscode = acquireVsCodeApi();
  const formFields = Array.from(document.querySelectorAll('input[name], select[name]'));
  const previewGroups = document.getElementById('preview-groups');
  const workspaceName = document.getElementById('workspace-name');
  const resourceDirectory = document.getElementById('resource-directory');
  const samplePath = document.getElementById('sample-path');
  const warningText = document.getElementById('warning-text');
  const languageToggle = document.getElementById('toggle-language');
  const clearCacheButton = document.getElementById('clear-cache');
  const imageModal = document.getElementById('image-modal');
  const imageModalBackdrop = document.getElementById('image-modal-backdrop');
  const imageModalClose = document.getElementById('image-modal-close');
  const imageModalImage = document.getElementById('image-modal-image');
  const imageModalTitle = document.getElementById('image-modal-title');
  const imageModalKicker = document.getElementById('image-modal-kicker');

  const translations = {
    en: {
      toggleLanguage: '中文',
      heroTitle: 'Workspace image compression',
      heroVersion: 'Version',
      heroCopy: 'Tune Sharp compression parameters, preview the result per image type, then run a single workspace batch.',
      clearCache: 'Clear cache',
      chooseDirectory: 'Choose directory',
      saveSettings: 'Save settings',
      compressNow: 'Compress now',
      workspace: 'Workspace',
      resourceDirectory: 'Resource directory',
      outputMode: 'Output mode',
      mirrorDirectory: 'Mirror directory',
      overwriteSource: 'Overwrite source',
      outputDirectory: 'Output directory',
      previewSampleCount: 'Preview samples per type',
      recursive: 'Recursive scan',
      preserveMetadata: 'Preserve metadata',
      quality: 'Quality',
      paletteQuality: 'Palette quality',
      compressionLevel: 'Compression level',
      effort: 'Effort',
      livePreview: 'LIVE PREVIEW',
      previewTitle: 'Three samples per row, grouped by image type',
      samplePath: 'Sample path',
      imagePreview: 'Image preview',
      closePreview: 'Close',
      clickToZoom: 'Click to enlarge',
      emptyState: 'Add sample images into the configured resource directory to see live preview results.',
      samples: 'samples',
      selectedSamples: 'selected',
      original: 'Original',
      compressed: 'Compressed',
      saved: 'saved',
      percentSaved: 'saved',
      previewFailedPrefix: 'Preview failed for'
    },
    zh: {
      toggleLanguage: 'EN',
      heroTitle: '工作区图片压缩',
      heroVersion: '版本',
      heroCopy: '调整 Sharp 压缩参数，按图片类型实时预览效果，然后一键执行工作区批量压缩。',
      clearCache: '清空缓存',
      chooseDirectory: '选择目录',
      saveSettings: '保存设置',
      compressNow: '立即压缩',
      workspace: '工作区',
      resourceDirectory: '资源目录',
      outputMode: '输出模式',
      mirrorDirectory: '镜像目录输出',
      overwriteSource: '覆盖源文件',
      outputDirectory: '输出目录',
      previewSampleCount: '每种类型预览数量',
      recursive: '递归扫描',
      preserveMetadata: '保留元数据',
      quality: '质量',
      paletteQuality: '调色板质量',
      compressionLevel: '压缩等级',
      effort: '压缩强度',
      livePreview: '实时预览',
      previewTitle: '每行一种图片类型，最多展示三张样例',
      samplePath: '样例绝对路径',
      imagePreview: '图片预览',
      closePreview: '关闭',
      clickToZoom: '点击查看大图',
      emptyState: '请向当前资源目录添加样例图片后查看实时预览。',
      samples: '张样例',
      selectedSamples: '已选',
      original: '原图',
      compressed: '压缩后',
      saved: '节省',
      percentSaved: '节省',
      previewFailedPrefix: '预览失败'
    }
  };

  let currentLanguage = 'en';

  let previewTimer = undefined;

  function formatBytes(bytes) {
    const absolute = Math.abs(bytes);
    if (absolute < 1024) {
      return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB'];
    let value = absolute / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const prefix = bytes < 0 ? '-' : '';
    return `${prefix}${value.toFixed(2)} ${units[unitIndex]}`;
  }

  function getTranslation(key) {
    return translations[currentLanguage][key] || translations.en[key] || key;
  }

  function formatPercent(value) {
    return `${value >= 0 ? value.toFixed(1) : `-${Math.abs(value).toFixed(1)}`} %`;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function applyTranslations() {
    document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';
    setText('hero-title', getTranslation('heroTitle'));
    setText('hero-copy', getTranslation('heroCopy'));
    setText('clear-cache', getTranslation('clearCache'));
    setText('choose-directory', getTranslation('chooseDirectory'));
    setText('save-settings', getTranslation('saveSettings'));
    setText('run-compression', getTranslation('compressNow'));
    setText('workspace-label', getTranslation('workspace'));
    setText('resource-directory-label', getTranslation('resourceDirectory'));
    setText('output-mode-label', getTranslation('outputMode'));
    setText('output-mode-mirror', getTranslation('mirrorDirectory'));
    setText('output-mode-overwrite', getTranslation('overwriteSource'));
    setText('output-directory-label', getTranslation('outputDirectory'));
    setText('preview-sample-count-label', getTranslation('previewSampleCount'));
    setText('recursive-label', getTranslation('recursive'));
    setText('preserve-metadata-label', getTranslation('preserveMetadata'));
    setText('jpeg-quality-label', getTranslation('quality'));
    setText('png-quality-label', getTranslation('paletteQuality'));
    setText('png-compression-level-label', getTranslation('compressionLevel'));
    setText('webp-quality-label', getTranslation('quality'));
    setText('webp-effort-label', getTranslation('effort'));
    setText('preview-eyebrow', getTranslation('livePreview'));
    setText('preview-title', getTranslation('previewTitle'));
    setText('sample-path-label', getTranslation('samplePath'));
    setText('image-modal-kicker', getTranslation('imagePreview'));
    setText('image-modal-close', getTranslation('closePreview'));
    languageToggle.textContent = getTranslation('toggleLanguage');
  }

  function openImageModal(src, alt) {
    imageModalImage.src = src;
    imageModalImage.alt = alt;
    imageModalTitle.textContent = alt;
    imageModal.classList.remove('hidden');
    imageModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeImageModal() {
    imageModal.classList.add('hidden');
    imageModal.setAttribute('aria-hidden', 'true');
    imageModalImage.removeAttribute('src');
    imageModalTitle.textContent = getTranslation('imagePreview');
    document.body.classList.remove('modal-open');
  }

  function serializeSettings() {
    const payload = {};
    for (const field of formFields) {
      if (field.type === 'checkbox') {
        payload[field.name] = field.checked;
      } else if (field.type === 'number' || field.type === 'range') {
        payload[field.name] = Number(field.value);
      } else {
        payload[field.name] = field.value;
      }
    }

    payload.resourceDirectory = resourceDirectory.textContent || '';
    return payload;
  }

  function schedulePreview() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(function () {
      vscode.postMessage({
        type: 'updatePreview',
        settings: serializeSettings()
      });
    }, 220);
  }

  function updateOutputs() {
    const outputs = document.querySelectorAll('[data-output-for]');
    outputs.forEach(function (output) {
      const name = output.getAttribute('data-output-for');
      const input = document.querySelector(`[name="${name}"]`);
      if (input) {
        output.textContent = input.value;
      }
    });
  }

  function renderPreview(preview) {
    closeImageModal();
    warningText.textContent = (preview.warnings || []).join(' ');
    previewGroups.innerHTML = '';

    if (!preview.groups || preview.groups.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = getTranslation('emptyState');
      previewGroups.appendChild(empty);
      return;
    }

    preview.groups.forEach(function (group) {
      const row = document.createElement('section');
      row.className = 'preview-row';

      const heading = document.createElement('div');
      heading.className = 'preview-row-heading';
      heading.innerHTML = `<h3>${group.label}</h3><span>${group.items.length} / ${group.availableCount} ${getTranslation('samples')}</span>`;
      row.appendChild(heading);

      const cards = document.createElement('div');
      cards.className = 'preview-row-cards';

      group.items.forEach(function (item) {
        const deltaClass = item.bytesSaved >= 0 ? 'positive' : 'negative';
        const card = document.createElement('article');
        card.className = 'preview-card';
        card.innerHTML = `
          <div class="preview-card-header">
            <strong>${item.fileName}</strong>
            <span class="pill ${deltaClass}">${formatBytes(item.bytesSaved)} · ${formatPercent(item.savedPercentage)} ${getTranslation('saved')}</span>
          </div>
          <div class="preview-images">
            <figure class="preview-image-figure">
              <button class="preview-image-button" type="button" data-preview-src="${item.originalDataUrl}" data-preview-alt="Original ${item.fileName}">
                <img src="${item.originalDataUrl}" alt="Original ${item.fileName}" />
              </button>
              <figcaption>${getTranslation('original')} · ${formatBytes(item.originalSize)}</figcaption>
            </figure>
            <figure class="preview-image-figure">
              <button class="preview-image-button" type="button" data-preview-src="${item.compressedDataUrl}" data-preview-alt="Compressed ${item.fileName}">
                <img src="${item.compressedDataUrl}" alt="Compressed ${item.fileName}" />
              </button>
              <figcaption>${getTranslation('compressed')} · ${formatBytes(item.compressedSize)}</figcaption>
            </figure>
          </div>
          <p class="preview-zoom-hint">${getTranslation('clickToZoom')}</p>
        `;
        cards.appendChild(card);
      });

      row.appendChild(cards);
      previewGroups.appendChild(row);
    });
  }

  function applyState(message) {
    currentLanguage = String(message.locale || '').toLowerCase().startsWith('zh') ? 'zh' : currentLanguage;
    workspaceName.textContent = message.workspaceName;
    resourceDirectory.textContent = message.preview.sourceDirectory;
    resourceDirectory.title = message.preview.resolvedSourceDirectory || message.preview.sourceDirectory;
    samplePath.textContent = message.preview.resolvedSourceDirectory || '-';
    samplePath.title = message.preview.resolvedSourceDirectory || '';
    setText('hero-version', `${getTranslation('heroVersion')} v${message.version}`);

    formFields.forEach(function (field) {
      const value = message.settings[field.name];
      if (field.type === 'checkbox') {
        field.checked = Boolean(value);
      } else {
        field.value = String(value);
      }
    });

    updateOutputs();
    applyTranslations();
    renderPreview(message.preview);
  }

  formFields.forEach(function (field) {
    field.addEventListener('input', function () {
      updateOutputs();
      schedulePreview();
    });
    field.addEventListener('change', schedulePreview);
  });

  document.getElementById('save-settings').addEventListener('click', function () {
    vscode.postMessage({
      type: 'saveSettings',
      settings: serializeSettings()
    });
  });

  document.getElementById('run-compression').addEventListener('click', function () {
    vscode.postMessage({
      type: 'runCompression',
      settings: serializeSettings()
    });
  });

  document.getElementById('choose-directory').addEventListener('click', function () {
    vscode.postMessage({ type: 'chooseDirectory' });
  });

  clearCacheButton.addEventListener('click', function () {
    window.clearTimeout(previewTimer);
    vscode.setState(undefined);
    previewGroups.innerHTML = '';
    warningText.textContent = '';
    vscode.postMessage({
      type: 'clearCache',
      settings: serializeSettings()
    });
  });

  previewGroups.addEventListener('click', function (event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    const target = event.target.closest('[data-preview-src]');
    if (!target) {
      return;
    }

    openImageModal(target.getAttribute('data-preview-src'), target.getAttribute('data-preview-alt') || getTranslation('imagePreview'));
  });

  imageModalBackdrop.addEventListener('click', closeImageModal);
  imageModalClose.addEventListener('click', closeImageModal);

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !imageModal.classList.contains('hidden')) {
      closeImageModal();
    }
  });

  languageToggle.addEventListener('click', function () {
    currentLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
    applyTranslations();
    const state = vscode.getState();
    if (state && state.preview) {
      renderPreview(state.preview);
    }
  });

  window.addEventListener('message', function (event) {
    const message = event.data;
    if (message.type === 'state') {
      vscode.setState(message);
      applyState(message);
      return;
    }

    if (message.type === 'error') {
      previewGroups.innerHTML = '';
      warningText.textContent = message.message;
    }
  });

  applyTranslations();
  vscode.postMessage({ type: 'requestState' });
})();