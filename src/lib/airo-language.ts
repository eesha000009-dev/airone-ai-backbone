import type { languages } from 'monaco-editor';

// ── .airo Language Definition for Monaco Editor ──────────────────
// Derived from the VS Code extension TextMate grammar

export const airoLanguageConfig: languages.LanguageConfiguration = {
  comments: {
    lineComment: '#',
    blockComment: ['##', '##'],
  },
  brackets: [
    ['{', '}'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    ['{', '}'],
    ['(', ')'],
    ['"', '"'],
  ],
  folding: {
    markers: {
      start: /^\s*##.*\b(start|begin)\b/,
      end: /^\s*##.*\b(end|finish)\b/,
    },
  },
  indentationRules: {
    increaseIndentPattern: /\{\s*$/,
    decreaseIndentPattern: /^\s*\}/,
  },
  wordPattern: /[a-zA-Z_][a-zA-Z0-9_-]*/,
};

export const airoMonarchLanguage: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.airo',

  // Keywords
  keywords: [
    'if',
    'else',
    'loop',
    'defi',
    'pin',
    'read',
    'read_for',
    'senddatato',
    'actfor',
    'call',
    'ask',
    'saveto',
    'init',
  ],

  // Mode constants
  modes: ['input', 'output'],

  // Operators
  operators: ['>=', '<=', '==', '!=', '>', '<', '='],

  // Symbols
  symbols: /[=><!]+/,
  delimiters: /[;.,(){}]/,

  // Escapes
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  // Main tokenizer
  tokenizer: {
    root: [
      // Block comments ## ... ##
      [/##/, 'comment.block.airo', '@blockComment'],

      // Line comments
      [/#(?![#])/, 'comment.line.airo', '@lineComment'],

      // Section headers: #library# #variables#
      [/^#(library|variables)#/, 'entity.name.section.airo'],

      // Strings
      [/"/, 'string.quoted.double.airo', '@stringDouble'],

      // Numbers
      [/\d+\.\d+/, 'constant.numeric.float.airo'],
      [/\d+/, 'constant.numeric.integer.airo'],

      // Pin definition keyword
      [/\bpin\b/, 'keyword.declaration.airo'],
      [/\bdefi\b/, 'keyword.declaration.airo'],

      // Control keywords
      [/\b(if|else|loop)\b/, 'keyword.control.airo'],

      // IO keywords
      [
        /\b(read|read_for|senddatato|actfor)\b/,
        'keyword.io.airo',
      ],

      // Other keywords
      [/\b(call|ask|saveto|init)\b/, 'keyword.other.airo'],

      // Mode constants
      [/\b(input|output)\b/, 'constant.language.mode.airo'],

      // Operators
      [/[>=<!]=?/, 'keyword.operator.airo'],

      // Delimiters
      [/[{}]/, 'punctuation.section.block.airo'],
      [/[()]/, 'punctuation.section.parens.airo'],
      [/;/, 'punctuation.separator.airo'],
      [/\./, 'punctuation.terminator.airo'],
      [/,/, 'punctuation.separator.comma.airo'],

      // Identifiers (with path slashes for module references)
      [
        /[a-zA-Z_][a-zA-Z0-9_\-]*(\/[a-zA-Z_][a-zA-Z0-9_\-]*)*(\.airo)?/,
        {
          cases: {
            '@keywords': 'keyword.$0.airo',
            '@modes': 'constant.language.mode.airo',
            '@default': 'variable.other.airo',
          },
        },
      ],
    ],

    blockComment: [
      [/##/, 'comment.block.airo', '@pop'],
      [/[^#]+/, 'comment.block.airo'],
      [/#/, 'comment.block.airo'],
    ],

    lineComment: [
      [/$/, 'comment.line.airo', '@pop'],
      [/[^#]+/, 'comment.line.airo'],
      [/#/, 'comment.line.airo'],
    ],

    stringDouble: [
      [/[^\\"]+/, 'string.quoted.double.airo'],
      [/@escapes/, 'constant.character.escape.airo'],
      [/\\./, 'string.quoted.double.airo.invalid'],
      [/"/, 'string.quoted.double.airo', '@pop'],
    ],
  },
};

// ── Theme Colors for .airo ───────────────────────────────────────

export const airoThemeColors: Record<string, string> = {
  'keyword.control.airo': '#c586c0',      // purple-pink for if/else/loop
  'keyword.declaration.airo': '#569cd6',   // blue for pin/defi
  'keyword.io.airo': '#4ec9b0',            // teal for read/act/send
  'keyword.other.airo': '#dcdcaa',         // yellow for call/ask/init
  'constant.language.mode.airo': '#4fc1ff', // light blue for input/output
  'entity.name.section.airo': '#d7ba7d',   // gold for #library# #variables#
  'string.quoted.double.airo': '#ce9178',  // orange for strings
  'constant.numeric.float.airo': '#b5cea8', // light green for floats
  'constant.numeric.integer.airo': '#b5cea8', // light green for ints
  'comment.line.airo': '#6a9955',          // green for line comments
  'comment.block.airo': '#6a9955',         // green for block comments
  'variable.other.airo': '#9cdcfe',        // light blue for identifiers
  'punctuation.section.block.airo': '#808080',   // gray for braces
  'punctuation.terminator.airo': '#808080',      // gray for dots
  'keyword.operator.airo': '#d4d4d4',     // light gray for operators
};
