declare module 'tree-sitter-javascript' {
  const grammar: {
    language: unknown;
    name: string;
  };

  export = grammar;
}

declare module 'tree-sitter-typescript' {
  const grammars: {
    tsx: {
      language: unknown;
      name: string;
    };
    typescript: {
      language: unknown;
      name: string;
    };
  };

  export = grammars;
}
