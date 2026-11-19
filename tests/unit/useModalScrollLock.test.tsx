import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resetModalScrollLockForTests,
  useModalScrollLock,
} from '../../src/hooks/useModalScrollLock';

function LockProbe({ active }: { active: boolean }) {
  useModalScrollLock(active);
  return <div data-testid="lock-probe">{active ? 'locked' : 'unlocked'}</div>;
}

describe('useModalScrollLock', () => {
  beforeEach(() => {
    resetModalScrollLockForTests();
    document.documentElement.style.overflow = '';
    document.documentElement.style.overscrollBehavior = '';
    document.body.style.overflow = '';
    document.body.style.overscrollBehavior = '';
    document.body.style.paddingRight = '';
  });

  afterEach(() => {
    resetModalScrollLockForTests();
    document.documentElement.style.overflow = '';
    document.documentElement.style.overscrollBehavior = '';
    document.body.style.overflow = '';
    document.body.style.overscrollBehavior = '';
    document.body.style.paddingRight = '';
  });

  it('locks html and body scrolling while active and restores prior styles on close', () => {
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'visible';
    document.body.style.overscrollBehavior = 'auto';
    document.body.style.paddingRight = '8px';

    const { rerender, unmount } = render(<LockProbe active={true} />);

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overscrollBehavior).toBe('none');
    expect(document.body.style.overscrollBehavior).toBe('none');

    rerender(<LockProbe active={false} />);

    expect(document.documentElement.style.overflow).toBe('auto');
    expect(document.body.style.overflow).toBe('visible');
    expect(document.body.style.overscrollBehavior).toBe('auto');
    expect(document.body.style.paddingRight).toBe('8px');

    unmount();
  });

  it('adds scrollbar width compensation to body paddingRight when scrollbar is present', () => {
    const originalInnerWidth = window.innerWidth;
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'clientWidth',
    );

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1265,
    });
    document.body.style.paddingRight = '10px';

    const { unmount } = render(<LockProbe active={true} />);

    expect(document.body.style.paddingRight).toBe('25px');

    unmount();
    expect(document.body.style.paddingRight).toBe('10px');

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    });
    if (clientWidthDescriptor) {
      Object.defineProperty(
        document.documentElement,
        'clientWidth',
        clientWidthDescriptor,
      );
    } else {
      delete (document.documentElement as { clientWidth?: number }).clientWidth;
    }
  });

  it('maintains lock across stacked modals until the last modal closes', () => {
    const first = render(<LockProbe active={true} />);
    const second = render(<LockProbe active={true} />);

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    first.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    second.unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });
});
