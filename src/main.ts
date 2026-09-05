import './styles.css';
import { AppController } from './app/AppController';

let viewportSyncScheduled = false;
let lastVisualViewportHeight = -1;
let pendingSettleFrames = 0;
const standaloneMedia = window.matchMedia('(display-mode: standalone)');

function syncDisplayMode(): void {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  document.documentElement.dataset.displayMode = standaloneMedia.matches || iosStandalone
    ? 'standalone'
    : 'browser';
}

function syncVisualViewportHeight(): void {
  // `100vh` is the layout viewport on older mobile Safari and can remain
  // taller than the actually visible area while the browser bars are open.
  // Feed the live visual viewport into CSS so the complete 9:16 battlefield,
  // including both HUD edges, is recomputed whenever those bars move.
  const height = Math.round((window.visualViewport?.height ?? window.innerHeight) * 2) / 2;
  if (Math.abs(height - lastVisualViewportHeight) < 0.5) return;
  lastVisualViewportHeight = height;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
}

function scheduleVisualViewportSync(settleFrames = 0): void {
  pendingSettleFrames = Math.max(pendingSettleFrames, settleFrames);
  if (viewportSyncScheduled) return;
  viewportSyncScheduled = true;
  window.requestAnimationFrame(() => {
    viewportSyncScheduled = false;
    syncVisualViewportHeight();
    if (pendingSettleFrames > 0) {
      pendingSettleFrames -= 1;
      scheduleVisualViewportSync();
    }
  });
}

syncDisplayMode();
syncVisualViewportHeight();
scheduleVisualViewportSync(2);
window.addEventListener('resize', () => scheduleVisualViewportSync(), { passive: true });
window.addEventListener('orientationchange', () => scheduleVisualViewportSync(2), { passive: true });
window.addEventListener('pageshow', () => scheduleVisualViewportSync(2), { passive: true });
window.visualViewport?.addEventListener('resize', () => scheduleVisualViewportSync(), { passive: true });
standaloneMedia.addEventListener('change', () => {
  syncDisplayMode();
  scheduleVisualViewportSync(2);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleVisualViewportSync(2);
});

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing');

new AppController(root).start();
