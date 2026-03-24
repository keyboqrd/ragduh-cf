type PlaceholderKey = string;

type InferPromptVars<T extends PlaceholderKey[]> = T extends []
  ? Record<string, never>
  : { [K in T[number]]: string | number | boolean };

type CompileFunction<T> =
  T extends Record<string, never> ? () => string : (variables: T) => string;

type PromptResult<T> = {
  compile: CompileFunction<T>;
};

export const prmpt = <K extends PlaceholderKey[]>(
  strings: TemplateStringsArray,
  ...keys: K
): PromptResult<InferPromptVars<K>> => {
  if (keys.length === 0) {
    return {
      compile: (() => strings[0]?.trim()) as CompileFunction<
        InferPromptVars<K>
      >,
    };
  }

  return {
    compile: ((variables: InferPromptVars<K>) => {
      let result = strings[0];

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key !== undefined) {
          result += variables[key] + (strings[i + 1] ?? "");
        }
      }

      return result?.trim();
    }) as CompileFunction<InferPromptVars<K>>,
  };
};
