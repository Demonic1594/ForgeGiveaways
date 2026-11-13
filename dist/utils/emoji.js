"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emojiMatches = emojiMatches;
/**
 * Whether a reaction emoji matches the configured entry emoji. The option may
 * be a unicode emoji, a custom emoji id, or a full `<:name:id>` string.
 */
function emojiMatches(emoji, want) {
    if (!want)
        return false;
    if (emoji.id && (emoji.id === want || want.endsWith(`:${emoji.id}>`)))
        return true;
    return !emoji.id && emoji.name === want || emoji.toString() === want;
}
//# sourceMappingURL=emoji.js.map