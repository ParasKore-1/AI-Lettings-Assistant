import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_MAX_CHARS } from '@keyring/shared';
import { useDrafts } from '../../stores/drafts';
import { validateFiles } from './attachments';
import { Composer } from './Composer';

beforeEach(() => {
  useDrafts.setState({ drafts: {} });
});

function setup(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  const utils = render(<Composer draftKey="test" streaming={false} onSend={onSend} onStop={onStop} {...props} />);
  const box = screen.getByRole('textbox', { name: 'Message Keyring' });
  return { ...utils, onSend, onStop, box, user: userEvent.setup() };
}

describe('Composer', () => {
  it('sends on Enter and clears the input, keeping focus', async () => {
    const { box, onSend, user } = setup();
    await user.type(box, 'Hello there{Enter}');
    expect(onSend).toHaveBeenCalledWith('Hello there', []);
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
  });

  it('inserts a newline on Shift+Enter instead of sending', async () => {
    const { box, onSend, user } = setup();
    await user.type(box, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('line one\nline two');
  });

  it('does not send while an IME composition is active', () => {
    const { box, onSend } = setup();
    fireEvent.change(box, { target: { value: 'にほんご' } });
    fireEvent.compositionStart(box);
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229, isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.compositionEnd(box);
    // Safari fires Enter right after compositionend — still not a send.
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables Send when empty or whitespace-only', async () => {
    const { box, user } = setup();
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();
    await user.type(box, '   ');
    expect(send).toBeDisabled();
    await user.type(box, 'x');
    expect(send).toBeEnabled();
  });

  it('shows a character counter near the limit and blocks over-long messages', () => {
    const { box, onSend } = setup();
    fireEvent.change(box, { target: { value: 'a'.repeat(MESSAGE_MAX_CHARS - 10) } });
    expect(screen.getByText(new RegExp(`${(MESSAGE_MAX_CHARS - 10).toLocaleString('en-GB')} / `))).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'a'.repeat(MESSAGE_MAX_CHARS + 1) } });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('replaces Send with Stop while streaming; Esc stops', async () => {
    const { box, onStop, user } = setup({ streaming: true });
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Stop generating' }));
    expect(onStop).toHaveBeenCalledTimes(1);
    box.focus();
    await user.keyboard('{Escape}');
    expect(onStop).toHaveBeenCalledTimes(2);
  });

  it('opens the slash-command menu and completes with the keyboard', async () => {
    const { box, onSend, user } = setup();
    await user.type(box, '/');
    const listbox = screen.getByRole('listbox', { name: 'Slash commands' });
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(box).toHaveAttribute('aria-controls', listbox.id);
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(box).toHaveValue('/viewing ');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('filters slash commands and closes on Escape', async () => {
    const { box, user } = setup();
    await user.type(box, '/main');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('persists drafts per conversation', async () => {
    const { box, user, unmount } = setup();
    await user.type(box, 'unsent thought');
    expect(useDrafts.getState().drafts['test']).toBe('unsent thought');
    unmount();
    setup();
    expect(screen.getByRole('textbox', { name: 'Message Keyring' })).toHaveValue('unsent thought');
  });

  it('blocks sending with a reason (e.g. offline) but allows typing', async () => {
    const { box, onSend, user } = setup({ sendBlockedReason: 'You’re offline' });
    await user.type(box, 'hi{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('You’re offline')).toBeInTheDocument();
  });
});

describe('validateFiles', () => {
  const file = (name: string, type: string, size: number) =>
    new File([new Uint8Array(size)], name, { type });

  it('accepts images and PDFs within limits', () => {
    const { accepted, rejected } = validateFiles([file('a.png', 'image/png', 10), file('b.pdf', 'application/pdf', 10)], 0);
    expect(accepted).toHaveLength(2);
    expect(rejected).toHaveLength(0);
  });

  it('rejects other types, oversize, empty and too many files', () => {
    const { accepted, rejected } = validateFiles(
      [
        file('x.svg', 'image/svg+xml', 10),
        file('big.png', 'image/png', 6 * 1024 * 1024),
        file('empty.png', 'image/png', 0),
        file('ok1.png', 'image/png', 1),
        file('ok2.png', 'image/png', 1),
      ],
      3,
    );
    expect(accepted.map((f) => f.name)).toEqual(['ok1.png']);
    expect(rejected.map((r) => r.name)).toEqual(['x.svg', 'big.png', 'empty.png', 'ok2.png']);
  });
});
