"use client";

// The @uki/ui pieces the public pages render from server components. The kit's barrel pulls in Radix
// and React contexts, which server components cannot import, so these come through this client
// boundary; their props are plain strings and elements.
export { Badge, Button, EvidenceCard, LiveWidget, LockToast } from "@uki/ui";
export { StatusDot } from "@uki/ui/proctoring/status-dot";
