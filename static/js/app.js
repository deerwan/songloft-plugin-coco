/**
 * COCO音乐下载器 - Songloft 插件前端
 * 
 * 通过 SongloftPlugin API 与后端通信，后端代理到用户配置的 Coco Server
 */

(function () {
  'use strict';

  // === 获取 Songloft 桥接 API ===
  const songloft = {
    playlists: {
      list: async () => {
        const res = await SongloftPlugin.apiGet('/songloft/playlists');
        return res || [];
      },
      create: async (playlist) => {
        return await SongloftPlugin.apiPost('/songloft/playlists', playlist);
      },
      addSongs: async (id, songIds) => {
        return await SongloftPlugin.apiPost(`/songloft/playlists/${id}/songs`, { song_ids: songIds });
      },
    },
    songs: {
      create: async (songs) => {
        return await SongloftPlugin.apiPost('/songloft/songs', songs);
      },
    },
  };

  // === 全局状态 ===
  const state = {
    config: { serverUrl: '' },
    configSaved: false,
    query: '',
    provider: 'netease',
    results: [],
    loading: false,
    offset: 0,
    hasMore: false,
    // Playback
    activeMusic: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    playMode: 'order', // order | loop | single
    // Fullscreen
    fullscreenOpen: false,
    coverObjectUrl: null,
    coverUrl: '',
    // Popups
    playModePanelOpen: false,
    volumePanelOpen: false,
    // Song menu
    selectedSongIndex: -1,
    selectedSong: null,
    // Import
    importPlaylists: [],
    // New playlist dialog
    newPlaylistCallback: null,
  };

  // === DOM 引用 ===
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const DOM = {
    configPanel: $('#config-panel'),
    mainApp: $('#main-app'),
    serverUrlInput: $('#server-url'),
    configStatus: $('#config-status'),
    saveConfigBtn: $('#save-config'),
    configToggleBtn: $('#config-toggle'),
    openConfigBtn: $('#open-config'),
    searchForm: $('#search-form'),
    searchInput: $('#search-input'),
    searchBtn: $('#search-btn'),
    searchText: $('#search-text'),
    searchLoading: $('#search-loading'),
    providerSelect: $('#provider-select'),
    hotTags: $('#hot-tags'),
    resultsSection: $('#results-section'),
    resultsList: $('#results-list'),
    resultsCount: $('#results-count'),
    loadMoreContainer: $('#load-more-container'),
    loadMoreBtn: $('#load-more-btn'),
    emptyState: $('#empty-state'),
    // Player bar
    playerBar: $('#player-bar'),
    playerBarCover: $('#playerBarCover'),
    playerBarCoverWrap: $('#playerBarCoverWrap'),
    currentSongTitle: $('#currentSongTitle'),
    currentSongArtist: $('#currentSongArtist'),
    playerBarLyric: $('#playerBarLyric'),
    playPauseBtn: $('#play-pause-btn'),
    playIcon: $('#play-icon'),
    pauseIcon: $('#pause-icon'),
    prevBtn: $('#prev-btn'),
    nextBtn: $('#next-btn'),
    progressFill: $('#progressFill'),
    progressThumb: $('#progressThumb'),
    progressTrack: $('#progressTrack'),
    currentTimeEl: $('#currentTime'),
    totalTimeEl: $('#totalTime'),
    audio: $('#audio-element'),
    // Fullscreen player
    fullscreenPlayer: $('#fullscreenPlayer'),
    fpBgImage: $('#fpBgImage'),
    fpCoverImg: $('#fpCoverImg'),
    fpCoverWrap: $('#fpCoverWrap'),
    fpSongTitle: $('#fpSongTitle'),
    fpSongArtist: $('#fpSongArtist'),
    fpProgressFill: $('#fpProgressFill'),
    fpProgressThumb: $('#fpProgressThumb'),
    fpCurrentTime: $('#fpCurrentTime'),
    fpTotalTime: $('#fpTotalTime'),
    fpPlayBtn: $('#fpPlayBtn'),
    fpPrevBtn: $('#fpPrevBtn'),
    fpNextBtn: $('#fpNextBtn'),
    fpPlayModeBtn: $('#fpPlayModeBtn'),
    fpVolumeBtn: $('#fpVolumeBtn'),
    fpLyricsContainer: $('#fpLyricsContainer'),
    // Popups
    playModePanel: $('#playModePanel'),
    playModeBackdrop: $('#playModeBackdrop'),
    volumePanel: $('#volumePanel'),
    volumeBackdrop: $('#volumeBackdrop'),
    volumeSlider: $('#volumeSlider'),
    volumePercent: $('#volumePercent'),
    muteBtn: $('#muteBtn'),
    // Song menu
    songMenu: $('#songMenu'),
    songMenuBackdrop: $('#songMenuBackdrop'),
    // Download quality
    downloadQualityPanel: $('#downloadQualityPanel'),
    downloadQualityBackdrop: $('#downloadQualityBackdrop'),
    downloadQualityList: $('#downloadQualityList'),
    // Import
    importPlaylistPanel: $('#importPlaylistPanel'),
    importPlaylistBackdrop: $('#importPlaylistBackdrop'),
    importPlaylistList: $('#importPlaylistList'),
    // New playlist dialog
    newPlaylistDialog: $('#newPlaylistDialog'),
    newPlaylistBackdrop: $('#newPlaylistBackdrop'),
    newPlaylistNameInput: $('#newPlaylistName'),
    confirmNewPlaylistBtn: $('#confirmNewPlaylist'),
    // Hot search
    hotSearchSection: $('#hotSearchSection'),
    hotSearchList: $('#hotSearchList'),
    hotSearchSource: $('#hotSearchSource'),
  };

  // === Songloft Plugin API 封装 ===
  const api = {
    async get(path) {
      const result = await SongloftPlugin.apiGet(path);
      return result;
    },
    async post(path, body) {
      const result = await SongloftPlugin.apiPost(path, body);
      return result;
    },
  };

  // === 配置管理 ===
  async function loadConfig() {
    try {
      const config = await api.get('/api/config');
      if (config && config.serverUrl) {
        state.config = config;
        state.configSaved = true;
        DOM.serverUrlInput.value = config.serverUrl;
        showMainApp();
      } else {
        showConfigPanel();
      }
    } catch (err) {
      showConfigPanel();
      showConfigStatus('加载配置失败: ' + err.message, 'error');
    }
  }

  async function saveConfig() {
    const url = DOM.serverUrlInput.value.trim().replace(/\/+$/, '');
    if (!url) {
      showConfigStatus('请输入 Coco Server 地址', 'error');
      return;
    }
    showConfigStatus('保存中...', 'info');
    try {
      const result = await api.post('/api/config', { serverUrl: url });
      if (result.success) {
        state.config.serverUrl = url;
        state.configSaved = true;
        showConfigStatus('配置保存成功！', 'success');
        setTimeout(() => showMainApp(), 500);
      } else {
        showConfigStatus(result.error || '保存失败', 'error');
      }
    } catch (err) {
      showConfigStatus('保存失败: ' + err.message, 'error');
    }
  }

  function showConfigPanel() {
    DOM.configPanel.style.display = '';
    DOM.mainApp.style.display = 'none';
  }

  function showMainApp() {
    DOM.configPanel.style.display = 'none';
    DOM.mainApp.style.display = '';
  }

  function showConfigStatus(msg, type) {
    DOM.configStatus.textContent = msg;
    DOM.configStatus.className = 'config-status status-' + type;
    if (type !== 'info') {
      setTimeout(() => {
        DOM.configStatus.textContent = '';
      }, 3000);
    }
  }

  // === 搜索功能 ===
  async function searchSongs(append = false) {
    if (!state.query.trim()) return;
    if (state.loading) return;

    state.loading = true;
    DOM.searchLoading.style.display = '';
    DOM.searchText.style.display = 'none';

    if (!append) {
      state.results = [];
      state.offset = 0;
      state.hasMore = false;
      DOM.resultsList.innerHTML = '';
    }

    try {
      const params = new URLSearchParams({
        q: state.query.trim(),
        provider: state.provider,
        limit: '20',
        offset: String(state.offset),
      });

      const data = await api.get('/api/search?' + params.toString());
      const items = Array.isArray(data.items) ? data.items : [];

      if (!append) {
        state.results = items;
        DOM.resultsSection.style.display = '';
        DOM.emptyState.style.display = 'none';
      } else {
        state.results = [...state.results, ...items];
      }

      state.offset += items.length;
      state.hasMore = items.length === 20;

      renderResults(append);
      DOM.loadMoreContainer.style.display = state.hasMore ? '' : 'none';
    } catch (err) {
      if (!append) {
        DOM.resultsList.innerHTML = '<div class="search-error">搜索失败: ' + escapeHtml(err.message) + '</div>';
      }
    } finally {
      state.loading = false;
      DOM.searchLoading.style.display = 'none';
      DOM.searchText.style.display = '';
    }
  }

  async function loadMore() {
    if (state.loading || !state.hasMore) return;
    state.offset = state.results.length;
    await searchSongs(true);
  }

  function renderResults(append = false) {
    const container = append ? DOM.resultsList : document.createDocumentFragment();
    
    if (!append) {
      DOM.resultsList.innerHTML = '';
    }

    const fragment = document.createDocumentFragment();
    state.results.forEach((item, index) => {
      const el = createResultItem(item, index);
      fragment.appendChild(el);
    });

    DOM.resultsList.appendChild(fragment);
    DOM.resultsCount.textContent = `找到 ${state.results.length} 首相关歌曲`;
  }

  function createResultItem(item, index) {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.dataset.index = index;
    div.dataset.id = item.id;

    const isActive = state.activeMusic && state.activeMusic.id === item.id;
    if (isActive) div.classList.add('active');

    const coverHtml = item.cover
      ? `<img src="${escapeHtml(item.cover)}" alt="${escapeHtml(item.title)}" class="result-cover-img" onerror="this.style.display='none'" />`
      : '<div class="result-cover-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>';

    const durationStr = item.duration ? formatDuration(item.duration) : '';

    div.innerHTML = `
      <div class="result-info">
        <div class="result-cover">${coverHtml}</div>
        <div class="result-text">
          <div class="result-title">${escapeHtml(item.title)}</div>
          <div class="result-artist">${escapeHtml(item.artist || '-')}${item.album ? ' · ' + escapeHtml(item.album) : ''}</div>
        </div>
      </div>
      <div class="result-actions">
        ${durationStr ? `<span class="song-item-duration">${escapeHtml(durationStr)}</span>` : ''}
        <button class="song-menu-btn" data-index="${index}" title="更多操作">
          <span class="material-symbols-outlined" style="font-size:18px">more_vert</span>
        </button>
      </div>
    `;

    // 点击整行播放
    div.addEventListener('click', (e) => {
      // 如果点击的是菜单按钮，不触发播放
      if (e.target.closest('.song-menu-btn')) return;
      playMusic(state.results[index]);
    });

    // 菜单按钮点击
    const menuBtn = div.querySelector('.song-menu-btn');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSongMenu(index, menuBtn);
    });

    return div;
  }

  // === 播放功能 ===
  async function playMusic(item) {
    if (state.resolvingMusicId === item.id) return;

    // 如果点击的是当前正在播放的歌曲，切换播放/暂停
    if (state.activeMusic && state.activeMusic.id === item.id) {
      togglePlayPause();
      return;
    }

    state.resolvingMusicId = item.id;
    state.activeMusic = item;

    // 更新播放器UI
    updatePlayerBar(item);
    updateActiveItem();

    // 先获取歌曲详情（包含歌词）
    let songDetail = null;
    try {
      songDetail = await songloft.songs.getById(item.id);
    } catch (e) {
      console.warn('获取歌曲详情失败:', e);
    }

    try {
      const params = new URLSearchParams({
        id: item.id,
        provider: item.provider || 'netease',
      });
      if (item.extra) {
        params.set('extra', JSON.stringify(item.extra));
      }

      const data = await api.get('/api/url?' + params.toString());

      if (data && data.url) {
        DOM.audio.src = data.url;
        DOM.audio.load();
        DOM.audio.play()
          .then(() => {
            state.playing = true;
            updatePlayButton();
            updateFullscreenPlayIcon();
            
            // 使用歌曲详情中的歌词
            const lyric = songDetail?.lyric || item.lyric;
            if (lyric) {
              currentLyrics = parseLrc(lyric);
              lastLyricIndex = -1;
              startLyricAnimation();
            } else {
              currentLyrics = [];
              lastLyricIndex = -1;
              updateLyricsDisplay(-1);
            }
            
            state.resolvingMusicId = null;
          })
          .catch((err) => {
            state.resolvingMusicId = null;
          });
      } else {
        state.resolvingMusicId = null;
      }
    } catch (err) {
      state.resolvingMusicId = null;
    }
  }

  function updatePlayerBar(item) {
    DOM.playerBar.style.display = '';
    DOM.currentSongTitle.textContent = item.title || '-';
    DOM.currentSongArtist.textContent = item.artist || '-';
    // 初始化歌词显示
    if (DOM.playerBarLyric) {
      DOM.playerBarLyric.textContent = item.lyric ? '有歌词' : '暂无歌词';
    }

    // 更新全屏播放器
    DOM.fpSongTitle.textContent = item.title || '-';
    DOM.fpSongArtist.textContent = item.artist || '-';

    // 封面
    if (item.cover) {
      loadCover(item.cover);
    }
  }

  function loadCover(url) {
    if (!url) return;
    
    // 如果 URL 相同则不重复加载
    if (url === state.coverUrl) return;
    
    // 清理旧的 Object URL
    if (state.coverObjectUrl) {
      URL.revokeObjectURL(state.coverObjectUrl);
      state.coverObjectUrl = null;
    }
    
    state.coverUrl = url;

    // 尝试直接设置 src
    DOM.playerBarCover.src = url;
    DOM.fpCoverImg.src = url;

    // 如果是远程 URL，尝试 fetch 获取 blob 作为模糊背景
    try {
      fetch(url)
        .then(res => res.blob())
        .then(blob => {
          state.coverObjectUrl = URL.createObjectURL(blob);
          DOM.fpBgImage.style.backgroundImage = `url(${state.coverObjectUrl})`;
        })
        .catch(() => {
          // fetch 失败不影响正常显示
        });
    } catch (e) {
      // 忽略错误
    }
  }

  function updateActiveItem() {
    $$('.result-item').forEach((el, i) => {
      el.classList.toggle('active', state.activeMusic && state.activeMusic.id === state.results[i].id);
    });
  }

  function togglePlayPause() {
    if (!DOM.audio.src) return;
    if (state.playing) {
      DOM.audio.pause();
      state.playing = false;
    } else {
      DOM.audio.play().catch(console.error);
      state.playing = true;
    }
    updatePlayButton();
    updateFullscreenPlayIcon();
  }

  function updatePlayButton() {
    if (state.playing) {
      DOM.playIcon.style.display = 'none';
      DOM.pauseIcon.style.display = '';
    } else {
      DOM.playIcon.style.display = '';
      DOM.pauseIcon.style.display = 'none';
    }
  }

  function updateFullscreenPlayIcon() {
    const path = state.playing
      ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z'
      : 'M8 5v14l11-7z';
    DOM.fpPlayBtn.querySelector('svg').innerHTML = `<path d="${path}"/>`;
    
    // 封面动画
    if (DOM.fpCoverWrap) {
      DOM.fpCoverWrap.classList.toggle('playing', !!state.playing);
    }
  }

  // === 全屏播放器 ===
  function openFullscreenPlayer() {
    if (state.fullscreenOpen) return;
    state.fullscreenOpen = true;
    DOM.fullscreenPlayer.classList.add('open');
    DOM.playerBar.classList.add('fp-hidden');
    
    // 渲染全屏歌词列表
    renderFullscreenLyrics();
  }
  
  function renderFullscreenLyrics() {
    if (!DOM.fpLyricsContainer) return;
    
    if (currentLyrics.length === 0) {
      DOM.fpLyricsContainer.innerHTML = '<div class="fp-lyrics-empty">暂无歌词</div>';
      return;
    }
    
    DOM.fpLyricsContainer.innerHTML = '';
    currentLyrics.forEach((line, index) => {
      const el = document.createElement('div');
      el.className = 'fp-lyric-line';
      el.textContent = line.text || '...';
      el.dataset.index = index;
      DOM.fpLyricsContainer.appendChild(el);
    });
  }

  function closeFullscreenPlayer() {
    if (!state.fullscreenOpen) return;
    state.fullscreenOpen = false;
    DOM.fullscreenPlayer.classList.remove('open');
    DOM.playerBar.classList.remove('fp-hidden');
    
    // 清除歌词高亮
    const activeEl = DOM.fpLyricsContainer?.querySelector('.fp-lyric-line.active');
    if (activeEl) activeEl.classList.remove('active');
  }

  // === 播放模式 ===
  const playModes = [
    { value: 'order', label: '顺序播放' },
    { value: 'loop', label: '列表循环' },
    { value: 'single', label: '单曲循环' },
  ];

  function togglePlayModePanel(triggerEl) {
    if (state.playModePanelOpen) {
      closePlayModePanel();
      return;
    }
    
    if (triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      DOM.playModePanel.style.top = (rect.bottom + 4) + 'px';
      DOM.playModePanel.style.right = '16px';
    } else {
      DOM.playModePanel.style.bottom = '120px';
      DOM.playModePanel.style.left = '16px';
    }
    
    DOM.playModeBackdrop.style.display = 'block';
    DOM.playModePanel.classList.add('show');
    state.playModePanelOpen = true;
    
    // 高亮当前模式
    $$('.play-mode-item').forEach(item => {
      item.classList.toggle('active', item.dataset.mode === state.playMode);
    });
  }

  function closePlayModePanel() {
    DOM.playModePanel.classList.remove('show');
    DOM.playModeBackdrop.style.display = 'none';
    state.playModePanelOpen = false;
  }

  function selectPlayMode(mode) {
    state.playMode = mode;
    closePlayModePanel();
    
    // 更新播放模式按钮图标
    updatePlayModeIcon();
  }

  function updatePlayModeIcon() {
    const modeInfo = playModes.find(m => m.value === state.playMode);
    if (!modeInfo) return;
    
    // 更新全屏按钮 title
    if (DOM.fpPlayModeBtn) {
      DOM.fpPlayModeBtn.title = modeInfo.label;
    }
  }

  // === 音量控制 ===
  function toggleVolumePanel() {
    if (state.volumePanelOpen) {
      closeVolumePanel();
      return;
    }
    
    DOM.volumePanel.style.bottom = '120px';
    DOM.volumePanel.style.right = '16px';
    
    DOM.volumeBackdrop.style.display = 'block';
    DOM.volumePanel.classList.add('show');
    state.volumePanelOpen = true;
    
    // 同步滑块值
    DOM.volumeSlider.value = Math.round(state.volume * 100);
    DOM.volumePercent.textContent = Math.round(state.volume * 100) + '%';
  }

  function closeVolumePanel() {
    DOM.volumePanel.classList.remove('show');
    DOM.volumeBackdrop.style.display = 'none';
    state.volumePanelOpen = false;
  }

  function toggleMute() {
    if (state.volume > 0) {
      DOM.audio.dataset.prevVolume = String(state.volume);
      state.volume = 0;
    } else {
      state.volume = parseFloat(DOM.audio.dataset.prevVolume || '1');
    }
    DOM.audio.volume = state.volume;
    DOM.volumeSlider.value = Math.round(state.volume * 100);
    DOM.volumePercent.textContent = Math.round(state.volume * 100) + '%';
    updateVolumeIcon();
  }

  function updateVolumeIcon() {
    const vol = Math.round(state.volume * 100);
    DOM.volumePercent.textContent = vol + '%';
    
    let iconPath = '';
    if (vol === 0) {
      iconPath = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';
    } else if (vol < 50) {
      iconPath = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    } else {
      iconPath = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    }
    
    const muteBtnSvg = DOM.muteBtn?.querySelector('svg');
    if (muteBtnSvg) {
      muteBtnSvg.innerHTML = iconPath;
    }
  }

  // === 歌曲操作菜单 ===
  function openSongMenu(index, triggerEl) {
    state.selectedSongIndex = index;
    state.selectedSong = state.results[index];

    const rect = triggerEl.getBoundingClientRect();
    DOM.songMenu.style.top = rect.bottom + 'px';
    DOM.songMenu.style.right = '16px';

    DOM.songMenuBackdrop.style.display = 'block';
    DOM.songMenu.classList.add('show');
  }

  function closeSongMenu() {
    DOM.songMenu.classList.remove('show');
    DOM.songMenuBackdrop.style.display = 'none';
    state.selectedSongIndex = -1;
  }

  // === 下载功能 ===
  async function startDownload() {
    if (!state.selectedSong) {
      return;
    }
    closeSongMenu();

    const item = state.selectedSong;
    const extra = (item && item.extra) ? item.extra : {};
    const qualityOptions = extra.qualityOptions || [];

    if (qualityOptions.length > 1) {
      // 显示音质选择面板
      showDownloadQualityPanel(qualityOptions, item);
    } else if (qualityOptions.length === 1) {
      // 只有一个选项，直接下载
      await downloadSong(item, qualityOptions[0].value);
    } else {
      // 没有音质选项，直接下载
      await downloadSong(item, null);
    }
  }

  function showDownloadQualityPanel(options, item) {
    DOM.downloadQualityList.innerHTML = '';
    
    options.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'quality-option';
      div.innerHTML = `
        <div class="quality-option-label">${escapeHtml(opt.label || opt.value)}</div>
        <div class="quality-option-desc">${escapeHtml(opt.format || '')} ${opt.bitrate ? '· ' + escapeHtml(opt.bitrate) : ''}</div>
      `;
      div.addEventListener('click', async () => {
        closeDownloadQualityPanel();
        await downloadSong(item, opt.value);
      });
      DOM.downloadQualityList.appendChild(div);
    });

    // 设置面板位置 - 在屏幕中央
    DOM.downloadQualityPanel.style.top = '50%';
    DOM.downloadQualityPanel.style.left = '50%';
    DOM.downloadQualityPanel.style.transform = 'translate(-50%, -50%)';
    
    DOM.downloadQualityBackdrop.style.display = 'block';
    DOM.downloadQualityPanel.classList.add('show');
  }

  function closeDownloadQualityPanel() {
    DOM.downloadQualityPanel.classList.remove('show');
    DOM.downloadQualityBackdrop.style.display = 'none';
  }

  async function downloadSong(item, qualityValue) {
    try {
      showMessage('正在准备下载...', 'info');
      
      const params = new URLSearchParams({
        id: item.id,
        provider: item.provider,
        filename: `${item.title}.${qualityValue === 'flac' ? 'flac' : 'mp3'}`,
      });
      if (qualityValue) {
        params.set('extra', JSON.stringify({ ...item.extra, selectedParser: qualityValue }));
      } else if (item.extra) {
        params.set('extra', JSON.stringify(item.extra));
      }

      // 先获取下载 URL
      const result = await api.get('/api/download?' + params.toString());
      
      if (result && result.url) {
        // 创建临时 <a> 标签触发下载
        const a = document.createElement('a');
        a.href = result.url;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showMessage('已开始下载', 'success');
      } else {
        showMessage('获取下载链接失败', 'error');
      }
    } catch (err) {
      showMessage('下载失败: ' + err.message, 'error');
    }
  }

  // === 导入功能 ===
  async function startImport() {
    if (!state.selectedSong) {
      return;
    }
    closeSongMenu();

    // 设置面板位置 - 在屏幕中央
    DOM.importPlaylistPanel.style.top = '50%';
    DOM.importPlaylistPanel.style.left = '50%';
    DOM.importPlaylistPanel.style.transform = 'translate(-50%, -50%)';
    
    // 加载歌单列表
    await loadImportPlaylists();
    
    if (DOM.importPlaylistPanel) {
      DOM.importPlaylistPanel.classList.add('show');
    }
  }

  async function loadImportPlaylists() {
    try {
      const result = await songloft.playlists.list();
      state.importPlaylists = Array.isArray(result) ? result : (result.playlists || []);
      
      renderImportPlaylistList();
    } catch (err) {
      state.importPlaylists = [];
      renderImportPlaylistList();
    }
  }

  function renderImportPlaylistList() {
    if (!DOM.importPlaylistList) {
      return;
    }
    
    DOM.importPlaylistList.innerHTML = '';
    
    const playlists = state.importPlaylists || [];
    
    for (let idx = 0; idx < playlists.length; idx++) {
      const pl = playlists[idx];
      const div = document.createElement('div');
      div.className = 'import-playlist-item';
      div.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>${escapeHtml(pl.name || '未命名')}</span>
      `;
      div.addEventListener('click', () => {
        importToPlaylist(pl.id);
      });
      DOM.importPlaylistList.appendChild(div);
    }
  }

  function closeImportPanel() {
    DOM.importPlaylistPanel.classList.remove('show');
    DOM.importPlaylistBackdrop.style.display = 'none';
  }

  /**
   * 获取歌词 LRC 文本
   */
  async function fetchLyricText(song) {
    try {
      const params = new URLSearchParams({
        id: song.id,
        provider: song.provider || 'netease',
      });
      if (song.extra) {
        params.set('extra', JSON.stringify(song.extra));
      }
      const result = await api.get('/api/lyric-fetch?' + params.toString());
      if (result && result.lrc) {
        return result.lrc;
      }
    } catch (e) {
      // 忽略错误
    }
    return null;
  }

  async function importToLibrary() {
    if (!state.selectedSong) {
      return;
    }
    closeImportPanel();
    
    try {
      const song = state.selectedSong;
      
      // 获取歌词
      const lyricText = await fetchLyricText(song);
      
      const songData = [{
        title: song.title,
        artist: song.artist || '',
        album: song.album || '',
        cover_url: song.cover || '',
        duration: 0,
        url: '',
        plugin_entry_path: 'coco-downloader',
        source_data: JSON.stringify({
          id: song.id,
          provider: song.provider,
          ...(song.extra && { extra: song.extra })
        }),
        ...(lyricText && { lyric: lyricText }),
      }];
      
      const result = await songloft.songs.create(songData);
      const songs = Array.isArray(result) ? result : (result.songs || []);
      
      if (songs && songs.length > 0) {
        showMessage('导入成功！', 'success');
      } else {
        showMessage('导入失败：未获取到歌曲ID', 'error');
      }
    } catch (err) {
      showMessage('导入失败: ' + err.message, 'error');
    }
  }

  async function importToPlaylist(playlistId) {
    if (!state.selectedSong) {
      return;
    }
    closeImportPanel();
    
    try {
      const song = state.selectedSong;
      
      // 获取歌词
      const lyricText = await fetchLyricText(song);
      
      const songData = [{
        title: song.title,
        artist: song.artist || '',
        album: song.album || '',
        cover_url: song.cover || '',
        duration: 0,
        url: '',
        plugin_entry_path: 'coco-downloader',
        source_data: JSON.stringify({
          id: song.id,
          provider: song.provider,
          ...(song.extra && { extra: song.extra })
        }),
        ...(lyricText && { lyric: lyricText }),
      }];
      
      const result = await songloft.songs.create(songData);
      const songs = Array.isArray(result) ? result : (result.songs || []);
      
      let songId = null;
      if (songs && songs.length > 0) {
        songId = songs[0].id;
      }
      
      if (!songId) {
        showMessage('导入失败：未获取到歌曲ID', 'error');
        return;
      }
      
      await songloft.playlists.addSongs(playlistId, [songId]);
      showMessage('导入成功！', 'success');
    } catch (err) {
      showMessage('导入失败: ' + err.message, 'error');
    }
  }

  async function createNewPlaylist() {
    const song = state.selectedSong;
    if (!song) {
      showMessage('请先选择一首歌曲', 'error');
      return;
    }
    
    closeImportPanel();
    
    openNewPlaylistDialog(async (name) => {
      try {
        // 先获取歌词
        const lyricText = await fetchLyricText(song);
        
        // 创建歌单
        const playlist = await songloft.playlists.create({ name: name, type: 'normal' });
        
        if (!playlist || !playlist.id) {
          showMessage('创建歌单失败', 'error');
          return;
        }
        
        // 创建歌曲并添加到歌单
        const songData = [{
          title: song.title,
          artist: song.artist || '',
          album: song.album || '',
          cover_url: song.cover || '',
          duration: 0,
          url: '',
          plugin_entry_path: 'coco-downloader',
          source_data: JSON.stringify({
            id: song.id,
            provider: song.provider,
            ...(song.extra && { extra: song.extra })
          }),
          ...(lyricText && { lyric: lyricText }),
        }];
        
        const result = await songloft.songs.create(songData);
        const songs = Array.isArray(result) ? result : (result.songs || []);
        
        let songId = null;
        if (songs && songs.length > 0) {
          songId = songs[0].id;
        }
        
        if (!songId) {
          showMessage('导入失败：未获取到歌曲ID', 'error');
          return;
        }
        
        await songloft.playlists.addSongs(playlist.id, [songId]);
        showMessage('导入成功！', 'success');
      } catch (err) {
        showMessage('导入失败: ' + err.message, 'error');
      }
    });
  }

  // === 消息提示 ===
  let snackbarTimer = null;
  
  function showMessage(msg, type = 'info') {
    if (!DOM.snackbar) return;
    
    // 清除之前的定时器
    if (snackbarTimer) {
      clearTimeout(snackbarTimer);
      snackbarTimer = null;
    }
    
    DOM.snackbar.textContent = msg;
    DOM.snackbar.classList.add('show');
    
    snackbarTimer = setTimeout(() => {
      DOM.snackbar.classList.remove('show');
      snackbarTimer = null;
    }, 3000);
  }

  // === 新建歌单对话框 ===
  function openNewPlaylistDialog(callback) {
    console.log('[COCO] openNewPlaylistDialog called');
    state.newPlaylistCallback = callback;
    DOM.newPlaylistNameInput.value = '';
    
    // 设置面板位置 - 在屏幕中央
    DOM.newPlaylistDialog.style.top = '50%';
    DOM.newPlaylistDialog.style.left = '50%';
    DOM.newPlaylistDialog.style.transform = 'translate(-50%, -50%)';
    DOM.newPlaylistBackdrop.style.display = 'block';
    DOM.newPlaylistDialog.classList.add('show');
    setTimeout(() => DOM.newPlaylistNameInput.focus(), 100);
  }

  function closeNewPlaylistDialog() {
    DOM.newPlaylistDialog.classList.remove('show');
    DOM.newPlaylistDialog.style.top = '';
    DOM.newPlaylistDialog.style.left = '';
    DOM.newPlaylistDialog.style.transform = '';
    DOM.newPlaylistBackdrop.style.display = 'none';
    state.newPlaylistCallback = null;
  }

  function confirmNewPlaylist() {
    const name = DOM.newPlaylistNameInput.value.trim();
    if (!name) {
      return;
    }
    const callback = state.newPlaylistCallback;
    closeNewPlaylistDialog();
    if (callback) {
      callback(name);
    }
  }

  // === 主题监听 ===
  function initTheme() {
    // 初始同步主题
    const theme = SongloftPlugin.getTheme();
    if (theme === 'dark') {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.classList.add('theme-dark');
    }
    // 监听主题变化
    SongloftPlugin.onThemeChange((newTheme) => {
      document.documentElement.dataset.theme = newTheme;
      document.documentElement.classList.remove('theme-light', 'theme-dark');
      document.documentElement.classList.add('theme-' + newTheme);
    });
  }

  // === 音频事件 ===
  function setupAudioEvents() {
    DOM.audio.addEventListener('timeupdate', () => {
      state.currentTime = DOM.audio.currentTime || 0;
      updateProgressBar();
    });

    DOM.audio.addEventListener('loadedmetadata', () => {
      state.duration = DOM.audio.duration || 0;
      updateTotalTime();
    });

    DOM.audio.addEventListener('ended', () => {
      playNext();
    });

    DOM.audio.addEventListener('play', () => {
      state.playing = true;
      updatePlayButton();
      updateFullscreenPlayIcon();
    });

    DOM.audio.addEventListener('pause', () => {
      state.playing = false;
      updatePlayButton();
      updateFullscreenPlayIcon();
    });
  }

  // === 歌词功能 ===
  let lyricFetchTimer = null;
  let currentLyrics = [];
  let lyricRAF = null;
  let lastLyricIndex = -1;

  /**
   * 获取并解析歌词
   * @param {string} lyricUrl - 歌词 URL
   */
  function fetchLyrics(lyricUrl) {
    if (!lyricUrl) return;
    
    if (lyricFetchTimer) {
      clearTimeout(lyricFetchTimer);
      lyricFetchTimer = null;
    }
    
    lyricFetchTimer = setTimeout(() => {
      lyricFetchTimer = null;
      
      SongloftPlugin.getToken().then(token => {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        fetch(lyricUrl, { headers })
          .then(res => res.blob())
          .then(blob => blob.text())
          .then(rawText => {
            let lrcText = rawText;
            try {
              const json = JSON.parse(rawText);
              if (json.lyric) lrcText = json.lyric;
              else if (json.success && json.data && json.data.lyric) lrcText = json.data.lyric;
              else if (json.data) lrcText = typeof json.data === 'string' ? json.data : '';
            } catch { /* not JSON */ }
            
            currentLyrics = parseLrc(lrcText);
            lastLyricIndex = -1;
            startLyricAnimation();
          })
          .catch(err => {
            console.warn('获取歌词失败:', err);
          });
      });
    }, 100);
  }
  
  /**
   * 通过插件 API 获取歌词
   */
  function fetchLyricsFromApi(params) {
    api.get('/api/lyric-fetch?' + params)
      .then(data => {
        if (data && data.lrc) {
          currentLyrics = parseLrc(data.lrc);
          lastLyricIndex = -1;
          startLyricAnimation();
        } else {
          currentLyrics = [];
          lastLyricIndex = -1;
          updateLyricsDisplay(-1);
        }
      })
      .catch(err => {
        console.warn('[COCO] 获取歌词失败:', err);
      });
  }

  /**
   * 解析 LRC 歌词
   */
  function parseLrc(lrcText) {
    if (!lrcText) return [];
    const lyrics = [];
    const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/g;
    let match;
    while ((match = regex.exec(lrcText)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      const time = minutes * 60 + seconds + ms / 1000;
      const text = match[4].trim();
      if (text) lyrics.push({ time, text });
    }
    lyrics.sort((a, b) => a.time - b.time);
    return lyrics;
  }

  /**
   * 获取当前歌词索引
   */
  function getCurrentLyricIndex(lyrics, position) {
    if (!lyrics || lyrics.length === 0 || position < 0) return -1;
    let result = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (position >= lyrics[i].time) result = i;
      else break;
    }
    return result;
  }

  /**
   * 开始歌词动画循环
   */
  function startLyricAnimation() {
    if (lyricRAF) return;
    
    function animate() {
      const position = DOM.audio.currentTime || 0;
      const newIndex = getCurrentLyricIndex(currentLyrics, position);
      
      if (newIndex !== lastLyricIndex) {
        lastLyricIndex = newIndex;
        updateLyricsDisplay(newIndex);
      }
      
      lyricRAF = requestAnimationFrame(animate);
    }
    
    lyricRAF = requestAnimationFrame(animate);
  }

  /**
   * 更新歌词显示
   */
  function updateLyricsDisplay(index) {
    // 底部播放器歌词
    if (DOM.playerBarLyric) {
      if (index >= 0 && currentLyrics[index]) {
        DOM.playerBarLyric.textContent = currentLyrics[index].text;
      } else {
        DOM.playerBarLyric.textContent = '暂无歌词';
      }
    }
    
    // 全屏播放器歌词高亮
    if (state.fullscreenOpen && DOM.fpLyricsContainer) {
      const prevEl = DOM.fpLyricsContainer.querySelector('.fp-lyric-line.active');
      if (prevEl) prevEl.classList.remove('active');
      
      if (index >= 0) {
        const lines = DOM.fpLyricsContainer.querySelectorAll('.fp-lyric-line');
        if (lines[index]) {
          lines[index].classList.add('active');
          scrollToLyric(index);
        }
      }
    }
  }

  /**
   * 滚动到指定歌词行
   */
  function scrollToLyric(index) {
    if (!DOM.fpLyricsContainer) return;
    const lines = DOM.fpLyricsContainer.querySelectorAll('.fp-lyric-line');
    if (!lines[index]) return;
    
    const containerHeight = DOM.fpLyricsContainer.clientHeight;
    const lineTop = lines[index].offsetTop;
    const targetScroll = lineTop - (containerHeight / 2) + 24;
    
    DOM.fpLyricsContainer.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: 'smooth'
    });
  }

  function updateProgressBar() {
    const percent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
    if (DOM.progressFill) DOM.progressFill.style.width = percent + '%';
    if (DOM.progressThumb) DOM.progressThumb.style.left = percent + '%';
    if (DOM.fpProgressFill) DOM.fpProgressFill.style.width = percent + '%';
    if (DOM.fpProgressThumb) DOM.fpProgressThumb.style.left = percent + '%';
    if (DOM.currentTimeEl) DOM.currentTimeEl.textContent = formatTime(state.currentTime);
    if (DOM.fpCurrentTime) DOM.fpCurrentTime.textContent = formatTime(state.currentTime);
  }

  function updateTotalTime() {
    if (DOM.totalTimeEl) DOM.totalTimeEl.textContent = formatTime(state.duration);
    if (DOM.fpTotalTime) DOM.fpTotalTime.textContent = formatTime(state.duration);
  }

  // 进度条点击
  if (DOM.progressTrack) {
    DOM.progressTrack.addEventListener('click', (e) => {
      if (state.duration > 0) {
        const rect = DOM.progressTrack.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        DOM.audio.currentTime = percent * state.duration;
      }
    });
  }

  // === 上一首/下一首 ===
  function playPrev() {
    if (state.results.length === 0 || !state.activeMusic) return;
    const currentIndex = state.results.findIndex(r => r.id === state.activeMusic.id);
    if (currentIndex > 0) {
      playMusic(state.results[currentIndex - 1]);
    }
  }

  function playNext() {
    if (state.results.length === 0 || !state.activeMusic) return;
    const currentIndex = state.results.findIndex(r => r.id === state.activeMusic.id);
    if (currentIndex >= 0 && currentIndex < state.results.length - 1) {
      playMusic(state.results[currentIndex + 1]);
    } else {
      state.playing = false;
      updatePlayButton();
      updateFullscreenPlayIcon();
    }
  }

  // === 工具函数 ===
  function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    const minutes = Math.floor(s / 60);
    const secs = s % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  function formatDuration(value) {
    // 如果已经是字符串格式（如 "03:45"），直接返回
    if (typeof value === 'string') {
      // 验证是否是有效的时间格式
      if (/^\d{1,2}:\d{2}$/.test(value) || /^\d{1,2}:\d{2}:\d{2}$/.test(value)) {
        return value;
      }
      // 其他字符串格式，尝试解析数字
      const num = parseInt(value, 10);
      if (!isNaN(num) && num > 0) {
        return formatTime(num);
      }
      return '';
    }
    // 数字格式（秒）
    if (typeof value === 'number' && value > 0) {
      return formatTime(value);
    }
    return '';
  }

  // === 全屏播放器左右滑动切换 ===
  function initFullscreenSwipe() {
    if (!DOM.fpPages) return;
    
    let startX = 0;
    DOM.fullscreenPlayer.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
    });
    
    DOM.fullscreenPlayer.addEventListener('touchend', e => {
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;
      if (Math.abs(diff) < 80) return;
      
      // 左右滑动切换封面/歌词
      const pages = DOM.fpPages.querySelectorAll('.fp-page');
      pages.forEach(page => page.scrollIntoView({ behavior: 'smooth' }));
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === 热门搜索 ===
  // 预设热门搜索词（所有 API 都失败时的最终降级方案）
  const DEFAULT_HOT_WORDS = [
    '周杰伦', '陈奕迅', '林俊杰', '邓紫棋', '薛之谦',
    'Taylor Swift', 'BTS', '赵雷', '毛不易', '周深',
    '流行', '新歌', '经典', '华语', '欧美',
  ];

  async function fetchHotSearch() {
    // 通过插件后端获取热搜（后端会自动处理降级逻辑）
    try {
      const result = await api.get('/api/hot-search');
      
      if (result && result.hashes && Array.isArray(result.hashes) && result.hashes.length > 0) {
        // 后端返回的格式：{ searchWord, score, ... }
        return result.hashes.map(h => h.searchWord || h.word);
      }
    } catch (e) {
      console.warn('[COCO] 获取热搜词失败:', e);
    }
    
    // 降级：返回预设热词
    return DEFAULT_HOT_WORDS;
  }

  function renderHotSearch(words) {
    if (!DOM.hotSearchList || !words || words.length === 0) {
      if (DOM.hotSearchSection) {
        DOM.hotSearchSection.style.display = 'none';
      }
      return;
    }
    
    DOM.hotSearchList.innerHTML = '';
    
    words.forEach((word, index) => {
      const div = document.createElement('div');
      div.className = 'hot-search-item';
      div.innerHTML = `
        <span class="hot-search-rank ${index < 3 ? 'top' : ''}">${index + 1}</span>
        <span class="hot-search-word">${escapeHtml(word)}</span>
      `;
      div.addEventListener('click', () => {
        DOM.searchInput.value = word;
        state.query = word;
        searchSongs(false);
      });
      DOM.hotSearchList.appendChild(div);
    });
    
    if (DOM.hotSearchSection) {
      DOM.hotSearchSection.style.display = '';
    }
  }

  async function loadHotSearch() {
    const words = await fetchHotSearch();
    renderHotSearch(words);
  }

  // === 事件绑定 ===
  function bindEvents() {
    // 配置
    DOM.saveConfigBtn.addEventListener('click', saveConfig);
    DOM.configToggleBtn.addEventListener('click', showMainApp);
    DOM.openConfigBtn.addEventListener('click', showConfigPanel);

    // 搜索
    DOM.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      state.query = DOM.searchInput.value;
      searchSongs(false);
    });

    // 热门标签
    $$('.hot-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        state.query = btn.dataset.query;
        DOM.searchInput.value = state.query;
        searchSongs(false);
      });
    });

    // 渠道选择
    DOM.providerSelect.addEventListener('change', () => {
      state.provider = DOM.providerSelect.value;
    });

    // 加载更多
    DOM.loadMoreBtn.addEventListener('click', loadMore);

    // 播放器控制
    DOM.playPauseBtn.addEventListener('click', togglePlayPause);
    DOM.prevBtn.addEventListener('click', playPrev);
    DOM.nextBtn.addEventListener('click', playNext);
    
    // 全屏播放器控制
    DOM.fpPlayBtn.addEventListener('click', togglePlayPause);
    DOM.fpPrevBtn.addEventListener('click', playPrev);
    DOM.fpNextBtn.addEventListener('click', playNext);
    DOM.fpPlayModeBtn.addEventListener('click', () => togglePlayModePanel());
    DOM.fpVolumeBtn.addEventListener('click', () => toggleVolumePanel());
    
    // 播放模式面板
    DOM.playModeBackdrop.addEventListener('click', closePlayModePanel);
    $$('.play-mode-item').forEach(item => {
      item.addEventListener('click', () => {
        selectPlayMode(item.dataset.mode);
      });
    });
    
    // 音量面板
    DOM.volumeBackdrop.addEventListener('click', closeVolumePanel);
    DOM.volumeSlider.addEventListener('input', () => {
      const vol = parseInt(DOM.volumeSlider.value);
      state.volume = vol / 100;
      DOM.audio.volume = state.volume;
      DOM.volumePercent.textContent = vol + '%';
      updateVolumeIcon();
    });

    // 新建歌单对话框
    DOM.newPlaylistBackdrop.addEventListener('click', closeNewPlaylistDialog);
    DOM.confirmNewPlaylistBtn.addEventListener('click', confirmNewPlaylist);
    DOM.newPlaylistNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        confirmNewPlaylist();
      } else if (e.key === 'Escape') {
        closeNewPlaylistDialog();
      }
    });
  }

  // === 初始化 ===
  async function init() {
    initTheme();
    bindEvents();
    setupAudioEvents();
    initFullscreenSwipe();
    await loadConfig();
    loadHotSearch();
  }

  // 挂载全局函数
  window.openFullscreenPlayer = openFullscreenPlayer;
  window.closeFullscreenPlayer = closeFullscreenPlayer;
  window.togglePlayModePanel = togglePlayModePanel;
  window.closePlayModePanel = closePlayModePanel;
  window.selectPlayMode = selectPlayMode;
  window.toggleVolumePanel = toggleVolumePanel;
  window.closeVolumePanel = closeVolumePanel;
  window.toggleMute = toggleMute;
  // 歌曲菜单
  window.openSongMenu = openSongMenu;
  window.closeSongMenu = closeSongMenu;
  window.startDownload = startDownload;
  window.startImport = startImport;
  window.closeDownloadQualityPanel = closeDownloadQualityPanel;
  window.closeImportPanel = closeImportPanel;
  window.importToLibrary = importToLibrary;
  window.createNewPlaylist = createNewPlaylist;
  window.closeNewPlaylistDialog = closeNewPlaylistDialog;
  // 热门搜索
  window.loadHotSearch = loadHotSearch;

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
