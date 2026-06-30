/// <reference types="@songloft/plugin-sdk" />

// === 配置管理 ===
const CONFIG_KEY = 'coco_config';

// 初始化时预取配置
let cachedConfig: { serverUrl: string } | null = null;

async function getConfigAsync(): Promise<{ serverUrl: string }> {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = await songloft.storage.get(CONFIG_KEY);
    let serverUrl = '';
    
    if (raw != null) {
      const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const parsed = JSON.parse(str);
      if (parsed && parsed.serverUrl) {
        serverUrl = String(parsed.serverUrl).replace(/\/+$/, '');
      }
    }
    
    if (!serverUrl) {
      serverUrl = 'http://localhost:3000';
    }
    
    cachedConfig = { serverUrl };
    return cachedConfig;
  } catch (e) {
    songloft.log.error(`getConfigAsync error: ${String(e)}`);
    return { serverUrl: 'http://localhost:3000' };
  }
}

// === 获取 Songloft Token 和 Host URL ===
async function getSongloftToken(): Promise<string> {
  return await songloft.plugin.getToken();
}

async function getSongloftHostUrl(): Promise<string> {
  return await songloft.plugin.getHostUrl();
}

// === 调用 Songloft 内部 API ===
async function callSongloftApi(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getSongloftToken();
  const hostUrl = await getSongloftHostUrl();
  const url = `${hostUrl}${path}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json() as unknown;
}

// === 代理到 Coco Server ===
async function proxyToCoco(path: string, query: string): Promise<Record<string, unknown>> {
  const config = await getConfigAsync();
  const serverUrl = config.serverUrl;
  
  let targetUrl = `${serverUrl}${path}`;
  if (query) {
    targetUrl += `?${query}`;
  }

  try {
    const response = await fetch(targetUrl);
    
    // 注意：Songloft polyfill 中 response.headers 是普通对象，不是 Headers 实例
    const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
    
    // 如果是音频流，返回 URL 供前端直接访问
    if (contentType.includes('audio/') || contentType.includes('octet-stream')) {
      return { url: targetUrl, status: response.status, contentType: contentType };
    }

    // JSON 响应
    const data = await response.json() as Record<string, unknown>;
    return data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    songloft.log.error(`Proxy failed: ${msg}`);
    return { error: `Failed to connect to Coco Server: ${msg}` };
  }
}

/**
 * 从网易云音乐获取热搜
 * 后端直接调用，不受 CORS 限制
 */
async function fetchNeteaseHotSearch(): Promise<HTTPResponse> {
  try {
    // 网易云音乐热搜 API
    const response = await fetch('http://music.163.com/api/search/hot/web', {
      headers: {
        'Referer': 'https://music.163.com/',
        'Origin': 'https://music.163.com',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json() as Record<string, unknown>;
    
    if (data && data.data && data.data.hashes && Array.isArray((data.data as any).hashes)) {
      const hashes = (data.data as any).hashes.map((item: any) => ({
        searchWord: item.searchWord,
        score: item.score,
        content: item.content,
        sourceCount: item.sourceCount,
      }));
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes })
      };
    }
    
    throw new Error('Unexpected response format');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    songloft.log.error(`网易云热搜获取失败: ${msg}`);
    
    // 最终降级：返回预设热词
    const defaultWords = [
      { searchWord: '周杰伦', score: 99999 },
      { searchWord: '陈奕迅', score: 99998 },
      { searchWord: '林俊杰', score: 99997 },
      { searchWord: '邓紫棋', score: 99996 },
      { searchWord: '薛之谦', score: 99995 },
      { searchWord: 'Taylor Swift', score: 99994 },
      { searchWord: 'BTS', score: 99993 },
      { searchWord: '赵雷', score: 99992 },
      { searchWord: '毛不易', score: 99991 },
      { searchWord: '周深', score: 99990 },
    ];
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: defaultWords })
    };
  }
}

// === 请求处理 ===
async function onRequest(req: HTTPRequest): Promise<HTTPResponse> {
  const path = req.path;
  const method = req.method;
  const query = req.query || '';
  const body = req.body ? String(req.body) : '';

  // 配置 API
  if (path === '/api/config') {
    if (method === 'GET') {
      const config = await getConfigAsync();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) };
    }
    if (method === 'POST') {
      try {
        const data = JSON.parse(body);
        const serverUrl = String(data.serverUrl || '').replace(/\/+$/, '');
        if (!serverUrl) {
          return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'serverUrl is required' }) };
        }
        await songloft.storage.set(CONFIG_KEY, JSON.stringify({ serverUrl }));
        cachedConfig = { serverUrl };
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true }) };
      } catch (e) {
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid request body' }) };
      }
    }
  }

  // 搜索 API
  if (path === '/api/search' && method === 'GET') {
    const result = await proxyToCoco('/api/search', query);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  }

  // 音源 URL API (前端搜索时使用)
  if (path === '/api/url' && method === 'GET') {
    const result = await proxyToCoco('/api/url', query);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  }

  // 歌词 API (前端获取歌词)
  if (path === '/api/lyric-fetch' && method === 'GET') {
    const result = await proxyToCoco('/api/lyric', query);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  }

  // 下载 API (获取下载链接)
  if (path === '/api/download' && method === 'GET') {
    const config = await getConfigAsync();
    const serverUrl = config.serverUrl;
    const targetUrl = `${serverUrl}/api/download?${query}`;
    
    // 直接返回下载 URL，让浏览器通过 <a> 标签触发下载
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl })
    };
  }

  // 热门搜索 API
  if (path === '/api/hot-search' && method === 'GET') {
    try {
      const config = await getConfigAsync();
      const serverUrl = config.serverUrl;
      const targetUrl = `${serverUrl}/api/hot-search`;
      
      const response = await fetch(targetUrl);
      
      // 如果 Coco Server 返回 500 或不支持，降级到网易云音乐热搜
      if (response.status !== 200 || !response.ok) {
        songloft.log.info('Coco Server 不支持 hot-search，切换到网易云音乐热搜');
        return await fetchNeteaseHotSearch();
      }
      
      const data = await response.json() as Record<string, unknown>;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      songloft.log.info(`Coco Server hot-search 失败: ${msg}，切换到网易云音乐热搜`);
      return await fetchNeteaseHotSearch();
    }
  }

  // 音源 URL API (主程序播放歌曲时调用)
  if (path === '/api/music/url' && method === 'POST') {
    try {
      const data = JSON.parse(body);
      
      // source_data 可能已经是对象（QuickJS 自动解析）或 JSON 字符串
      let sourceData: any;
      if (typeof data.source_data === 'string') {
        sourceData = JSON.parse(data.source_data);
      } else {
        sourceData = data.source_data || {};
      }
      
      // 构建查询参数
      const params = new URLSearchParams();
      if (sourceData.id) {
        params.set('id', String(sourceData.id));
      }
      if (sourceData.provider) {
        params.set('provider', sourceData.provider);
      }
      if (sourceData.extra) {
        params.set('extra', typeof sourceData.extra === 'string' ? sourceData.extra : JSON.stringify(sourceData.extra));
      }
      
      const urlResult = await proxyToCoco('/api/url?' + params.toString(), '');
      
      if (!urlResult || !urlResult.url) {
        return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to get url' }) };
      }
      
      // 同时获取歌词
      let lyricText = '';
      try {
        const lyricParams = new URLSearchParams({
          id: String(sourceData.id),
          provider: sourceData.provider || 'netease',
        });
        if (sourceData.extra) {
          lyricParams.set('extra', typeof sourceData.extra === 'string' ? sourceData.extra : JSON.stringify(sourceData.extra));
        }
        const lyricResult = await proxyToCoco('/api/lyric?' + lyricParams.toString(), '');
        if (lyricResult && typeof lyricResult === 'object' && 'lrc' in lyricResult) {
          lyricText = String(lyricResult.lrc || '');
        }
      } catch (e) {
        // 歌词获取失败不影响播放
      }
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlResult.url, lyric_text: lyricText })
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      songloft.log.error(`Music URL error: ${msg}`);
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
    }
  }

  // 歌词 API
  if (path === '/api/lyric' && method === 'GET') {
    const result = await proxyToCoco('/api/lyric', query);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
  }

  // === Songloft 内部 API 代理 ===

  // 获取歌单列表
  if (path === '/songloft/playlists' && method === 'GET') {
    try {
      const result = await callSongloftApi('GET', '/api/v1/playlists');
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    } catch (e) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: String(e) }) };
    }
  }

  // 创建歌曲
  if (path === '/songloft/songs' && method === 'POST') {
    try {
      const data = JSON.parse(body);
      const result = await callSongloftApi('POST', '/api/v1/songs/remote', data);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    } catch (e) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: String(e) }) };
    }
  }

  // 添加歌曲到歌单
  if (path.startsWith('/songloft/playlists/') && path.endsWith('/songs') && method === 'POST') {
    try {
      const playlistIdMatch = path.match(/^\/songloft\/playlists\/(\d+)\/songs$/);
      if (!playlistIdMatch) {
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid playlist ID' }) };
      }
      const playlistId = playlistIdMatch[1];
      const data = JSON.parse(body);
      const result = await callSongloftApi('POST', `/api/v1/playlists/${playlistId}/songs`, data);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    } catch (e) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: String(e) }) };
    }
  }

  // 创建歌单
  if (path === '/songloft/playlists' && method === 'POST') {
    try {
      const data = JSON.parse(body);
      const result = await callSongloftApi('POST', '/api/v1/playlists', data);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    } catch (e) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: String(e) }) };
    }
  }

  // 404
  return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not Found' }) };
}

// === 生命周期 ===
async function onInit(): Promise<void> {
  songloft.log.info('COCO音乐下载器插件初始化完成');
  cachedConfig = await getConfigAsync();
}

async function onDeinit(): Promise<void> {
  songloft.log.info('COCO音乐下载器插件已停止');
}

// 暴露为全局（QuickJS 需要显式声明）
globalThis.onInit = onInit;
globalThis.onDeinit = onDeinit;
globalThis.onHTTPRequest = onRequest;
