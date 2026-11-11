// One id generator: unique within a session and across sessions (time + counter), with a readable prefix.
let seq = 0;
export const newKey = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
