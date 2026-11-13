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
    if (emoji.id)
        return emoji.id === want || want.endsWith(`:${emoji.id}>`) || emoji.toString() === want;
    // Unicode emoji may arrive with or without the U+FE0F variation selector
    // ("🎉" vs "🎉️"); treat both spellings as the same emoji.
    return !!emoji.name && strip(emoji.name) === strip(want);
}
const strip = (s) => s.replace(/\uFE0F/g, "");
//# sourceMappingURL=emoji.js.map