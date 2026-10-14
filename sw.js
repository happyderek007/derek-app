/* ============================================================
   Service Worker —— 让 Derek作战指挥部 断网也能用
   策略：
     1) install   : 预缓存核心文件（App Shell）
     2) activate  : 清理旧版本缓存
     3) fetch     : 网络优先 + 失败回退缓存（保证内容最新，又能离线）
   ============================================================ */

const CACHE_VERSION = 'derek-v1';
const APP_SHELL = [
  './',            // 等价于 index.html
  './index.html',
  './manifest.webmanifest'
  // icon-192.png / icon-512.png 不在预缓存列表里，
  // 因为它们是按需加载的，首次请求到会被自动缓存（见 fetch 逻辑）。
];

/* ---------- install：预缓存核心文件 ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      console.log('[SW] 预缓存核心文件');
      return cache.addAll(APP_SHELL);
    }).then(function () {
      // 强制新的 SW 立即接管页面
      return self.skipWaiting();
    })
  );
});

/* ---------- activate：清理旧版本缓存 ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== CACHE_VERSION;
        }).map(function (key) {
          console.log('[SW] 删除旧缓存：', key);
          return caches.delete(key);
        })
      );
    }).then(function () {
      // 立即接管所有打开的页面
      return self.clients.claim();
    })
  );
});

/* ---------- fetch：网络优先，失败回退缓存 ---------- */
self.addEventListener('fetch', function (event) {
  var req = event.request;

  // 只处理 GET 请求（POST / 其他方法的提交不做缓存）
  if (req.method !== 'GET') return;

  // 跨域请求（如 CDN、第三方 API）走网络，失败不缓存
  if (!req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        // 网络成功：克隆响应存入缓存，再返回
        var resClone = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          // 只缓存 200 状态码的响应
          if (res.status === 200) {
            cache.put(req, resClone);
          }
        });
        return res;
      })
      .catch(function () {
        // 网络失败（断网）：尝试从缓存返回
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          // 兜底：连缓存里都没有，返回缓存的首页
          return caches.match('./index.html');
        });
      })
  );
});
