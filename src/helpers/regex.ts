/**
 * Generates regex lookahead patterns for a list of keywords.
 * Each keyword is converted into a regex pattern ensuring all words appear in any order.
 *
 * @param keywordList - Array of keyword strings.
 * @returns Array of regex patterns as strings.
 */
export function lookAheadPatterns(keywordList: string[]): string[] {
    return keywordList.map(term => {
        // Split term into individual words
        const words = term.split(/\s+/);
        // Create a lookahead for each word to ensure it appears independently
        const lookaheads = words.map(word => `(?=.*\\b${escapeRegExp(word)}\\b)`);
        // Combine lookaheads into a single regex pattern
        return lookaheads.join('');
    });
}

/**
 * Escapes special characters in a string for use in a regular expression.
 *
 * @param text - The input string to escape.
 * @returns The escaped string.
 */
function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

