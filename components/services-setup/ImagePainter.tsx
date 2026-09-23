import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { ImagePainter, SliceRegion } from '@/lib/services-setup/prepare-images';

/**
 * A hidden canvas for the services setup's photos (web `prepare-images.ts` draws on the
 * browser's own canvas). The app's native build carries no image library, but it does carry a
 * WebView, and a WebView page has a canvas: it decodes the picture (applying the photo's
 * rotation, as a browser does), and draws each region the app planned as a JPEG, stepping the
 * quality down until the slice fits its share of the upload. The planning stays in TypeScript
 * (`planSlices`); this page only draws.
 */

const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><script>
(function () {
  var images = {};
  var seen = {};
  function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  function onMessage(e) {
    var msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (!msg || !msg.id || seen[msg.id]) return;
    seen[msg.id] = true;
    if (msg.type === 'load') load(msg);
    else if (msg.type === 'draw') draw(msg);
    else if (msg.type === 'release') { delete images[msg.handle]; }
  }
  document.addEventListener('message', onMessage);
  window.addEventListener('message', onMessage);
  function load(msg) {
    var img = new Image();
    img.onload = function () {
      images[msg.id] = img;
      post({ id: msg.id, ok: true, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = function () { post({ id: msg.id, ok: false }); };
    img.src = msg.dataUrl;
  }
  function draw(msg) {
    var img = images[msg.handle];
    if (!img) { post({ id: msg.id, ok: false }); return; }
    var out = [];
    for (var i = 0; i < msg.regions.length; i++) {
      var r = msg.regions[i];
      var scale = Math.min(1, msg.maxEdge / Math.max(img.naturalWidth, r.sh));
      var w = Math.max(1, Math.round(img.naturalWidth * scale));
      var h = Math.max(1, Math.round(r.sh * scale));
      var c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      var ctx = c.getContext('2d');
      if (!ctx) { post({ id: msg.id, ok: false }); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, r.sy, img.naturalWidth, r.sh, 0, 0, w, h);
      var got = null;
      var qualities = [0.86, 0.75, 0.62, 0.5];
      for (var q = 0; q < qualities.length; q++) {
        var d = c.toDataURL('image/jpeg', qualities[q]);
        var b64 = d.slice(d.indexOf(',') + 1);
        if (Math.floor((b64.length * 3) / 4) <= msg.maxBytes) { got = b64; break; }
      }
      c.width = 0;
      c.height = 0;
      if (!got) { post({ id: msg.id, ok: false }); return; }
      out.push(got);
    }
    post({ id: msg.id, ok: true, parts: out });
  }
  post({ id: 'ready', ok: true });
})();
</script></body></html>`;

const READY_TIMEOUT_MS = 10_000;
const LOAD_TIMEOUT_MS = 30_000;
const DRAW_TIMEOUT_MS = 90_000;

type Pending = { resolve: (msg: Record<string, unknown>) => void; timer: ReturnType<typeof setTimeout> };

export const ImagePainterHost = forwardRef<ImagePainter | null>(function ImagePainterHost(_props, ref) {
  const webRef = useRef<WebView>(null);
  const pending = useRef(new Map<string, Pending>());
  const ready = useRef<{ done: boolean; waiters: (() => void)[] }>({ done: false, waiters: [] });
  const seq = useRef(0);

  /** False when the page never came up (no WebView here): the caller then sends the picture as it is. */
  const whenReady = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (ready.current.done) {
          resolve(true);
          return;
        }
        const timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS);
        ready.current.waiters.push(() => {
          clearTimeout(timer);
          resolve(true);
        });
      }),
    [],
  );

  const request = useCallback(
    async (msg: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> => {
      if (!(await whenReady())) return { ok: false };
      seq.current += 1;
      const id = `r${Date.now().toString(36)}${seq.current}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.current.delete(id);
          resolve({ id, ok: false });
        }, timeoutMs);
        pending.current.set(id, { resolve, timer });
        webRef.current?.postMessage(JSON.stringify({ ...msg, id }));
      });
    },
    [whenReady],
  );

  const painter = useMemo<ImagePainter>(
    () => ({
      async load(dataUrl: string) {
        const res = await request({ type: 'load', dataUrl }, LOAD_TIMEOUT_MS);
        if (res.ok !== true) throw new Error('That picture could not be opened.');
        return { handle: String(res.id), width: Number(res.width) || 0, height: Number(res.height) || 0 };
      },
      async draw(handle: string, regions: SliceRegion[], maxBytes: number, maxEdge: number) {
        const res = await request({ type: 'draw', handle, regions, maxBytes, maxEdge }, DRAW_TIMEOUT_MS);
        return res.ok === true && Array.isArray(res.parts) ? (res.parts as string[]) : null;
      },
      release(handle: string) {
        seq.current += 1;
        webRef.current?.postMessage(JSON.stringify({ type: 'release', handle, id: `x${seq.current}` }));
      },
    }),
    [request],
  );

  useImperativeHandle(ref, () => painter, [painter]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.nativeEvent.data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (msg.id === 'ready') {
      ready.current.done = true;
      for (const w of ready.current.waiters.splice(0)) w();
      return;
    }
    const entry = pending.current.get(String(msg.id));
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.current.delete(String(msg.id));
    entry.resolve(msg);
  }, []);

  return (
    <View style={styles.host} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: PAGE }}
        onMessage={onMessage}
        javaScriptEnabled
        // A reload (the OS reclaimed the page) starts over: nothing in flight survives it.
        onContentProcessDidTerminate={() => webRef.current?.reload()}
        style={styles.web}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0,
    overflow: 'hidden',
    left: 0,
    top: 0,
  },
  web: {
    width: 2,
    height: 2,
    backgroundColor: 'transparent',
  },
});
