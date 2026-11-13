/**
 * Whether a reaction emoji matches the configured entry emoji. The option may
 * be a unicode emoji, a custom emoji id, or a full `<:name:id>` string.
 */
export function emojiMatches(emoji: { name: string | null, id: string | null, toString(): string }, want: string) {
    if (!want) return false
    if (emoji.id && (emoji.id === want || want.endsWith(`:${emoji.id}>`))) return true
    return !emoji.id && emoji.name === want || emoji.toString() === want
}
