export type EventShellStatus = 'active' | 'closed';

export type ShellTabId = 'home' | 'search' | 'trades' | 'my-items';

export type EventShellVisibility = {
  tabs: ShellTabId[];
  manageEvent: boolean;
  registerItem: boolean;
};

export function getEventShellVisibility(
  status: EventShellStatus,
  isOrganizer: boolean,
): EventShellVisibility {
  return {
    tabs: ['home', 'search', 'trades', 'my-items'],
    manageEvent: status === 'active' && isOrganizer,
    registerItem: status === 'active',
  };
}
