import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CloseEventDialog } from '@/components/event/CloseEventDialog';
import { renderWithClient } from '@/test/render';

const description = "Closing ends the exchange corner for everyone. Participants can no longer register clothes or make exchanges. This can't be undone.";

function renderDialog(options: { isOpen?: boolean; isPending?: boolean; errorMessage?: string } = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  renderWithClient(
    <CloseEventDialog
      isOpen={options.isOpen ?? true}
      isPending={options.isPending ?? false}
      errorMessage={options.errorMessage}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />,
  );
  return { onOpenChange, onConfirm };
}

describe('CloseEventDialog', () => {
  it('does not expose a closed dialog', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the settled effects and actions in order', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Close this event?' });
    expect(within(dialog).getByText(description, { exact: true })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/proposal/i);
    const confirm = within(dialog).getByRole('button', { name: 'Close event' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(confirm.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('cancels without confirming', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onConfirm } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dismisses on Escape', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('dismisses on a backdrop click', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    // Backdrop clicks target the dialog element itself.
    await user.click(screen.getByRole('dialog', { name: 'Close this event?' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ignores backdrop clicks while pending', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog({ isPending: true });
    // Backdrop clicks target the dialog element itself.
    await user.click(screen.getByRole('dialog', { name: 'Close this event?' }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('confirms once', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Close event' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('prevents actions and dismissal while pending', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onConfirm } = renderDialog({ isPending: true });
    const dialog = screen.getByRole('dialog', { name: 'Close this event?' });
    const confirm = within(dialog).getByRole('button', { name: 'Close event' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(confirm).not.toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(cancel).toBeDisabled();
    await user.click(confirm);
    confirm.focus();
    expect(confirm).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(cancel);
    await user.keyboard('{Escape}');
    // The shim dispatches the native cancel event used for close requests in jsdom.
    (dialog as HTMLDialogElement).requestClose();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('shows an error in an alert inside the dialog', () => {
    renderDialog({ errorMessage: 'Server says no.' });
    const dialog = screen.getByRole('dialog', { name: 'Close this event?' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Server says no.');
  });

  it('has no alert when there is no error', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Close this event?' });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });
});
