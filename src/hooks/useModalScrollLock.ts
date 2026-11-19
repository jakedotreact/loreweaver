import { useEffect } from 'react';

let activeLockCount = 0;
let savedStyles: {
  htmlOverflow: string;
  bodyOverflow: string;
  htmlOverscroll: string;
  bodyOverscroll: string;
  bodyPaddingRight: string;
} | null = null;

/**
 * Reference-counted scroll lock for modal dialogs.
 * Prevents wheel/touch/scroll-chaining from scrolling the window beneath open modals,
 * while safely supporting stacked/nested modals.
 */
export function useModalScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') return;

    if (activeLockCount === 0) {
      const html = document.documentElement;
      const body = document.body;
      savedStyles = {
        htmlOverflow: html.style.overflow,
        bodyOverflow: body.style.overflow,
        htmlOverscroll: html.style.overscrollBehavior,
        bodyOverscroll: body.style.overscrollBehavior,
        bodyPaddingRight: body.style.paddingRight,
      };

      const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      html.style.overscrollBehavior = 'none';
      body.style.overscrollBehavior = 'none';
      if (scrollbarWidth > 0) {
        const computedPadding = Number.parseFloat(
          window.getComputedStyle(body).paddingRight || '0',
        );
        body.style.paddingRight = `${computedPadding + scrollbarWidth}px`;
      }
    }

    activeLockCount += 1;

    return () => {
      activeLockCount = Math.max(0, activeLockCount - 1);
      if (activeLockCount === 0 && savedStyles) {
        const html = document.documentElement;
        const body = document.body;
        html.style.overflow = savedStyles.htmlOverflow;
        body.style.overflow = savedStyles.bodyOverflow;
        html.style.overscrollBehavior = savedStyles.htmlOverscroll;
        body.style.overscrollBehavior = savedStyles.bodyOverscroll;
        body.style.paddingRight = savedStyles.bodyPaddingRight;
        savedStyles = null;
      }
    };
  }, [isLocked]);
}

export function resetModalScrollLockForTests(): void {
  activeLockCount = 0;
  savedStyles = null;
}
