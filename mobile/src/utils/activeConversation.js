// Tracks which conversation's ChatScreen is currently mounted/focused, so
// the floating message toast overlay can skip showing a popup for a thread
// the driver is already looking at. Plain mutable object rather than React
// state/context, since it's read from outside the render tree (the toast
// overlay's poll loop) and doesn't need to trigger re-renders itself.
export const activeConversation = { current: null };
