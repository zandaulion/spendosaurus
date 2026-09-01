/**
 * Gestures & Touch Controller for Spendosaurus
 * Fluid swipe-right (advance status), swipe-left (options/delete), and pull-to-add
 */

export function bindCardSwipe(cardEl, { onSwipeRight, onSwipeLeft }) {
  const surface = cardEl.querySelector('.card-surface');
  const bgRight = cardEl.querySelector('.swipe-action-right');
  const bgLeft = cardEl.querySelector('.swipe-action-left');

  if (!surface) return;

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isSwiping = false;
  let isScrolling = false;
  const SWIPE_THRESHOLD = 70;

  function onTouchStart(e) {
    if (e.target.closest('button, input, select, a, .no-swipe')) return;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    currentX = 0;
    isSwiping = false;
    isScrolling = false;
    surface.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (isScrolling) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!isSwiping && !isScrolling) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        isScrolling = true;
        return;
      }
      if (Math.abs(dx) > 8) {
        isSwiping = true;
      }
    }

    if (isSwiping) {
      e.preventDefault();
      // Apply rubber banding beyond threshold
      let visualDx = dx;
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        const excess = Math.abs(dx) - SWIPE_THRESHOLD;
        visualDx = Math.sign(dx) * (SWIPE_THRESHOLD + excess * 0.35);
      }

      currentX = visualDx;
      surface.style.transform = `translateX(${visualDx}px)`;

      if (visualDx > 0) {
        if (bgRight) bgRight.style.opacity = Math.min(1, visualDx / SWIPE_THRESHOLD);
        if (bgLeft) bgLeft.style.opacity = 0;
      } else {
        if (bgLeft) bgLeft.style.opacity = Math.min(1, Math.abs(visualDx) / SWIPE_THRESHOLD);
        if (bgRight) bgRight.style.opacity = 0;
      }
    }
  }

  function onTouchEnd() {
    if (!isSwiping) return;
    surface.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)';

    if (currentX > SWIPE_THRESHOLD && onSwipeRight) {
      if (navigator.vibrate) navigator.vibrate(25);
      surface.style.transform = `translateX(120%)`;
      setTimeout(() => {
        onSwipeRight();
        surface.style.transform = 'translateX(0)';
      }, 200);
    } else if (currentX < -SWIPE_THRESHOLD && onSwipeLeft) {
      if (navigator.vibrate) navigator.vibrate(25);
      surface.style.transform = `translateX(-120%)`;
      setTimeout(() => {
        onSwipeLeft();
        surface.style.transform = 'translateX(0)';
      }, 200);
    } else {
      surface.style.transform = 'translateX(0)';
    }

    if (bgRight) bgRight.style.opacity = 0;
    if (bgLeft) bgLeft.style.opacity = 0;
    isSwiping = false;
  }

  surface.addEventListener('touchstart', onTouchStart, { passive: true });
  surface.addEventListener('touchmove', onTouchMove, { passive: false });
  surface.addEventListener('touchend', onTouchEnd, { passive: true });
  surface.addEventListener('touchcancel', onTouchEnd, { passive: true });
}

export function bindSheetDismiss(sheetOverlayEl, onDismiss) {
  const panel = sheetOverlayEl.querySelector('.sheet-panel');
  const handle = sheetOverlayEl.querySelector('.sheet-handle');
  if (!panel) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  const DISMISS_THRESHOLD = 90;

  const targetEl = handle || panel;

  targetEl.addEventListener('touchstart', (e) => {
    if (panel.scrollTop <= 0) {
      startY = e.touches[0].clientY;
      currentY = 0;
      isDragging = true;
      panel.style.transition = 'none';
    }
  }, { passive: true });

  targetEl.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      if (e.cancelable) e.preventDefault();
      currentY = dy;
      panel.style.transform = `translateY(${dy}px)`;
    } else {
      isDragging = false;
      panel.style.transform = 'translateY(0)';
    }
  }, { passive: false });

  function onEnd() {
    if (!isDragging) return;
    panel.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
    if (currentY > DISMISS_THRESHOLD) {
      if (navigator.vibrate) navigator.vibrate(20);
      onDismiss();
    } else {
      panel.style.transform = 'translateY(0)';
    }
    isDragging = false;
    currentY = 0;
  }

  targetEl.addEventListener('touchend', onEnd, { passive: true });
  targetEl.addEventListener('touchcancel', onEnd, { passive: true });
}
