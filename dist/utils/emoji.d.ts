/**
 * Whether a reaction emoji matches the configured entry emoji. The option may
 * be a unicode emoji, a custom emoji id, or a full `<:name:id>` string.
 */
export declare function emojiMatches(emoji: {
    name: string | null;
    id: string | null;
    toString(): string;
}, want: string): boolean;
//# sourceMappingURL=emoji.d.ts.map