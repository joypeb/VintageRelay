/**
 * Minimal `HTMLDialogElement` shim for jsdom.
 *
 * jsdom does not implement `showModal`, `show`, `close`, or `requestClose`, and
 * the Astryx `Dialog` calls `showModal()` when it opens, so component tests that
 * render the real dialog fail with "dialog.showModal is not a function".
 * Each method is defined only when the environment is missing it, so a jsdom
 * release with native support keeps its own implementation.
 */

if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;

  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }

  if (typeof proto.show !== 'function') {
    proto.show = function show(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }

  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement, returnValue?: string) {
      if (!this.open) {
        return;
      }
      this.removeAttribute('open');
      if (returnValue !== undefined) {
        this.returnValue = returnValue;
      }
      this.dispatchEvent(new Event('close'));
    };
  }

  if (typeof proto.requestClose !== 'function') {
    proto.requestClose = function requestClose(this: HTMLDialogElement, returnValue?: string) {
      const event = new Event('cancel', { cancelable: true });
      this.dispatchEvent(event);
      if (!event.defaultPrevented) {
        this.close(returnValue);
      }
    };
  }
}
